export function anniversaryWindow(startValue: string | null, effectiveDate: string) {
  const start = /^\d{4}-\d{2}-\d{2}$/.test(startValue || "") ? startValue! : effectiveDate;
  const [, month, day] = start.split("-").map(Number);
  const year = Number(effectiveDate.slice(0, 4));
  let windowStart = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (windowStart > effectiveDate) {
    windowStart = `${year - 1}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const nextYear = Number(windowStart.slice(0, 4)) + 1;
  return {
    start: windowStart,
    end: `${nextYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

export function teamTermsSelection(input: {
  effectiveDate: string;
  anniversaryStart: string | null;
  joinedAt: string | null;
  frozenConfigId: number | null;
  frozenEffectiveFrom: string | null;
}) {
  const window = anniversaryWindow(input.anniversaryStart || input.joinedAt, input.effectiveDate);
  const frozenApplies = Boolean(
    input.frozenConfigId &&
      input.frozenEffectiveFrom &&
      input.frozenEffectiveFrom >= window.start &&
      input.frozenEffectiveFrom <= input.effectiveDate,
  );
  return {
    window,
    frozenConfigId: frozenApplies ? input.frozenConfigId : null,
    // Existing members adopt the latest published team terms only when their
    // next anniversary cycle starts.
    configCutoff: frozenApplies ? input.frozenEffectiveFrom! : window.start,
  };
}
