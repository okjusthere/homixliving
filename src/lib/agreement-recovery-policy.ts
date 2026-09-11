// Finalization failures retain the collected signatures and must not start a new envelope.
export function canRestartAgreement(status: string) {
  return ["declined", "voided", "expired"].includes(status);
}

export function agreementNeedsAttention(status: string) {
  return canRestartAgreement(status) || status === "failed";
}
