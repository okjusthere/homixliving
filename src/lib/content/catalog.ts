import {
  IMAGE_SIZES,
  LISTING_THEMES,
  type Holiday,
  type TemplateConfig,
} from "./types";

const styles = [
  {
    id: "editorial",
    en: "Editorial residence",
    zh: "建筑杂志",
    colors: ["#F6F2EA", "#222A26", "#BA6243"],
    prompt:
      "Design an architectural magazine cover. Warm ivory paper, deep forest typography, disciplined asymmetric grid, generous margins and elegant serif headlines with a clean sans-serif contact block. Let authentic property photography dominate. A small rectangular agent portrait sits within the editorial grid. Use one restrained terracotta rule; no fake awards, decorative badges or generic gradients.",
  },
  {
    id: "luxury",
    en: "Evening collection",
    zh: "典雅黑金",
    colors: ["#191C20", "#E6D5B5", "#B38A4F"],
    prompt:
      "Create a restrained premium real estate campaign. Charcoal, warm champagne and subtle brass accents; a cinematic but faithful treatment of supplied property photographs. Large elegant title, refined hairline borders and exceptional typographic spacing. Place the recognizable agent portrait in a quiet signature area with legible contact information. No glitter, crowns, invented views or ostentatious gold effects.",
  },
  {
    id: "modern",
    en: "Modern city",
    zh: "都市现代",
    colors: ["#F8F8F4", "#153D51", "#DF694C"],
    prompt:
      "Build a contemporary city real estate poster with bold architectural typography, sharp rectangular photo crops, off-white and midnight blue, and one vivid coral accent. Use a strong information hierarchy and crisp geometric alignment. Keep the agent portrait integrated into a spacious bottom contact strip. Prioritize readability on a phone; avoid tiny print, heavy shadows and crowded icon rows.",
  },
  {
    id: "warm",
    en: "Welcome home",
    zh: "温暖生活",
    colors: ["#F4EEE3", "#59685B", "#BD8064"],
    prompt:
      "Create a welcoming lifestyle real estate poster in oatmeal, sage and muted clay. Soft natural light and tactile paper details frame the actual supplied property photography without changing its features. Use an inviting headline, airy rounded photo framing and a friendly, recognizable agent portrait. The layout feels personal and carefully designed rather than corporate. Keep every essential fact and contact detail crisp and easy to read.",
  },
] as const;

const directions: Record<string, string> = {
  coming_soon:
    "Communicate anticipation and an upcoming introduction. Do not claim it is currently on the market or invent an availability date.",
  just_listed:
    "Celebrate a newly listed property, emphasizing the actual home and supplied asking price. No urgency claims or invented amenities.",
  open_house:
    "Make the exact open-house date, start/end time and timezone the main practical callout after the property photograph. Include a clear invitation to visit.",
  under_contract:
    "Announce that a contract has been signed; the transaction has NOT closed. Use a composed celebratory tone without sold stamps.",
  offer_accepted:
    "Announce an accepted offer, distinct from a signed contract or a completed sale. Never label it Under Contract or Sold.",
  just_sold:
    "Celebrate a completed sale. Show a closing price only if the supplied price is explicitly a closing price; do not invent a sale amount, days on market or buyer names.",
};

