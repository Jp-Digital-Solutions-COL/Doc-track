import { derivePalette } from "@/lib/branding/derive-palette";

export function BrandStyle({ brandColor }: { brandColor: string | null }) {
  if (!brandColor) return null;
  const vars = derivePalette(brandColor);
  const css = Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
  return <style>{`:root{${css};}`}</style>;
}
