import client from './client';

export async function getDashboard(departmentId) {
  const params = departmentId ? { departmentId } : {};
  const response = await client.get('/analytics/dashboard', { params });
  return response.data.data ?? response.data;
}

export async function getStaffPerformance(staffId) {
  const response = await client.get(`/analytics/staff/${staffId}/performance`);
  return response.data.data ?? response.data;
}

export async function getHeatmap(days, category) {
  const params = { days };
  if (category) params.category = category;
  const response = await client.get('/analytics/heatmap', { params });
  return response.data.data ?? response.data;
}
