<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## User direction: development v2

- Build a simpler version of the current project for development and testing.
- Keep the development UI under `/v2/`. Reuse the existing `/api/` endpoints, providers, hooks, and deployed contracts; do not duplicate or version the backend just for a different UI.
- Keep the existing application available separately.
- Use a black-and-white palette with neutral grays and generous, consistent spacing for v2.
- Aim for an extremely clean, button-focused UI. Omit marketing copy, explanatory paragraphs, decorative panels, and unnecessary secondary text.
- Keep only short action labels, essential values, loading/error feedback, and accessible labels needed to test features clearly.
- Reuse existing contracts, hooks, and functionality where practical; avoid unnecessary new infrastructure.
- Work economically: concise updates, focused file reads, small changes, and relevant checks. Minimize token use without skipping necessary verification.
- The development UI reuses the existing feature panels with scoped presentation overrides. Keep errors, transaction status, prices, and required controls visible.