export function initialTemplates(): { key: string; config: TemplateConfig }[] {
  const listing = LISTING_THEMES.flatMap((theme) =>
    styles.map((style) => ({
      key: `${theme.id}-${style.id}`,
      config: {
        name: {
          en: `${theme.en} · ${style.en}`,
          zh: `${theme.zh} · ${style.zh}`,
        },
        description: { en: style.en, zh: style.zh },
        kind: "listing" as const,
        themes: [theme.id],
        style: style.id,
        prompt: `${style.prompt}\nTheme direction: ${directions[theme.id]}\nPoster topic: {{theme}}. Marketing professional: {{agent.name}}. Brokerage: {{brokerage.name}}. Property: {{listing.address}}. Follow the supplied language and exact-copy requirements.`,
        colors: [...style.colors] as [string, string, string],
        referenceAssetIds: [],
        sizes: [...IMAGE_SIZES],
      },
    })),
  );
  const holidayStyles = [
    {
      id: "paper",
      en: "Paper celebration",
      zh: "纸艺节庆",
      colors: ["#FAF3E7", "#A94236", "#B99957"],
      prompt:
        "Create an artful layered-paper holiday greeting. Use exquisite cut-paper shapes, fine tactile shadows and culturally appropriate motifs specific to the named holiday. Use contemporary negative space instead of filling every corner. Integrate the agent portrait naturally in a reserved signature panel. Adapt the palette to the holiday rather than making every holiday red and gold.",
    },
    {
      id: "botanical",
      en: "Seasonal watercolor",
      zh: "四季水彩",
      colors: ["#F4F1E9", "#546B55", "#CB8976"],
      prompt:
        "Paint a sophisticated seasonal watercolor holiday greeting. Delicate botanicals and atmospheric hand-painted scenery surround a clear typography area. Choose flora, seasonal light and symbols appropriate to the holiday and its cultural setting. Keep the agent's face photographic and recognizable while gently integrating the portrait with the artwork. Avoid painting over facial features.",
    },
    {
      id: "minimal",
      en: "Quiet celebration",
      zh: "极简祝福",
      colors: ["#EFECE4", "#253E48", "#B58452"],
      prompt:
        "Design a minimal editorial holiday card. One meaningful, finely crafted holiday symbol; exquisite typographic balance; ample warm negative space; restrained seasonal color. Set the greeting large enough for mobile viewing. Give the agent portrait a clean intentional frame and the brand signature a separate readable area. No stock clip-art collages.",
    },
    {
      id: "festive",
      en: "Festive illustration",
      zh: "缤纷插画",
      colors: ["#F4DFCB", "#97463A", "#4C7473"],
      prompt:
        "Create a vibrant bespoke illustrated holiday greeting with premium hand-drawn details and a joyful but organized composition. Build a scene around the named holiday, using its actual cultural symbols. Place the real agent portrait into a deliberate photo frame within the illustration without cartoonizing the face. Use highly legible type and a harmonious seasonal palette. Do not invent claims of affiliation or endorsements.",
    },
  ];
  return [
    ...listing,
    ...holidayStyles.map((s) => ({
      key: `holiday-${s.id}`,
      config: {
        name: { en: s.en, zh: s.zh },
        description: {
          en: "Personal greetings for every season",
          zh: "每个节日，都有你的专属祝福",
        },
        kind: "holiday" as const,
        themes: ["*"],
        style: s.id,
        prompt: `${s.prompt}\nHoliday: {{holiday.name}}. Greeting: {{message}}. Agent: {{agent.name}}. Brokerage: {{brokerage.name}}. For remembrance holidays use a respectful, quiet tone; do not use sales promotions, confetti or comic imagery. For Chinese holidays use authentic Chinese cultural motifs; for US holidays use the appropriate US context.`,
        colors: s.colors as [string, string, string],
        referenceAssetIds: [],
        sizes: [...IMAGE_SIZES],
      },
    })),
  ];
}

type Rule = {
  fixed?: [number, number];
  nth?: [number, number, number];
  lunar?: [number, number];
  easter?: true;
  eve?: true;
};
const definitions: [string, "US" | "CN", string, string, Rule][] = [
  ["us-new-year", "US", "New Year", "新年", { fixed: [1, 1] }],
  [
    "mlk-day",
    "US",
    "Martin Luther King Jr. Day",
    "马丁·路德·金纪念日",
    { nth: [1, 1, 3] },
  ],
  ["presidents-day", "US", "Presidents’ Day", "总统日", { nth: [2, 1, 3] }],
  ["valentines-day", "US", "Valentine’s Day", "情人节", { fixed: [2, 14] }],
  ["easter", "US", "Easter", "复活节", { easter: true }],
  ["mothers-day", "US", "Mother’s Day", "母亲节", { nth: [5, 0, 2] }],
  ["memorial-day", "US", "Memorial Day", "阵亡将士纪念日", { nth: [5, 1, -1] }],
  ["juneteenth", "US", "Juneteenth", "六月节", { fixed: [6, 19] }],
  ["fathers-day", "US", "Father’s Day", "父亲节", { nth: [6, 0, 3] }],
  [
    "independence-day",
    "US",
    "Independence Day",
    "美国独立日",
    { fixed: [7, 4] },
  ],
  ["labor-day", "US", "Labor Day", "美国劳动节", { nth: [9, 1, 1] }],
  ["columbus-day", "US", "Columbus Day", "哥伦布日", { nth: [10, 1, 2] }],
  [
    "indigenous-peoples-day",
    "US",
    "Indigenous Peoples’ Day",
    "原住民日",
    { nth: [10, 1, 2] },
  ],
  ["halloween", "US", "Halloween", "万圣节", { fixed: [10, 31] }],
  ["veterans-day", "US", "Veterans Day", "退伍军人节", { fixed: [11, 11] }],
  ["thanksgiving", "US", "Thanksgiving", "感恩节", { nth: [11, 4, 4] }],
  ["christmas", "US", "Christmas", "圣诞节", { fixed: [12, 25] }],
  ["us-new-years-eve", "US", "New Year’s Eve", "跨年夜", { fixed: [12, 31] }],
  ["cn-new-year", "CN", "New Year", "元旦", { fixed: [1, 1] }],
  ["laba", "CN", "Laba Festival", "腊八节", { lunar: [12, 8] }],
  ["lunar-new-years-eve", "CN", "Lunar New Year’s Eve", "除夕", { eve: true }],
  ["spring-festival", "CN", "Spring Festival", "春节", { lunar: [1, 1] }],
  ["lantern-festival", "CN", "Lantern Festival", "元宵节", { lunar: [1, 15] }],
  ["qingming", "CN", "Qingming Festival", "清明节", { fixed: [4, 5] }],
  ["cn-labor-day", "CN", "Labor Day", "劳动节", { fixed: [5, 1] }],
  ["dragon-boat", "CN", "Dragon Boat Festival", "端午节", { lunar: [5, 5] }],
  ["qixi", "CN", "Qixi Festival", "七夕", { lunar: [7, 7] }],
  ["mid-autumn", "CN", "Mid-Autumn Festival", "中秋节", { lunar: [8, 15] }],
  ["double-ninth", "CN", "Double Ninth Festival", "重阳节", { lunar: [9, 9] }],
  ["national-day", "CN", "National Day", "国庆节", { fixed: [10, 1] }],
  ["winter-solstice", "CN", "Winter Solstice", "冬至", { fixed: [12, 22] }],
];

