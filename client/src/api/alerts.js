import client from './client';

export async function broadcastAlert(data) {
  const response = await client.post('/alerts', data);
  return response.data.data ?? response.data;
}

export async function listAlerts(params) {
  const response = await client.get('/alerts', { params });
  return response.data; // includes { data, meta }
}

export async function retractAlert(id) {
  const response = await client.patch(`/alerts/${id}/retract`);
  return response.data.data ?? response.data;
}
