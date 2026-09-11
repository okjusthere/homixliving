/** Ignore hidden fields when validating a generation, including older open tabs. */
export function relevantContentInput(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const input = { ...(value as Record<string, unknown>) };
  if (input.kind === "holiday") {
    delete input.listing;
    delete input.event;
  }
  if (input.kind === "listing") {
    delete input.holidayDate;
    if (input.theme !== "open_house") delete input.event;
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

type Issue = { path?: PropertyKey[]; message: string; code?: string };
export function contentValidationMessage(issues: Issue[]): string {
  const labels: Record<string, string> = {
    description:
      "Provide a listing description of 10–12,000 characters / 请提供 10–12,000 字符的房源描述",
    theme: "Choose a poster theme / 请选择海报主题",
    "listing.address": "Enter the property address / 请填写房源地址",
    "listing.imageAssetIds":
      "Select 1–4 property photos / 请选择 1–4 张房源照片",
    "event.date":
      "Enter a valid Open House date / 请填写有效的 Open House 日期",
    "event.start":
      "Enter the Open House start time / 请填写 Open House 开始时间",
    "event.end": "Enter the Open House end time / 请填写 Open House 结束时间",
    "event.timezone":
      "Enter a valid Open House timezone / 请填写有效的 Open House 时区",
    holidayDate: "Enter a valid holiday date / 请填写有效的节日日期",
    "listing.description":
      "Keep the listing description within 12,000 characters / 房源描述不能超过 12,000 字符",
  };
  return [
    ...new Set(
      issues.map((issue) => {
        if (issue.code === "custom") return issue.message;
        const path = (issue.path || [])
          .filter((p) => typeof p !== "number")
          .join(".")
          .replace(/^input\./, "");
        if (
          path.startsWith("listing.highlights") ||
          path.startsWith("listing.financialFacts")
        )
          return "Complete both language versions of each selected point, or deselect it / 请补全已选亮点的中英文内容，或取消勾选该条";
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
