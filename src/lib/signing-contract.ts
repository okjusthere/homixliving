import { z } from "zod";

export const signingRecipientSchema = z.object({
  id: z.number(),
  key: z.string().nullable(),
  actor: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  signingOrder: z.number().nullable(),
  signingStatus: z.enum(["NOT_SIGNED", "SIGNED", "REJECTED"]),
  signedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  sendStatus: z.string(),
  canSign: z.boolean().default(false),
});
export const signingDocumentSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["DRAFT", "PENDING", "COMPLETED", "REJECTED", "CANCELLED"]),
  updatedAt: z.string(),
  completedAt: z.string().nullable(),
  signingOrder: z.enum(["SEQUENTIAL", "PARALLEL"]).default("PARALLEL"),
  expired: z.boolean(),
  recipients: z.array(signingRecipientSchema),
  files: z.array(
    z.object({ id: z.string(), title: z.string(), order: z.number() }),
  ),
  completionFilesReady: z.boolean(),
});
export const signingRequestSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  scenario: z.enum(["onboarding", "team_leader", "buyer", "seller", "custom"]),
  business: z.object({
    customer: z.string(),
    property: z.string(),
    reference: z.string(),
  }),
  ownerAgentId: z.number(),
  predecessorRequestId: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  category: z.enum(["mine", "draft", "waiting", "completed", "attention"]),
  parts: z.array(
    z.object({
      id: z.string().uuid(),
      index: z.number(),
      operationState: z.enum([
        "prepared",
        "creating",
        "unknown",
        "linked",
        "failed",
        "discarded",
      ]),
      error: z.string().nullable(),
      lastSyncedAt: z.string().nullable(),
      canEdit: z.boolean().default(false),
      document: signingDocumentSchema.nullable(),
    }),
  ),
  events: z.array(
    z.object({
      event: z.string(),
      actorAgentId: z.number().nullable(),
      detail: z.record(z.string(), z.unknown()),
      createdAt: z.string(),
    }),
  ),
});
export const signingPackageSchema = z.object({
  id: z.string().uuid(),
  package_key: z.string(),
  version: z.number(),
  title: z.string(),
  scenario: z.enum(["onboarding", "team_leader", "buyer", "seller"]),
  company_key: z.string(),
  company_signer_email: z.string().optional(),
  company_signer_name: z.string().optional(),
  selectors: z.record(z.string(), z.string()),
  definition: z.array(
    z.object({
      title: z.string(),
      templateId: z.string(),
      connectionId: z.string(),
      fingerprint: z.string(),
      files: z.array(z.object({ title: z.string(), hash: z.string() })),
      roles: z.array(
        z.object({
          key: z.string(),
          templateRecipientId: z.number(),
          actor: z.enum(["owner", "company", "customer"]),
          label: z.string(),
        }),
      ),
      prefill: z.array(
        z.object({
          key: z.string(),
          templateFieldId: z.number(),
          required: z.boolean(),
          label: z.string(),
          valueType: z.string().optional(),
          options: z.array(z.string()).optional(),
        }),
      ),
    }),
  ),
});
export const signingListSchema = z.object({
  items: z.array(signingRequestSchema),
  page: z.number(),
  count: z.number(),
  truncated: z.boolean(),
});
export type SigningRequest = z.infer<typeof signingRequestSchema>;
export type SigningPackage = z.infer<typeof signingPackageSchema>;

