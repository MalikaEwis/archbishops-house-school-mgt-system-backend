import { useState, useRef } from 'react';
import Swal from 'sweetalert2';
import styles from '../pages/private/TeacherDetailPage.module.css';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

function getInitials(name) {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

export default function ProfilePicture({ picturePath, name, isAdmin, onUpload, onRemove }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Only JPEG, PNG, and WebP images are allowed.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('File exceeds 10 MB limit.');
      return;
    }

    setError('');
    setUploading(true);
    try {
      await onUpload(file);
    } catch (err) {
      setError(err.response?.data?.message ?? 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function handleRemove() {
    const { isConfirmed } = await Swal.fire({
      title: 'Remove profile picture?',
      text: 'The picture will be permanently removed.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#b91c1c',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Yes, remove',
      cancelButtonText: 'Cancel',
    });
    if (!isConfirmed) return;

    setError('');
    setUploading(true);
    try {
      await onRemove();
    } catch (err) {
      setError(err.response?.data?.message ?? 'Remove failed.');
    } finally {
      setUploading(false);
    }
  }

  const imgSrc = picturePath ? `/uploads/${picturePath}` : null;

  return (
    <section className={styles.picSection}>
      <div className={styles.avatarWrap}>
        {imgSrc ? (
          <img src={imgSrc} alt={name ?? 'Profile photo'} className={styles.avatar} />
        ) : (
          <div className={styles.avatarInitials} aria-label={name ?? 'No photo'}>
            {getInitials(name)}
          </div>
        )}
      </div>

      {isAdmin && (
        <div className={styles.picActions}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={styles.fileInput}
            onChange={handleFileChange}
            disabled={uploading}
          />
          <div className={styles.picBtnRow}>
            <button
              className={styles.picBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading…' : picturePath ? 'Replace Photo' : 'Upload Photo'}
            </button>
            {picturePath && (
              <button
                className={`${styles.picBtn} ${styles.picBtnDanger}`}
                onClick={handleRemove}
                disabled={uploading}
              >
                Remove
              </button>
            )}
          </div>
          {error && <p className={styles.picError}>{error}</p>}
        </div>
      )}
    </section>
  );
}