// Exact initial dates from Hong Kong Observatory conversion tables:
// https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/2026e.pdf
// https://www.hko.gov.hk/en/gts/time/calendar/pdf/files/2027e.pdf
// Runtime ICU lunar calendars can disagree by a day; do not calculate these.
const chineseDates: Record<number, Record<string, string>> = {
  2026: {
    laba: "01-26",
    "lunar-new-years-eve": "02-16",
    "spring-festival": "02-17",
    "lantern-festival": "03-03",
    qingming: "04-05",
    "dragon-boat": "06-19",
    qixi: "08-19",
    "mid-autumn": "09-25",
    "double-ninth": "10-18",
    "winter-solstice": "12-22",
  },
  2027: {
    laba: "01-15",
    "lunar-new-years-eve": "02-05",
    "spring-festival": "02-06",
    "lantern-festival": "02-20",
    qingming: "04-05",
    "dragon-boat": "06-09",
    qixi: "08-08",
    "mid-autumn": "09-15",
    "double-ninth": "10-08",
    "winter-solstice": "12-22",
  },
};
const iso = (d: Date) => d.toISOString().slice(0, 10);
function occurrence(year: number, rule: Rule): string | null {
  if (rule.fixed)
    return iso(new Date(Date.UTC(year, rule.fixed[0] - 1, rule.fixed[1])));
  if (rule.nth) {
    const [m, dow, n] = rule.nth;
    const d = new Date(Date.UTC(year, m - 1, n === -1 ? 1 : 1));
    if (n === -1) {
      d.setUTCMonth(m);
      d.setUTCDate(0);
      d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() - dow + 7) % 7));
    } else d.setUTCDate(1 + ((dow - d.getUTCDay() + 7) % 7) + (n - 1) * 7);
    return iso(d);
  }
  if (rule.easter) {
    const a = year % 19,
      b = Math.floor(year / 100),
      c = year % 100,
      d = Math.floor(b / 4),
      e = b % 4,
      f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3),
      h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4),
      k = c % 4,
      l = (32 + 2 * e + 2 * i - h - k) % 7,
      m = Math.floor((a + 11 * h + 22 * l) / 451),
      n = h + l - 7 * m + 114;
    return iso(new Date(Date.UTC(year, Math.floor(n / 31) - 1, (n % 31) + 1)));
  }
  return null;
}

// Seed only these verified planning years; administrators manage later years,
// including astronomical dates (Qingming and solstice), without approximation.
export function initialHolidays(): Holiday[] {
  return definitions.map(([id, country, en, zh, rule]) => ({
    id,
    country,
    name: { en, zh },
    enabled: true,
    greeting: {
      en: ["memorial-day", "veterans-day", "mlk-day", "qingming"].includes(id)
        ? "With remembrance and gratitude"
        : `Wishing you a wonderful ${en}`,
      zh: ["memorial-day", "veterans-day", "mlk-day", "qingming"].includes(id)
        ? "心怀感恩，寄托思念"
        : `${zh}安康，愿美好常伴`,
    },
    dates: [2026, 2027].flatMap((year) => {
      const exact = country === "CN" ? chineseDates[year]?.[id] : undefined;
      const date = exact ? `${year}-${exact}` : occurrence(year, rule);
      return date ? [{ year, date }] : [];
    }),
  }));
}
