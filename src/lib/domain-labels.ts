export type DomainLabelLocale = "en" | "zh";

const DEAL_STATUS_LABELS: Record<string, { en: string; zh: string }> = {
  active: { en: "Active", zh: "进行中" },
  cancelled: { en: "Cancelled", zh: "已取消" },
  completed: { en: "Completed", zh: "已完成" },
};

export function dealStatusLabel(status: string, locale: DomainLabelLocale = "en") {
  return DEAL_STATUS_LABELS[status]?.[locale] || status.replaceAll("_", " ");
}

const COMMERCE_STATUS_LABELS: Record<string, { en: string; zh: string }> = {
  paid: { en: "Paid", zh: "已支付" },
  active: { en: "Active", zh: "生效中" },
  pending: { en: "Pending", zh: "待处理" },
  open: { en: "Open", zh: "待支付" },
  failed: { en: "Failed", zh: "失败" },
  past_due: { en: "Past due", zh: "已逾期" },
  uncollectible: { en: "Uncollectible", zh: "无法收取" },
  expired: { en: "Expired", zh: "已过期" },
  void: { en: "Void", zh: "已作废" },
  canceled: { en: "Canceled", zh: "已取消" },
  canceling: { en: "Canceling", zh: "取消中" },
  provisioned: { en: "Provisioned", zh: "已开通" },
  provisioning: { en: "Provisioning", zh: "开通中" },
  not_required: { en: "Not required", zh: "无需开通" },
};

export function commerceStatusLabel(status: string, locale: DomainLabelLocale = "en") {
  return COMMERCE_STATUS_LABELS[status]?.[locale] || status.replaceAll("_", " ");
}
