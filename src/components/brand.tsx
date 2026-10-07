export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        M<span>✦</span>
      </span>
      <div>
        <strong>AKH MASTANI</strong>
        {!compact && <small>ONE TEAM. EVERY BEAT.</small>}
      </div>
    </div>
  );
}
