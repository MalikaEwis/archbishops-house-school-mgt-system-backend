import styles from './Pagination.module.css';

/**
 * Simple previous / next pagination strip.
 *
 * @param {{ page: number, totalPages: number, total: number, limit: number, onChange: (p: number) => void }} props
 */
export default function Pagination({ page, totalPages, total, limit, onChange }) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * limit + 1;
  const to   = Math.min(page * limit, total);

  return (
    <div className={styles.bar}>
      <span className={styles.info}>
        {from}–{to} of {total}
      </span>
      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          ← Prev
        </button>
        <span className={styles.pages}>
          Page {page} of {totalPages}
        </span>
        <button
          className={styles.btn}
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
