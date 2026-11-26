/**
 * Proof that a browser holds an open gift's code, so a gift link can stand in
 * for a beta code (app/api/beta/gift). The code never leaves the browser: it
 * signs this message with the code's key; the server recovers the signer and
 * checks CollectPacks has an open gift for it.
 */
export const GIFT_SIGNIN_MAX_AGE = 10 * 60; // seconds

export const giftSigninMessage = (issuedAt: number) => `Grailio: sign in with a gift (${issuedAt})`;
