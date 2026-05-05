import client from './client';

/**
 * GET /api/schools?type=Private
 * Returns schools ordered by school_index.
 */
export async function fetchSchools(type) {
  const { data } = await client.get('/schools', { params: type ? { type } : {} });
  return data.data; // array
}
