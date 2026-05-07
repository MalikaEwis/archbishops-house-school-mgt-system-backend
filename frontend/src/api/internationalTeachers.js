import client from './client';

/**
 * GET /api/international-teachers
 *
 * @param {object} params
 * @param {string} [params.name]      - partial name search
 * @param {string} [params.tin]       - partial TIN search
 * @param {string} [params.category]  - 'Permanent' | 'Fixed_Term_Contract'
 * @param {string} [params.isActive]  - undefined = active only | 'all' | '0' = removed
 * @param {number} [params.page]
 * @param {number} [params.limit]
 * @returns {Promise<{ items: object[], pagination: object }>}
 */
export async function fetchInternationalTeachers(params = {}) {
  const query = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== ''),
  );
  const { data } = await client.get('/international-teachers', { params: query });
  return data.data; // { items, pagination }
}

/**
 * GET /api/international-teachers/:id
 *
 * @param {number|string} id
 * @returns {Promise<object>} full teacher profile with phones and contract
 */
export async function fetchInternationalTeacher(id) {
  const { data } = await client.get(`/international-teachers/${id}`);
  return data.data;
}
