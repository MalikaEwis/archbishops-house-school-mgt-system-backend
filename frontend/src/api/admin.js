import client from './client';

export async function resetImportPrivate(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/admin/reset-import/private', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}

export async function resetImportInternational(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await client.post('/admin/reset-import/international', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.data;
}
