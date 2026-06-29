import client from './client';

export async function listUsers(params) {
  const response = await client.get('/users', { params });
  return response.data; // includes { data, meta }
}
