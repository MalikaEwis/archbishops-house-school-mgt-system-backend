import client from './client';

export async function fetchInternationalTeachers(params = {}) {
  const query = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  );
  const { data } = await client.get('/international-teachers', { params: query });
  return data.data; // { items, pagination }
}

export async function fetchInternationalTeacher(id) {
  const { data } = await client.get(`/international-teachers/${id}`);
  return data.data;
}

export async function createInternationalTeacher(body) {
  const { data } = await client.post('/international-teachers', body);
  return data.data;
}

export async function updateInternationalTeacher(id, body) {
  const { data } = await client.patch(`/international-teachers/${id}`, body);
  return data.data;
}

export async function uploadInternationalTeacherProfilePicture(id, file) {
  const form = new FormData();
  form.append('profile_picture', file);
  const { data } = await client.put(`/international-teachers/${id}/profile-picture`, form, {
    headers: { 'Content-Type': undefined },
  });
  return data.data;
}

export async function removeInternationalTeacherProfilePicture(id) {
  const { data } = await client.delete(`/international-teachers/${id}/profile-picture`);
  return data.data;
}
