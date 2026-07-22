export function settledCheckoutAmountCents(
  amountTotal: unknown,
  fallbackAmountCents: number,
): number {
  return typeof amountTotal === "number" &&
    Number.isInteger(amountTotal) &&
    amountTotal >= 0
    ? amountTotal
    : fallbackAmountCents;
}
