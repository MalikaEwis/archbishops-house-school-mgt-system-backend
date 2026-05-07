import client from './client';

export async function fetchFathers(params = {}) {
  const { data } = await client.get('/fathers', { params });
  return data.data;
}

export async function fetchFather(id) {
  const { data } = await client.get(`/fathers/${id}`);
  return data.data;
}

export async function createFather(body) {
  const { data } = await client.post('/fathers', body);
  return data.data;
}

export async function updateFather(id, body) {
  const { data } = await client.patch(`/fathers/${id}`, body);
  return data.data;
}
