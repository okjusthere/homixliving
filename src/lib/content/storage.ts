import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import sharp from "sharp";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { query, ContentError } from "./store";
import { contentStorageConfig } from "./storage-config";

const MAX_BYTES = 12 * 1024 * 1024;
export type ContentAsset = {
  id: string;
  owner_agent_id: number;
  object_key: string;
  content_type: string;
  bytes: number;
  purpose: string;
};
function storage() {
  const config = contentStorageConfig();
  if (!config)
    throw new ContentError(
      "Content storage is not configured / 内容存储尚未配置",
      503,
      "STORAGE_UNAVAILABLE",
    );
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${config.account}.r2.cloudflarestorage.com`,
      credentials: config.credentials,
    }),
  };
}
export function assertContentStorageConfigured() {
  storage();
}
export async function verifyContentStorage() {
  const { client, bucket } = storage();
  await client.send(new HeadBucketCommand({ Bucket: bucket }));
  return true;
}
export async function normalizeImage(bytes: Buffer): Promise<Buffer> {
  if (!bytes.length || bytes.length > MAX_BYTES)
    throw new ContentError(
      "Image must be smaller than 12 MB / 图片不能超过 12 MB",
    );
  try {
    return await sharp(bytes, { limitInputPixels: 32_000_000, animated: false })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
  } catch {
    throw new ContentError(
      "Use a valid JPG, PNG or WebP image / 请上传有效图片",
    );
  }
}
export async function putAsset(
  owner: number,
  bytes: Buffer,
  purpose: ContentAsset["purpose"],
  id: string = randomUUID(),
  normalize = true,
) {
  const body = normalize ? await normalizeImage(bytes) : bytes;
  const { client, bucket } = storage(),
    key = `content/${owner}/${id}.png`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: "image/png",
    }),
  );
  const [asset] = await query<ContentAsset>(
    "INSERT INTO portal.content_assets(id,owner_agent_id,object_key,content_type,bytes,purpose) VALUES($1,$2,$3,'image/png',$4,$5) ON CONFLICT(id) DO UPDATE SET bytes=EXCLUDED.bytes RETURNING *",
    [id, owner, key, body.length, purpose],
  );
  return asset;
}
export async function getAsset(id: string, owner: number, admin = false) {
  const [a] = await query<ContentAsset>(
    "SELECT * FROM portal.content_assets WHERE id=$1 AND (owner_agent_id=$2 OR $3)",
    [id, owner, admin],
  );
  if (!a)
    throw new ContentError("Image not found / 找不到图片", 404, "NOT_FOUND");
  return a;
}
export async function assetBytes(a: ContentAsset) {
  const { client, bucket } = storage();
  const object = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: a.object_key }),
  );
  if (!object.Body) throw new ContentError("Image unavailable", 503);
  return Buffer.from(await object.Body.transformToByteArray());
}
export async function assetUrl(a: ContentAsset, download = false) {
  const { client, bucket } = storage();
  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: a.object_key,
      ...(download
        ? {
            ResponseContentDisposition: `attachment; filename="homix-${a.id}.png"`,
          }
        : {}),
    }),
    { expiresIn: 120 },
  );
}
export function isPublicAddress(address: string): boolean {
  // Reference hosts use public IPv4. Refuse IPv6 and all special/private ranges,
  // including link-local metadata services. Pin the checked address per request.
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}
export async function fetchReferenceImage(url: string): Promise<Buffer> {
  const u = new URL(url);
  const origins = (
    process.env.CONTENT_REFERENCE_ORIGINS ||
    "https://www.homixny.com,https://homixny.com"
  )
    .split(",")
    .map((s) => s.trim());
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !origins.includes(u.origin)
  )
    throw new ContentError(
      "This image source is not configured / 图片来源未配置",
      400,
      "IMAGE_SOURCE_NOT_ALLOWED",
    );
  const addresses = await lookup(u.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new ContentError("Invalid image host", 400);
  return new Promise((resolve, reject) => {
    const req = request(
      u,
      {
        method: "GET",
        family: 4,
        lookup: (_hostname, _options, cb) => cb(null, addresses[0].address, 4),
        headers: { Accept: "image/png,image/jpeg,image/webp" },
      },
      (res) => {
        if (
          res.statusCode !== 200 ||
          !/^image\/(png|jpeg|webp)(;|$)/i.test(
            res.headers["content-type"] || "",
          )
        ) {
          res.resume();
          reject(
            new ContentError(
              "Image source unavailable / 图片来源暂不可用",
              502,
            ),
          );
          return;
        }
        let size = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            req.destroy(new ContentError("Image too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.setTimeout(20000, () =>
      req.destroy(new ContentError("Image source timed out", 504)),
    );
    req.on("error", reject);
    req.end();
  });
}
