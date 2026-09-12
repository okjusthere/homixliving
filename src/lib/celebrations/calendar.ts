export const BIRTHDAY_TIMEZONE = "America/New_York";
export function nyDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BIRTHDAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function validBirthday(month: number, day: number) {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
export function birthdayDate(month: number, day: number, year: number): string {
  if (!validBirthday(month, day)) throw new Error("Invalid birthday");
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const observedDay = month === 2 && day === 29 && !leap ? 28 : day;
  return `${year}-${String(month).padStart(2, "0")}-${String(observedDay).padStart(2, "0")}`;
}
export function daysBetween(start: string, end: string) {
  // Calendar days, independent of DST or the server's timezone.
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86400000,
  );
}
export function nextBirthday(month: number, day: number, today = nyDate()) {
  const year = Number(today.slice(0, 4));
  const date = birthdayDate(month, day, year);
  return date < today ? birthdayDate(month, day, year + 1) : date;
}

export function validJoinDate(value: string, today = nyDate()) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    value < "1900-01-01" ||
    value > today
  )
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function nextAnniversary(joinedOn: string, today = nyDate()) {
  const next = nextBirthday(
    Number(joinedOn.slice(5, 7)),
    Number(joinedOn.slice(8, 10)),
    today,
  );
  return Number(next.slice(0, 4)) <= Number(joinedOn.slice(0, 4))
    ? birthdayDate(
        Number(joinedOn.slice(5, 7)),
        Number(joinedOn.slice(8, 10)),
        Number(joinedOn.slice(0, 4)) + 1,
      )
    : next;
}
