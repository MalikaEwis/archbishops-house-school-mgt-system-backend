import styles from './StatusBadge.module.css';

/**
 * Shared status badge used across all three modules.
 *
 * @param {{ status: string, variant?: string }} props
 *
 * status    — the display label (e.g. 'Active', 'Pending', 'Approved')
 * variant   — optional CSS class override; auto-derived from status when omitted
 *
 * Auto-derived variant map:
 *   Active   → active   (green)
 *   Removed  → removed  (danger red)
 *   Pending  → pending  (amber)
 *   Approved → approved (danger red — signifies a removal was confirmed)
 *   Rejected → rejected (neutral gray)
 *   anything else → neutral
 */

const VARIANT_MAP = {
  Active:   'active',
  Removed:  'removed',
  Pending:  'pending',
  Approved: 'approved',
  Rejected: 'rejected',
};

export default function StatusBadge({ status, variant }) {
  const v = variant ?? VARIANT_MAP[status] ?? 'neutral';
  return (
    <span className={`${styles.badge} ${styles[v] ?? styles.neutral}`}>
      {status}
    </span>
  );
}
