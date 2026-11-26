import { cookies, headers } from "next/headers";

import { BETA_COOKIE, BETA_COOKIE_MAX_AGE, betaConfigured, tokenForCode, validToken } from "@/lib/beta-gate";

/** Whether this browser may connect a wallet, and whether codes are being accepted. */
export async function GET() {
  const unlocked = await validToken((await cookies()).get(BETA_COOKIE)?.value);
  return Response.json({ unlocked, open: betaConfigured() }, { headers: { "Cache-Control": "no-store" } });
}

/** Per-IP attempt limit, so codes can't be brute-forced. Per server instance. */
const attempts = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS = 8;

function limited(ip: string) {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > MAX_ATTEMPTS;
}

/** Trade a beta code for the signed access cookie. */
export async function POST(request: Request) {
  if (!betaConfigured()) return Response.json({ error: "The beta is closed right now." }, { status: 503 });

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (limited(ip)) return Response.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });

  let code = "";
  try {
    code = String((await request.json())?.code ?? "");
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const token = await tokenForCode(code);
  if (!token) return Response.json({ error: "That code doesn't work." }, { status: 401 });

  (await cookies()).set(BETA_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BETA_COOKIE_MAX_AGE,
  });
  return Response.json({ unlocked: true });
}
