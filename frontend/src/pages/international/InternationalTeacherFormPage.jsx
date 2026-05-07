import { useNavigate, useParams } from 'react-router-dom';
import styles from '../private/TeacherFormPage.module.css';

/**
 * Placeholder — full create/edit form to be implemented in a later phase.
 */
export default function InternationalTeacherFormPage() {
  const navigate = useNavigate();
  const { id }   = useParams();
  const isEdit   = Boolean(id);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>
        {isEdit ? 'Edit Teacher' : 'Add Teacher'}
      </h1>
      <p style={{ color: 'var(--color-text-muted, #6b7280)', marginTop: '1rem' }}>
        This form is not yet implemented.
      </p>
      <div className={styles.actions} style={{ marginTop: '1.5rem' }}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() =>
            navigate(isEdit ? `/international/teachers/${id}` : '/international/teachers')
          }
        >
          ← Back
        </button>
      </div>
    </div>
  );
}
