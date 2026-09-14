import type { ContentTemplate } from "./types";

const priority: Record<string, number> = {
  editorial: 0,
  minimal: 0,
  modern: 1,
  festive: 1,
};

export function orderStudioTemplates(templates: ContentTemplate[]) {
  return [...templates].sort(
    (a, b) =>
      (priority[a.config.style] ?? 10) - (priority[b.config.style] ?? 10) ||
      b.version - a.version || a.id.localeCompare(b.id),
  );
}

export function chooseStudioTemplate(
  applicable: ContentTemplate[],
  all: ContentTemplate[],
  selected: string,
) {
  const style = all.find((v) => v.id === selected)?.config.style;
  return applicable.find((v) => v.id === selected) ||
    applicable.find((v) => v.config.style === style) || applicable[0];
}
