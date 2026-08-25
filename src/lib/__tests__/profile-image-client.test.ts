import assert from "node:assert/strict";
import {
  isHeicFile,
  isHeicFilename,
  isHeicMime,
  isHeicSignature,
} from "../profile-image-client";

function signature(brand: string) {
  return new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...Buffer.from(brand)]);
}

assert.equal(isHeicFilename("IMG_1234.HEIC"), true);
assert.equal(isHeicFilename("portrait.jpg"), false);
assert.equal(isHeicMime("image/heif"), true);
assert.equal(isHeicMime("image/jpeg"), false);
assert.equal(isHeicSignature(signature("heic")), true);
assert.equal(isHeicSignature(signature("mif1")), true);
assert.equal(isHeicSignature(signature("jpeg")), false);

async function main() {
  const extensionOnly = new File([new Uint8Array(16)], "camera.heic", { type: "" });
  assert.equal(await isHeicFile(extensionOnly), true);

  const signatureOnly = new File([signature("heix")], "camera.bin", { type: "application/octet-stream" });
  assert.equal(await isHeicFile(signatureOnly), true);

  console.log("profile image client tests passed");
}

void main();
