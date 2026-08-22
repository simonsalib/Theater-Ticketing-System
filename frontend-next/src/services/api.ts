import axios from "axios";
import { API_BASE_URL } from "../config";

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
            // Add the JWT Bearer token to the Authorization header in requests headers.
            // The backend uses it to authenticate the user,
            // validate the token, and authorize access based on the user's role.
        }
    }
    return config;
});

export default api;
