export class RequestBodyTooLarge extends Error {}
export async function requestBytes(
  req: Request,
  limit: number,
): Promise<Uint8Array> {
  if (Number(req.headers.get("content-length")) > limit)
    throw new RequestBodyTooLarge();
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RequestBodyTooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
