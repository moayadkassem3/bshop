/**
 * Loading placeholders (v1.7): grey shapes where the list will appear, so the
 * screen does not jump from blank to full. Screen readers hear `label`.
 */
export function SkeletonList({ rows = 3, label = 'Yükleniyor' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="card skeleton-card" aria-hidden>
          <span className="skeleton" style={{ width: '38%', height: 12 }} />
          <span className="skeleton" style={{ width: '72%', height: 18 }} />
          <span className="skeleton" style={{ width: '54%', height: 12 }} />
        </div>
      ))}
    </div>
  );
}
