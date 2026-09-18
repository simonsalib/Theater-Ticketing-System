import axios from "axios";
import { API_BASE_URL } from "../config";

export const AUTH_EXPIRED_EVENT = 'ticketing:auth-expired';

export const clearStoredAuth = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('token');
    localStorage.removeItem('isAuthenticated');
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
};

const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    timeout: 30000, // 30 seconds timeout (allows large base64 image uploads)
});

// Add interceptor to send token from localStorage (fallback for when cookies are blocked)
api.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
    }
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const requestUrl = String(error.config?.url || '');
        const isLoginRequest = requestUrl.includes('/auth/login');
        if (error.response?.status === 401 && !isLoginRequest) {
            clearStoredAuth();
        }
        return Promise.reject(error);
    },
);

export default api;
