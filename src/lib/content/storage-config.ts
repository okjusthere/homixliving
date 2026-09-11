export function contentStorageConfig(
  env: Record<string, string | undefined> = process.env,
) {
  const account = env.R2_ACCOUNT_ID?.trim();
  const bucket = env.R2_CONTENT_BUCKET_NAME?.trim();
  // A partial dedicated configuration must fail closed, rather than combine
  // a content access key with a deal-document secret (or vice versa).
  const dedicated = Boolean(
    env.R2_CONTENT_ACCESS_KEY_ID || env.R2_CONTENT_SECRET_ACCESS_KEY,
  );
  const accessKeyId = (
    dedicated ? env.R2_CONTENT_ACCESS_KEY_ID : env.R2_ACCESS_KEY_ID
  )?.trim();
  const secretAccessKey = (
    dedicated ? env.R2_CONTENT_SECRET_ACCESS_KEY : env.R2_SECRET_ACCESS_KEY
  )?.trim();
  if (!account || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { account, bucket, credentials: { accessKeyId, secretAccessKey } };
}
