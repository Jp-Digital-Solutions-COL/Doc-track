import Image from "next/image";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/doc-track-logo-nombre.png"
      alt="Doc-Track"
      width={917}
      height={274}
      priority
      className={className ?? "mx-auto h-10 w-auto"}
    />
  );
}
