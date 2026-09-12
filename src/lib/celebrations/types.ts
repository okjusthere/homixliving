export type BirthdayFilter = "today" | "upcoming" | "month" | "missing" | "all";
export type BirthdayRow = {
  kind: CelebrationKind;
  joinedOn: string | null;
  years: number | null;
  agentId: number;
  name: string;
  email: string;
  month: number | null;
  day: number | null;
  enabled: boolean;
  revision: number;
  date: string | null;
  days: number | null;
  eventId: string | null;
  status: string;
  error: string | null;
  assetId: string | null;
  generationId: string | null;
};
export type BirthdaySettings = {
  enabled: boolean;
  leadDays: number;
  dailyLimit: number;
  language: "zh" | "en";
};
export type BirthdayList = {
  today: string;
  rows: BirthdayRow[];
  total: number;
  page: number;
  counts: Record<BirthdayFilter, number>;
  settings: BirthdaySettings;
};
export type BirthdayChange = {
  agentId: number;
  kind: CelebrationKind;
  joinedOn: string | null;
  month: number | null;
  day: number | null;
  enabled: boolean;
  revision: number;
};
export type ImportRow = {
  row: number;
  name?: string;
  email?: string;
  previous?: string;
  change?: BirthdayChange;
  error?: string;
};
export type CelebrationKind = "birthday" | "anniversary";
