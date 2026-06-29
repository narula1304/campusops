import client from './client';

export async function listUsers(params) {
  const response = await client.get('/users', { params });
  return response.data; // includes { data, meta }
}

export async function updateMe(data) {
  const response = await client.patch('/users/me', data);
  return response.data.data;
}

export async function updateStaffState(userId, staffState) {
  const response = await client.patch(`/users/${userId}/staff-state`, { staffState });
  return response.data.data;
}
