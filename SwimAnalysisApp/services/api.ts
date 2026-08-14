import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const API_PORT = 3000;

// Resolve the backend URL without hardcoding an IP. Order of preference:
//   1. EXPO_PUBLIC_API_URL env var (for staging/production builds)
//   2. The dev machine's host that Expo/Metro is already serving from — this
//      makes the app reach the backend from both the iOS simulator and a
//      physical device on the same Wi-Fi, even when the LAN IP changes.
//   3. localhost fallback.
function resolveApiUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit;

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any).expoGoConfig?.debuggerHost ||
    (Constants as any).manifest2?.extra?.expoClient?.hostUri;
  const host = hostUri ? hostUri.split(':')[0] : 'localhost';
  return `http://${host}:${API_PORT}/api`;
}

const API_URL = resolveApiUrl();

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