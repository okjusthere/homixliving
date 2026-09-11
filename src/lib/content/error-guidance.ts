/** Stable, actionable public explanations; never expose provider response bodies. */
export function generationErrorGuidance(
  code: string | null | undefined,
  status: string,
  zh: boolean,
) {
  const advice: Record<string, [string, string]> = {
    AZURE_ACCESS_DENIED: [
      "Image service authorization failed. Ask an administrator to check the Azure deployment credentials; editing the property details will not fix this.",
      "图片服务授权失败：请管理员检查 Azure 部署密钥与权限，无需修改房源资料。",
    ],
    AZURE_REQUEST_REJECTED: [
      "The image service rejected the request. Review the photos, portrait and creative notes, then try again. If it persists, ask an administrator to inspect this job.",
      "图片生成请求被拒绝：请检查房源照片、头像及创作备注后重试；若仍失败，请管理员检查此任务。",
    ],
    AZURE_CONFIGURATION_CHANGED: [
      "Image service configuration changed while this job was queued. Ask an administrator to confirm the current deployment, then submit a new version.",
      "排队期间图片服务配置发生变化：请管理员确认当前部署配置后，再提交新版本。",
    ],
    AZURE_RATE_LIMITED: [
      "The image service is busy. This job will retry automatically while queued; no form changes are needed.",
      "图片服务繁忙：任务排队期间会自动重试，无需修改表单。",
    ],
  };
  if (status === "needs_review")
    return zh
      ? "图片服务返回结果未能确认，或作品保存中断：请在「我的作品」保留此任务，并请管理员核查生成及存储结果后再决定是否重试。"
      : "The image result could not be confirmed or saving was interrupted. Keep this job in My artwork and ask an administrator to check generation and storage before retrying.";
  return (
    advice[code || ""]?.[zh ? 1 : 0] ||
    (zh
      ? "素材准备或生成过程未完成，现有信息无法确定具体原因：请重新选择可正常显示的照片，并检查头像；仍失败时请管理员按此作品核查服务日志。"
      : "Photo preparation or generation did not complete; the exact cause is not available. Reselect photos that display correctly and check your portrait. If it persists, ask an administrator to inspect this artwork’s service logs.")
  );
}
