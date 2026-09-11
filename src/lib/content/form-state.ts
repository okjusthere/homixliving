/** Ignore hidden fields when validating a generation, including older open tabs. */
export function relevantContentInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = { ...(value as Record<string, unknown>) };
  if (input.kind === "holiday") {
    delete input.listing;
    delete input.event;
    delete input.events;
  }
  if (input.kind === "listing") {
    delete input.holidayDate;
    if (input.theme !== "open_house") {
      delete input.event;
      delete input.events;
    } else {
      if (input.events === undefined && input.event)
        input.events = [input.event];
      delete input.event;
    }
    if (
      input.listing &&
      typeof input.listing === "object" &&
      !Array.isArray(input.listing)
    ) {
      const listing = { ...(input.listing as Record<string, unknown>) };
      for (const key of ["highlights", "financialFacts"]) {
        if (Array.isArray(listing[key]))
          listing[key] = listing[key].filter(
            (item) =>
              !item || typeof item !== "object" || item.selected !== false,
          );
      }
      if (!["just_listed", "open_house"].includes(String(input.theme))) {
        // These controls are hidden on brief/preview posters and their values
        // are not part of those posters' financial or descriptive copy.
        for (const key of [
          "financialFacts",
          "annualPropertyTax",
          "monthlyMaintenanceFee",
          "associationFee",
          "associationFeeFrequency",
          "description",
        ])
          delete listing[key];
        if (
          input.theme === "coming_soon" &&
          listing.highlightsReviewed === true &&
          Array.isArray(listing.highlights)
        ) {
          listing.highlights = listing.highlights
            .filter(
              (item) =>
                item &&
                ["en", "zh", "evidence"].every(
                  (key) =>
                    typeof item[key] === "string" &&
                    item[key].trim().length >= (key === "evidence" ? 3 : 1) &&
                    item[key].length <=
                      (key === "evidence" ? 600 : key === "zh" ? 160 : 240),
                ),
            )
            .slice(0, 1);
        } else delete listing.highlights;
      }
      input.listing = listing;
    }
  }
  if (input.holidayDate === "") delete input.holidayDate;
  return input;
}
export function movePhoto(ids: string[], from: string, to: string): string[] {
  const start = ids.indexOf(from),
    end = ids.indexOf(to);
  if (start < 0 || end < 0 || start === end) return ids;
  const result = [...ids];
  result.splice(start, 1);
  result.splice(end, 0, from);
  return result;
}

type Issue = {
  path?: PropertyKey[];
  message: string;
  code?: string;
  maximum?: number | bigint;
};
export function contentValidationMessage(issues: Issue[]): string {
  const labels: Record<string, string> = {
    description:
      "Provide a listing description of 10–12,000 characters / 请提供 10–12,000 字符的房源描述",
    theme: "Choose a poster theme / 请选择海报主题",
    "listing.address": "Enter the property address / 请填写房源地址",
    "listing.imageAssetIds":
      "Select 1–4 property photos / 请选择 1–4 张房源照片",
    "event.date": "Enter a valid Open House date / 请填写有效的公展日期",
    "event.start": "Enter the Open House start time / 请填写公展开始时间",
    "event.end": "Enter the Open House end time / 请填写公展结束时间",
    "event.timezone":
      "Enter a valid Open House timezone / 请填写有效的公展时区",
    holidayDate: "Enter a valid holiday date / 请填写有效的节日日期",
    "listing.description":
      "Keep the listing description within 12,000 characters / 房源描述不能超过 12,000 字符",
  };
  return [
    ...new Set(
      issues.map((issue) => {
        const path = (issue.path || [])
          .filter((p) => typeof p !== "number")
          .join(".")
          .replace(/^input\./, "");
        if (path === "events" || path.startsWith("events.")) {
          const row = (issue.path || []).find((p) => typeof p === "number");
          if (issue.code === "custom" && !/calendar date/.test(issue.message)) {
            if (typeof row === "number" && issue.message.startsWith("End time"))
              return `Open House ${row + 1}: end time must be after start / 第 ${row + 1} 场公展：结束时间必须晚于开始时间，请修改时间`;
            return issue.message;
          }
          const field = String((issue.path || []).at(-1));
          const names: Record<string, [string, string]> = {
            date: ["date", "公展日期"],
            start: ["start time", "开始时间"],
            end: ["end time", "结束时间"],
            timezone: ["timezone", "时区"],
          };
          const name = names[field] || ["schedule", "公展场次"];
          return typeof row === "number"
            ? `Open House ${row + 1}: enter a valid ${name[0]} / 第 ${row + 1} 场公展：请填写有效的${name[1]}`
            : "Choose at least one valid Open House session / 请添加并选择至少一场有效公展";
        }
        if (issue.code === "custom" && !/calendar date/.test(issue.message))
          return issue.message;
        if (
          path.startsWith("listing.highlights") ||
          path.startsWith("listing.financialFacts")
        ) {
          const row = (issue.path || []).find((p) => typeof p === "number");
          const place = path.startsWith("listing.financialFacts")
            ? ["Property costs", "房源费用"]
            : ["Property selling points", "房源卖点"];
          const field = String((issue.path || []).at(-1));
          const lang =
            field === "zh"
              ? ["Chinese text", "中文内容"]
              : field === "en"
                ? ["English text", "英文内容"]
                : ["source evidence", "来源依据"];
          const nth =
            typeof row === "number"
              ? [`selected item ${row + 1}`, `已选第 ${row + 1} 条`]
              : ["selected items", "已选条目"];
          const remedy =
            issue.code === "too_big"
              ? [
                  `shorten to ${issue.maximum} characters or fewer`,
                  `请缩短到 ${issue.maximum} 字符以内`,
                ]
              : [
                  "complete the text or deselect this item",
                  "请补全内容，或取消勾选该条",
                ];
          return `${place[0]} → ${nth[0]} → ${lang[0]}: ${remedy[0]} / ${place[1]} → ${nth[1]} → ${lang[1]}：${remedy[1]}`;
        }
        const fields: Record<string, string[]> = {
          headline: ["Headline", "标题"],
          message: ["Personal message", "个人寄语"],
          additionalInstructions: ["Creative notes", "创作备注"],
          "listing.address": ["Property address", "房源地址"],
          "listing.price": ["Price", "显示价格"],
          "listing.beds": ["Beds", "卧室数"],
          "listing.baths": ["Baths", "卫浴数"],
          "listing.area": ["Interior area", "室内面积"],
          "listing.annualPropertyTax": ["Property tax / year", "年度地税"],
          "listing.monthlyMaintenanceFee": [
            "Monthly maintenance",
            "每月管理费",
          ],
          "listing.associationFee": ["HOA fee", "HOA 费用"],
        };
        if (fields[path]) {
          const [en, zh] = fields[path];
          return issue.code === "too_big"
            ? `${en}: shorten to ${issue.maximum} characters or fewer / ${zh}：请缩短到 ${issue.maximum} 字符以内`
            : `${en}: enter a valid value in this field / ${zh}：请在此栏填写有效内容`;
        }
        return (
          labels[path] ||
          (path.startsWith("listing.imageAssetIds")
            ? labels["listing.imageAssetIds"]
            : `Please check ${path || "the form"} / 请检查${path || "表单"}，内容缺失或格式不正确`)
        );
      }),
    ),
  ].join("\n");
}
