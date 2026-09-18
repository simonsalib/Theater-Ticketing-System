"use client";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import { useEffect, ReactNode } from "react";
import { UserRole } from "../types/auth";
import Loader from "@/components/shared/Loader";

interface ProtectedRouteProps {
    children: ReactNode;
    requiredRole?: UserRole | UserRole[];
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/login");
        } else if (!loading && user && requiredRole) {
            const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
            if (!roles.includes(user.role)) {
                router.replace("/events");
            }
        }
    }, [user, loading, requiredRole, router]);

    if (loading) {
        return <Loader message="Checking your session..." />;
    }

    if (!user) {
        return <Loader message="Redirecting to sign in..." />;
    }

    if (requiredRole) {
        const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
        if (!roles.includes(user.role)) return <Loader message="Redirecting..." />;
    }

    return <>{children}</>;
};
