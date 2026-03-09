// Use environment variable for production, fallback to localhost for development
const getBaseUrl = () => {
    // Check for environment variable first (for production)
    if (process.env.NEXT_PUBLIC_API_URL) {
        // Remove trailing slash and /api/v1 suffix if present
        return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
    }

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;
        // If we're on the production azure domain, use it as the base
        if (hostname.includes('azurewebsites.net')) {
            return `https://${hostname}`;
        }
        // Client-side development: use the current hostname
        return `http://${hostname}:8000`;
    }
    // Server-side fallback
    return "http://localhost:8000";
};

export const BASE_URL = getBaseUrl();
export const API_BASE_URL = `${BASE_URL}/api/v1`;
