import client from './client';

export async function fetchVestedSchools(filters = {}) {
  const query = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v !== undefined && v !== ''),
  );
  const { data } = await client.get('/vested/schools', { params: query });
  return data.data;
}

export async function fetchVestedSchool(id) {
  const { data } = await client.get(`/vested/schools/${id}`);
  return data.data;
}

export async function createVestedSchool(body) {
  const { data } = await client.post('/vested/schools', body);
  return data.data;
}

export async function updateVestedSchool(id, body) {
  const { data } = await client.patch(`/vested/schools/${id}`, body);
  return data.data;
}

export async function deleteVestedSchool(id) {
  await client.delete(`/vested/schools/${id}`);
}

export async function addPrincipal(schoolId, body) {
  const { data } = await client.post(`/vested/schools/${schoolId}/principals`, body);
  return data.data;
}

export async function updatePrincipal(schoolId, pid, body) {
  const { data } = await client.patch(`/vested/schools/${schoolId}/principals/${pid}`, body);
  return data.data;
}

export async function archivePrincipal(schoolId, pid, body) {
  const { data } = await client.post(`/vested/schools/${schoolId}/principals/${pid}/archive`, body);
  return data.data;
}

export async function restorePrincipal(schoolId, pid) {
  const { data } = await client.post(`/vested/schools/${schoolId}/principals/${pid}/restore`);
  return data.data;
}

export async function upsertStats(schoolId, body) {
  const { data } = await client.post(`/vested/schools/${schoolId}/stats`, body);
  return data.data;
}

export async function deleteStats(schoolId, year) {
  await client.delete(`/vested/schools/${schoolId}/stats/${year}`);
}
