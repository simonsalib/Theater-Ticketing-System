// Use environment variable for production, fallback to localhost for development
const getBaseUrl = () => {
    // Check for environment variable first (for production)
    if (process.env.NEXT_PUBLIC_API_URL) {
        // Remove trailing slash and /api/v1 suffix if present
        return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '').replace(/\/api\/v1$/, '');
    }

    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname;

        return `http://${hostname}:8000`;
      // In the browser, use the current hostname so devices on the local network
     // call <LAN-IP>:8000 instead of their own localhost:8000.
    }
    return "http://localhost:8000";
};

export const BASE_URL = getBaseUrl();
export const API_BASE_URL = `${BASE_URL}/api/v1`;
