import { useParams, useNavigate } from 'react-router-dom';
import styles from './TeacherDetailPage.module.css';

export default function TeacherDetailPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(-1)}>
        ← Back to list
      </button>
      <h1 className={styles.heading}>Teacher #{id}</h1>
      <div className={styles.placeholder}>
        <p>Detail view coming soon.</p>
      </div>
    </div>
  );
}
