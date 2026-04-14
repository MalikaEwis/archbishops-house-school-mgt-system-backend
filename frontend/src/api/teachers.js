import client from './client';

/**
 * GET /api/teachers
 *
 * @param {object} params
 * @param {string} [params.name]       - partial name search
 * @param {number} [params.category]   - present_category filter (1–4)
 * @param {string} [params.isActive]   - undefined = active only | 'all' | '0' = removed
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
export async function fetchTeachers(params = {}) {
  // Drop undefined values so axios doesn't send empty query params
  const query = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  );
  const { data } = await client.get('/teachers', { params: query });
  return data.data; // { items, pagination }
}

/**
 * GET /api/teachers/:id
 *
 * @param {number|string} id
 * @returns {Promise<object>} full teacher profile with satellite data
 */
export async function fetchTeacher(id) {
  const { data } = await client.get(`/teachers/${id}`);
  return data.data;
}
