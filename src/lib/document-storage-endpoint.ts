/** Local S3-compatible storage keeps development uploads out of the real R2 bucket. */
export function documentStorageEndpoint(
  accountId: string,
  localEndpoint = process.env.R2_LOCAL_ENDPOINT,
  environment = process.env.NODE_ENV,
) {
  if (!localEndpoint) {
    return { endpoint: `https://${accountId}.r2.cloudflarestorage.com` };
  }
  const url = new URL(localEndpoint);
  if (
    environment === "production" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.protocol !== "http:" ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error("R2_LOCAL_ENDPOINT is only allowed for localhost development storage");
  }
  return { endpoint: url.origin, forcePathStyle: true };
}
