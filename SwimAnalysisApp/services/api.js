import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://192.168.0.17:3000/api'; // Replace X with your computer's IP
// For local testing: http://localhost:3000/api

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Add token to requests
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Auth endpoints
export const authAPI = {
  register: (username: string, email: string, password: string) =>
    api.post('/auth/register', { username, email, password }),
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  getMe: () => api.get('/auth/me'),
  updateProfile: (profile: any) =>
    api.put('/auth/update', { profile }),
};

// Session endpoints
export const sessionAPI = {
  createSession: (data: any) => api.post('/sessions', data),
  getSessions: (limit = 20, skip = 0) =>
    api.get(`/sessions?limit=${limit}&skip=${skip}`),
  getSession: (id: string) => api.get(`/sessions/${id}`),
  updateSession: (id: string, data: any) =>
    api.put(`/sessions/${id}`, data),
  deleteSession: (id: string) => api.delete(`/sessions/${id}`),
  addStrokes: (id: string, strokes: any) =>
    api.post(`/sessions/${id}/strokes`, { strokes }),
  getAnalytics: (days = 30) =>
    api.get(`/sessions/analytics/summary?days=${days}`),
};

export default api;