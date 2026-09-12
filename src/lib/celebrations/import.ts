import { readSheet } from "read-excel-file/node";
import { ContentError } from "@/lib/content/store";
import { validBirthday, validJoinDate } from "./calendar";
import type { BirthdayProfile } from "./data";
import type { ImportRow, CelebrationKind } from "./types";

export function parseCsv(text: string): unknown[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && (ch === "," || ch === "\n")) {
      row.push(cell.replace(/\r$/, ""));
      cell = "";
      if (ch === "\n") {
        rows.push(row);
        row = [];
      }
    } else cell += ch;
    if (row.length > 50 || rows.length > 1001 || cell.length > 10000)
      throw new ContentError("表格过大 / Spreadsheet too large");
  }
  if (quoted) throw new ContentError("CSV 引号未闭合 / Unclosed CSV quote");
  if (cell || row.length) rows.push([...row, cell.replace(/\r$/, "")]);
  return rows;
}
// Reject large/ZIP64 archives before decompression. Typical HR rosters are tiny.
export function checkWorkbookSize(bytes: Buffer) {
  const end = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > bytes.length)
    throw new ContentError("无效的 XLSX 文件 / Invalid XLSX");
  const count = bytes.readUInt16LE(end + 10);
  let offset = bytes.readUInt32LE(end + 16),
    expanded = 0;
  if (count > 200 || bytes.readUInt16LE(end + 4) !== 0)
    throw new ContentError(
      "请使用简单的单页 Excel 名册 / Use a simple Excel roster",
    );
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new ContentError("无效的工作簿 / Invalid workbook");
    expanded += bytes.readUInt32LE(offset + 24);
    if (expanded > 12 * 1024 * 1024)
      throw new ContentError(
        "工作簿解压后超过 12 MB / Workbook exceeds 12 MB uncompressed",
      );
    offset +=
      46 +
      bytes.readUInt16LE(offset + 28) +
      bytes.readUInt16LE(offset + 30) +
      bytes.readUInt16LE(offset + 32);
  }
}
export async function readBirthdayFile(
  bytes: Buffer,
  name: string,
): Promise<unknown[][]> {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024)
    throw new ContentError("请上传 2 MB 以内的文件 / Maximum file size: 2 MB");
  if (name.toLowerCase().endsWith(".csv"))
    return parseCsv(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  if (!name.toLowerCase().endsWith(".xlsx"))
    throw new ContentError(
      "请上传 .xlsx 或 UTF-8 .csv / Use .xlsx or UTF-8 .csv",
    );
  checkWorkbookSize(bytes);
  try {
    return await readSheet(bytes, 1);
  } catch {
    throw new ContentError(
      "无法读取 Excel，请检查首个工作表 / Unable to read the first worksheet",
    );
  }
}
const headers: Record<string, string> = {
  agent_id: "id",
  agentid: "id",
  账号id: "id",
  经纪人id: "id",
  email: "email",
  邮箱: "email",
  邮箱地址: "email",
  登录邮箱: "email",
  joined_on: "joined",
  hire_date: "joined",
  start_date: "joined",
  入职日期: "joined",
  加入日期: "joined",
  birthday_month: "month",
  month: "month",
  生日月: "month",
  月份: "month",
  birthday_day: "day",
  day: "day",
  "生日 日": "day",
  生日日期: "day",
  生日天: "day",
  日: "day",
  birthday: "birthday",
  birth_date: "birthday",
  date_of_birth: "birthday",
  dob: "birthday",
  生日: "birthday",
  出生日期: "birthday",
};
function birthdayValue(value: unknown): [number, number] | null {
  if (value instanceof Date && Number.isFinite(value.getTime()))
    return [value.getUTCMonth() + 1, value.getUTCDate()];
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/月/g, "-").replace(/日/g, "");
  const match = /^(?:\d{4}[-/])?(\d{1,2})[-/](\d{1,2})$/.exec(normalized);
  return match ? [Number(match[1]), Number(match[2])] : null;
}
export function previewBirthdays(
  sheet: unknown[][],
  profiles: BirthdayProfile[],
  kind: CelebrationKind = "birthday",
): ImportRow[] {
  if (
    sheet.length < 2 ||
    sheet.length > 1001 ||
    sheet.some((r) => r.length > 50)
  )
    throw new ContentError(
      "需要表头及 1–1000 行资料，最多 50 列 / Use headers and 1–1000 rows, at most 50 columns",
    );
  const columns = sheet[0].map(
    (v) =>
      headers[
        String(v ?? "")
          .trim()
          .toLowerCase()
      ],
  );
  const recognized = columns.filter(Boolean);
  if (new Set(recognized).size !== recognized.length)
    throw new ContentError("表头重复 / Duplicate headers");
  if (
    (!columns.includes("id") && !columns.includes("email")) ||
    (kind === "anniversary"
      ? !columns.includes("joined")
      : !columns.includes("birthday") &&
        !(columns.includes("month") && columns.includes("day")))
  )
    throw new ContentError(
      "需要 email 或 agent_id；生日需 birthday_month + birthday_day 或 birthday，纪念日需 joined_on / Required: email or agent_id; birthday_month + birthday_day or birthday; anniversary requires joined_on",
    );
  const byId = new Map(profiles.map((p) => [p.agentId, p]));
  const byEmail = new Map<string, BirthdayProfile[]>();
  profiles.forEach((p) =>
    byEmail.set(p.email.toLowerCase(), [
      ...(byEmail.get(p.email.toLowerCase()) || []),
      p,
    ]),
  );
  const rows = sheet
    .slice(1)
    .map((cells, index): ImportRow | null => {
      if (cells.every((v) => v === null || v === undefined || v === ""))
        return null;
      const v = Object.fromEntries(columns.map((key, i) => [key, cells[i]]));
      const email = String(v.email ?? "")
          .trim()
          .toLowerCase(),
        id = String(v.id ?? "").trim();
      const matches = email ? byEmail.get(email) || [] : [];
      const p = id
        ? byId.get(Number(id))
        : matches.length === 1
          ? matches[0]
          : undefined;
      const result: ImportRow = {
        row: index + 2,
        name: p?.name,
        email: email || p?.email,
      };
      if (
        !p ||
        (email && (matches.length !== 1 || matches[0].agentId !== p.agentId))
      )
        return {
          ...result,
          error:
            "账号未匹配、非在职或 ID 与邮箱不一致 / Account not matched, inactive, or ID/email mismatch",
        };
      if (kind === "anniversary") {
        const joinedOn =
          v.joined instanceof Date
            ? v.joined.toISOString().slice(0, 10)
            : String(v.joined ?? "")
                .trim()
                .replaceAll("/", "-");
        if (!validJoinDate(joinedOn))
          return {
            ...result,
            error:
              "入职日期需为有效的 YYYY-MM-DD，不能晚于今天 / Joining date must be YYYY-MM-DD and no later than today",
          };
        return {
          ...result,
          previous: p.joinedOn || "—",
          change: {
            agentId: p.agentId,
            kind,
            joinedOn,
            month: Number(joinedOn.slice(5, 7)),
            day: Number(joinedOn.slice(8, 10)),
            enabled: p.enabled,
            revision: p.revision,
          },
        };
      }
      const pair =
        v.month !== undefined && v.month !== null && v.month !== ""
          ? [Number(v.month), Number(v.day)]
          : birthdayValue(v.birthday);
      if (!pair || !validBirthday(pair[0], pair[1]))
        return {
          ...result,
          error:
            "生日无效；使用月/日或拆分月、日两列 / Invalid birthday; use MM/DD or month and day columns",
        };
      const combined = birthdayValue(v.birthday);
      if (combined && (pair[0] !== combined[0] || pair[1] !== combined[1]))
        return {
          ...result,
          error: "生日列与月、日两列冲突 / Conflicting birthday columns",
        };
      return {
        ...result,
        previous: p.month ? `${p.month}/${p.day}` : "—",
        change: {
          agentId: p.agentId,
          kind,
          joinedOn: null,
          month: pair[0],
          day: pair[1],
          enabled: p.enabled,
          revision: p.revision,
        },
      };
    })
    .filter((v): v is ImportRow => v !== null);
  const counts = new Map<number, number>();
  rows.forEach((r) => {
    if (r.change)
      counts.set(r.change.agentId, (counts.get(r.change.agentId) || 0) + 1);
  });
  return rows.map((r) =>
    r.change && counts.get(r.change.agentId)! > 1
      ? {
          ...r,
          change: undefined,
          error:
            "该账号在文件中重复，请删除重复行 / Duplicate account; remove duplicate rows",
        }
      : r,
  );
}