const ERROR_MESSAGES: Record<string, [string, string]> = {
  LEGAL_NAME_REQUIRED: [
    "请先在个人档案补齐 Legal name；已有签署记录的经纪人请联系管理员核对。协议不能使用昵称代替法定姓名。",
    "Complete your Legal name in My profile before preparing agreements. Contact the office if your signed identity needs verification.",
  ],
  SEQUENTIAL_ORDER_MUST_BE_DISTINCT: [
    "顺序签署的每位参与人必须使用不同顺序号；需要同时签时请选择并行模式。",
    "Sequential signers must have distinct order numbers. Use parallel mode for simultaneous signing.",
  ],
  STANDARD_PACKAGE_SINGLE_ENVELOPE: [
    "标准客户包应使用一个含多份 PDF 的模板；不同收件范围请分别发布文件包。",
    "Use one multi-PDF template for a standard client package. Publish different recipient groups as separate packages.",
  ],
  REVIEW_REQUIRED: [
    "请重新预览文件并核对收件人后发送。",
    "Review the files and recipients again before sending.",
  ],
  PREVIOUS_REQUEST_STILL_OPEN: [
    "原任务仍在处理，请先核对状态并撤销或放弃，避免重复邀请。",
    "The previous request is still open. Reconcile and close it before starting another.",
  ],
  REISSUE_REASON_REQUIRED: [
    "请填写重新准备的原因。",
    "Enter a reason for preparing a replacement.",
  ],
  PERSONAL_SIGNING_UNAVAILABLE: [
    "个性化文件签署暂未开放，请选择公司标准文件包。",
    "Personal uploads are not available. Choose a company package.",
  ],
  COMPANY_ACCESS_DENIED: [
    "此文件包不适用于你当前所属公司，请联系管理员核对。",
    "This package is not available for your company. Contact an administrator.",
  ],
  PACKAGE_COMPANY_MISMATCH: [
    "文件包的公司配置不一致，请管理员检查模板。",
    "The package company configuration does not match. Contact an administrator.",
  ],
  PACKAGE_RETIRED: [
    "公司已停用此版本，请使用当前版本重新准备。",
    "This version has been retired. Prepare a new request using the current version.",
  ],
  SIGNING_NOT_CONFIGURED: [
    "文件签署尚未配置，请联系管理员。",
    "Signing is not configured. Contact an administrator.",
  ],
  AGENT_SIGNING_NOT_CONNECTED: [
    "管理员需要先为你关联签署账号。",
    "An administrator needs to connect your signing account.",
  ],
  COMPANY_SIGNING_NOT_CONFIGURED: [
    "公司签署空间尚未配置。",
    "The company signing space is not configured.",
  ],
  PUBLISHED_TEMPLATE_CHANGED: [
    "模板已变更，请管理员核对并发布新版本。",
    "The template changed. An administrator must publish a reviewed version.",
  ],
  CREATE_OUTCOME_UNKNOWN: [
    "正在核对创建结果。请刷新状态，不要重新建一份。",
    "The creation result is being reconciled. Refresh this request instead of creating another.",
  ],
  SEND_OUTCOME_UNKNOWN: [
    "正在核对是否已发送，请检查状态。",
    "The delivery result is being reconciled. Refresh the status.",
  ],
  REQUEST_BUSY: [
    "该文件正在处理，请稍后刷新。",
    "This request is being processed. Refresh shortly.",
  ],
  NATIVE_OWNERSHIP_MISMATCH: [
    "签署文件的所属账号不匹配，请联系管理员。",
    "The native document owner does not match. Contact an administrator.",
  ],
  HR_RECIPIENT_CHANGED: [
    "入职合同的签署人发生变化，需要管理员核对。",
    "Onboarding recipients changed. Administrator review is required.",
  ],
  REMINDER_RECENTLY_REQUESTED: [
    "最近已请求提醒，请五分钟后再试。",
    "A reminder was recently requested. Try again in five minutes.",
  ],
  IDEMPOTENCY_KEY_REUSED: [
    "这次提交的资料与先前不同，请先找到已创建的任务。",
    "The submitted details changed. Find the previously created request first.",
  ],
  SIGNER_ACCESS_DENIED: [
    "只能进入本人邮箱对应的签署入口。",
    "You can only open a signing link assigned to your verified email.",
  ],
  SIGNED_PDF_NOT_READY: [
    "所有必需签署及文件封存完成后才能下载完成件。",
    "Completed files are available after all required signatures and sealing.",
  ],
  CONNECTED_EMAIL_NO_LONGER_VERIFIED: [
    "签署账号邮箱已变更，请管理员重新核对关联。",
    "The connected email changed. Ask an administrator to review the connection.",
  ],
  HR_DRAFT_IS_CONTROLLED: [
    "入职合同使用已批准资料。请先更正资料，再重新准备合同。",
    "HR agreements use approved details. Correct those details before preparing a replacement.",
  ],
  RATE_LIMITED: [
    "操作较频繁，请稍后重试。",
    "Too many requests. Please retry shortly.",
  ],
  ONBOARDING_FACTS_CHANGED: [
    "资料已变更，请刷新并核对当前合同。",
    "Details changed. Refresh and review the current agreement.",
  ],
  TEAM_LEADER_ELIGIBILITY_CHANGED: [
    "请核对在职状态、Solo Pro 套餐和完整入职合同。",
    "Review active status, the Solo Pro plan and the completed affiliation contract.",
  ],
  TEAM_LEADER_APPLICATION_NOT_READY: [
    "公司批准团队并发布条款后即可准备合同。",
    "The company must approve the team and publish its terms before preparation.",
  ],
  SIGNING_CONNECTION_UNAVAILABLE: [
    "签署账号关联不可用，请管理员检查关联凭据。",
    "The signing connection is unavailable. Ask an administrator to check its credentials.",
  ],
};
export function signingErrorMessage(code: string | undefined, zh: boolean) {
  return (
    (code ? ERROR_MESSAGES[code]?.[zh ? 0 : 1] : undefined) ||
    (zh
      ? "操作未完成，请检查资料或稍后重试。"
      : "The operation could not be completed. Check the details or retry shortly.")
  );
}

export const signingReviewSchema = z.object({
  reviewHash: z.string().regex(/^[a-f0-9]{64}$/),
  files: z.array(
    z.object({
      partId: z.string().uuid(),
      id: z.string(),
      title: z.string(),
      fields: z.array(
        z.object({
          id: z.number(),
          page: z.number(),
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
          type: z.string(),
          value: z.string(),
          readOnly: z.boolean(),
          required: z.boolean(),
          recipient: z.string(),
          label: z.string(),
        }),
      ),
    }),
  ),
});
export type SigningReview = z.infer<typeof signingReviewSchema>;
export type SigningReviewFile = SigningReview["files"][number];
