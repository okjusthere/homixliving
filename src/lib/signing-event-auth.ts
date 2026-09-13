import { createHmac, timingSafeEqual } from "node:crypto";
export function verifySigningEvent(
  body: string,
  timestamp: string | null,
  signature: string | null,
  secret: string | undefined,
  now = Date.now(),
) {
  if (
    !secret ||
    secret.length < 32 ||
    !timestamp ||
    !/^\d{10,12}$/.test(timestamp) ||
    !signature ||
    !/^[a-f0-9]{64}$/.test(signature)
  )
    return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}
