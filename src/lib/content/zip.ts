/** Streaming ZIP (stored entries): image PNGs are already compressed. */
const table = Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let k = 0; k < 8; k++) crc = (crc & 1) ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const b of bytes) crc = (crc >>> 8) ^ table[(crc ^ b) & 255];
  return (crc ^ 0xffffffff) >>> 0;
}
export function posterFilename(name: string, address: string, theme: string, language: string, id: string) {
  return `${name}_${address}_${theme}_${language}_${id.slice(0, 8)}`.replace(/[\x00-\x1f/\\:*?"<>|]/g, "-").slice(0, 180) + ".png";
}
export async function* zipImages(entries: { name: string; bytes: () => Promise<Buffer> }[]) {
  const central: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const bytes = await entry.bytes();
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(name.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8); directory.writeUInt16LE(33, 14);
    directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(bytes.length, 20); directory.writeUInt32LE(bytes.length, 24); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([directory, name]));
    yield local; yield name; yield bytes;
    offset += local.length + name.length + bytes.length;
  }
  const directory = Buffer.concat(central);
  yield directory;
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  yield end;
}
