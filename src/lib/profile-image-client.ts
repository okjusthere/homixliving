export const PROFILE_IMAGE_SOURCE_LIMIT = 25 * 1024 * 1024;
export const PROFILE_IMAGE_UPLOAD_LIMIT = 3 * 1024 * 1024;

export type ProfileImageErrorCode =
  | "source_too_large"
  | "unsupported_image"
  | "heic_conversion_failed"
  | "image_decode_failed"
  | "output_too_large";

export class ProfileImageError extends Error {
  constructor(public readonly code: ProfileImageErrorCode) {
    super(code);
    this.name = "ProfileImageError";
  }
}

const HEIC_EXTENSIONS = /\.(?:heic|heif)$/i;
const IMAGE_EXTENSIONS = /\.(?:jpe?g|png|webp|gif|heic|heif)$/i;
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1"]);

export function isHeicFilename(name: string): boolean {
  return HEIC_EXTENSIONS.test(name);
}

export function isHeicMime(type: string): boolean {
  return HEIC_MIME_TYPES.has(type.toLowerCase());
}

export function isHeicSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  return HEIC_BRANDS.has(new TextDecoder("ascii").decode(bytes.slice(8, 12)));
}

export async function isHeicFile(file: File): Promise<boolean> {
  if (isHeicMime(file.type) || isHeicFilename(file.name)) return true;
  if (file.size < 12) return false;
  return isHeicSignature(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
}

function assertSourceFile(file: File) {
  if (file.size > PROFILE_IMAGE_SOURCE_LIMIT) {
    throw new ProfileImageError("source_too_large");
  }
  if (!file.type.startsWith("image/") && !IMAGE_EXTENSIONS.test(file.name)) {
    throw new ProfileImageError("unsupported_image");
  }
}

async function convertHeic(file: File): Promise<File> {
  try {
    const { heicTo } = await import("heic-to/csp");
    const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
    const base = file.name.replace(/\.(?:heic|heif)$/i, "") || "image";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    throw new ProfileImageError("heic_conversion_failed");
  }
}

export async function prepareHeadshotSource(file: File): Promise<File> {
  assertSourceFile(file);
  return (await isHeicFile(file)) ? convertHeic(file) : file;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ProfileImageError("image_decode_failed"));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ProfileImageError("image_decode_failed"))),
      type,
      quality,
    );
  });
}

export async function prepareQrUpload(source: File): Promise<File> {
  const file = await prepareHeadshotSource(source);
  const image = await loadImage(file);
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new ProfileImageError("image_decode_failed");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let blob = await canvasBlob(canvas, "image/png");
  let name = `${source.name.replace(/\.[^.]+$/, "") || "wechat-qr"}.png`;
  if (blob.size > PROFILE_IMAGE_UPLOAD_LIMIT) {
    context.globalCompositeOperation = "destination-over";
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    blob = await canvasBlob(canvas, "image/jpeg", 0.9);
    name = name.replace(/\.png$/, ".jpg");
  }
  if (blob.size > PROFILE_IMAGE_UPLOAD_LIMIT) {
    throw new ProfileImageError("output_too_large");
  }
  return new File([blob], name, { type: blob.type, lastModified: source.lastModified });
}
