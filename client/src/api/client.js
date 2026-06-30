import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
});

// Request interceptor — attach JWT token from localStorage
client.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('campusops_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 with retry guard
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      // TODO: When refresh token rotation is implemented:
      // 1. const refreshToken = localStorage.getItem('campusops_refresh_token')
      // 2. if (refreshToken) {
      //      const res = await axios.post('/api/auth/refresh', { refreshToken })
      //      localStorage.setItem('campusops_token', res.data.token)
      //      originalRequest.headers.Authorization = `Bearer ${res.data.token}`
      //      return client(originalRequest)
      //    }

      localStorage.removeItem('campusops_token')
      localStorage.removeItem('campusops_user')
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
);

export default client;
