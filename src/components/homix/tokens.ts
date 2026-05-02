// Homix Invoice design tokens — warm editorial palette
export const tone = {
  paper: "#F7F4EE",
  paperDeep: "#EFEAE1",
  card: "#FFFFFF",
  ink: "#1A1814",
  ink70: "#4A4640",
  ink50: "#7A756C",
  ink30: "#B5AFA4",
  line: "#E4DED2",
  lineSoft: "#EDE8DD",
  accent: "#5C6B3A", // deep olive
  accentSoft: "#E9ECDD",
  // Brand mark color — walnut brown matching the Homix wordmark and favicon.
  // Use for the logo and brand surfaces. Keep `accent` (olive) for in-app
  // utility highlights so the brand color stays distinctive.
  brand: "#8B5A3C",
  brandSoft: "#E8D9CC",
  brandDeep: "#5E3A24",
  amber: "#A76A1F",
  amberSoft: "#F4E6CE",
  rose: "#9B3C3C",
  roseSoft: "#F1D9D6",
  green: "#3E6B4D",
  greenSoft: "#DBE7DC",
} as const;

export function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

export function fmtLongDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
