"use client";
import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { toast } from "react-toastify";
import api, { AUTH_EXPIRED_EVENT, clearStoredAuth } from "../services/api";
import { User, ApiResponse, AuthResponse } from "../types/auth";

interface LoginResult {
    success: boolean;
    user?: User;
    error?: string;
    requiresVerification?: boolean;
    requiresPasswordChange?: boolean;
    email?: string;
}

interface AuthContextType {
    user: User | null;
    authenticated: boolean;
    isAuthenticated: boolean;
    isAdmin: boolean;
    isOrganizer: boolean;
    isScanner: boolean;
    login: (credentials: { email: string; password: string }) => Promise<LoginResult>;
    logout: () => Promise<{ success: boolean; error?: string }>;
    updateUser: (userData: Partial<User>) => void;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [authenticated, setAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const resetAuth = () => {
            if (!active) return;
            setUser(null);
            setAuthenticated(false);
            setLoading(false);
        };
        const fetchUser = async () => {
            try {
                const res = await api.get<ApiResponse<User>>("/user/profile");
                if (!active) return;
                if (res.data.success) {
                    setUser(res.data.data);
                    setAuthenticated(true);
                } else {
                    resetAuth();
                }
            } catch {
                clearStoredAuth();
                resetAuth();
            } finally {
                if (active) setLoading(false);
            }
        };

        const hasStoredToken = typeof window !== 'undefined' && Boolean(localStorage.getItem('token'));
        window.addEventListener(AUTH_EXPIRED_EVENT, resetAuth);
        if (hasStoredToken) {
            fetchUser();
        } else {
            setLoading(false);
        }
        return () => {
            active = false;
            window.removeEventListener(AUTH_EXPIRED_EVENT, resetAuth);
        };
    }, []);

    const login = async (credentials: { email: string; password: string }): Promise<LoginResult> => {
        try {
            const response = await api.post<AuthResponse>("/auth/login", credentials);

            if (response.data && response.data.success && response.data.data) {
                const { user, token } = response.data.data;
                setUser(user);
                setAuthenticated(true);
                localStorage.setItem('isAuthenticated', 'true');
                if (token) {
                    localStorage.setItem('token', token);
                }
                return { success: true, user };
            }

            return { success: false, error: "Login failed" };
        } catch (err: any) {
            console.log("Login error caught in AuthContext:", err.response?.status, err.response?.data);

            const errorData = err.response?.data;
            const messageData = typeof errorData?.message === 'object' ? errorData.message : errorData;
            const errorMsg = typeof errorData?.message === 'string' ? errorData.message : messageData?.message;

            // Handle admin-created users needing password change
            if (err.response?.status === 403 && (messageData?.requiresPasswordChange || errorData?.requiresPasswordChange)) {
                return {
                    success: false,
                    requiresPasswordChange: true,
                    email: messageData?.email || errorData?.email,
                    error: messageData?.message || errorData?.message || 'Please set your own password.'
                };
            }

            // Handle verification required
            if (err.response?.status === 403 && (messageData?.requiresVerification || errorData?.requiresVerification || (typeof errorMsg === 'string' && errorMsg.toLowerCase().includes("verify")))) {
                return {
                    success: false,
                    requiresVerification: true,
                    email: credentials.email,
                    error: errorMsg || "Verification required"
                };
            }

            return { success: false, error: errorMsg || "Login failed" };
        }
    };

    const logout = async () => {
        try {
            await api.post('/auth/logout');
            toast.success("Logged out successfully");
            return { success: true };
        } catch (error: any) {
            // A local logout must still succeed when the server is offline or the token has expired.
            toast.info("Signed out on this device.");
            return { success: false, error: error.response?.data?.message || "Error logging out" };
        } finally {
            clearStoredAuth();
            setUser(null);
            setAuthenticated(false);
        }
    };

    const updateUser = (userData: Partial<User>) => {
        setUser(prev => prev ? { ...prev, ...userData } : null);
    };

    return (
        <AuthContext.Provider value={{
            user,
            authenticated,
            isAuthenticated: authenticated,
            isAdmin: user?.role === 'System Admin',
            isOrganizer: user?.role === 'Organizer',
            isScanner: user?.role === 'Scanner',
            login,
            logout,
            updateUser,
            loading
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
