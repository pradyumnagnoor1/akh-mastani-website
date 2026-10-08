import Image from "next/image";
import Link from "next/link";

export function Brand({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href="/home"
      aria-label="AKH Mastani home"
      className={`brand${compact ? " brand-compact" : ""}`}
      onNavigate={onNavigate}
    >
      <Image
        className="brand-logo"
        src="/team-logo.jpeg"
        width={48}
        height={50}
        alt=""
      />
      <strong>AKH MASTANI</strong>
    </Link>
  );
}
