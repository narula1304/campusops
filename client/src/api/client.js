import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
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

// Response interceptor — handle 401 by redirecting to login
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default client;
