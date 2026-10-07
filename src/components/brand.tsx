import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand${compact ? " brand-compact" : ""}`}>
      <Image
        className="brand-logo"
        src="/team-logo.jpeg"
        width={48}
        height={50}
        alt=""
      />
      <strong>AKH MASTANI</strong>
    </div>
  );
}
