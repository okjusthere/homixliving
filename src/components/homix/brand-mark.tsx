import Image from "next/image";

const HOMIX_MARK_URL = "https://www.homixny.com/homix-mark.webp";

export function HomixMark({ size = 40 }: { size?: number }) {
  return (
    <Image
      src={HOMIX_MARK_URL}
      alt="Homix"
      width={1500}
      height={699}
      unoptimized
      priority
      className="w-auto object-contain"
      style={{ height: size }}
    />
  );
}
