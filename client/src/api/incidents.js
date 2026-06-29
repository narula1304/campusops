import client from './client';

export async function aiClassifyIncident(title, description) {
  const response = await client.post('/incidents/ai-classify', { title, description });
  return response.data.data;
}

export async function createIncident(data) {
  const response = await client.post('/incidents', data);
  return response.data.data;
}

export async function listIncidents(params) {
  const response = await client.get('/incidents', { params });
  return response.data; // includes { data, meta }
}

export async function getIncident(id) {
  const response = await client.get(`/incidents/${id}`);
  return response.data.data;
}

export async function assignIncident(id) {
  const response = await client.post(`/incidents/${id}/assign`);
  return response.data.data;
}

export async function resolveIncident(id, data) {
  const response = await client.post(`/incidents/${id}/resolve`, data);
  return response.data.data;
}

export async function submitFeedback(id, data) {
  const response = await client.post(`/incidents/${id}/feedback`, data);
  return response.data.data;
}
