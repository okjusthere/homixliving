import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL_SECONDS = 5 * 60;
const DOWNLOAD_URL_TTL_SECONDS = 60;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

let client: S3Client | null = null;
let cachedConfig: R2Config | null = null;

export class R2ConfigurationError extends Error {
  constructor() {
    super("Document storage is not configured");
    this.name = "R2ConfigurationError";
  }
}

function getConfig(): R2Config {
  if (cachedConfig) return cachedConfig;

  const config = {
    accountId: process.env.R2_ACCOUNT_ID?.trim() || "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() || "",
    bucket: process.env.R2_BUCKET_NAME?.trim() || "",
  };
  if (Object.values(config).some((value) => !value)) {
    throw new R2ConfigurationError();
  }
  cachedConfig = config;
  return config;
}

function getClient() {
  const config = getConfig();
  if (!client) {
    client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client, bucket: config.bucket };
}

export async function createDealDocumentUploadUrl(
  objectKey: string,
  contentType: string
) {
  const r2 = getClient();
  return getSignedUrl(
    r2.client,
    new PutObjectCommand({
      Bucket: r2.bucket,
      Key: objectKey,
      ContentType: contentType,
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  );
}

function contentDisposition(fileName: string) {
  const asciiName = fileName
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 180) || "document";
  const encodedName = encodeURIComponent(fileName).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`;
}

export async function createDealDocumentDownloadUrl(
  objectKey: string,
  fileName: string
) {
  const r2 = getClient();
  return getSignedUrl(
    r2.client,
    new GetObjectCommand({
      Bucket: r2.bucket,
      Key: objectKey,
      ResponseContentDisposition: contentDisposition(fileName),
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS }
  );
}

export async function headDealDocument(objectKey: string) {
  const r2 = getClient();
  return r2.client.send(
    new HeadObjectCommand({ Bucket: r2.bucket, Key: objectKey })
  );
}

export async function deleteDealDocument(objectKey: string) {
  const r2 = getClient();
  await r2.client.send(
    new DeleteObjectCommand({ Bucket: r2.bucket, Key: objectKey })
  );
}
