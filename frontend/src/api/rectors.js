import client from './client';

export async function fetchRectors(params = {}) {
  const { data } = await client.get('/rectors', { params });
  return data.data;
}

export async function fetchRector(id) {
  const { data } = await client.get(`/rectors/${id}`);
  return data.data;
}

export async function createRector(body) {
  const { data } = await client.post('/rectors', body);
  return data.data;
}

export async function updateRector(id, body) {
  const { data } = await client.patch(`/rectors/${id}`, body);
  return data.data;
}
