'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/auth/AuthContext';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import api from '@/services/api';
import { FiCamera, FiCalendar, FiMapPin, FiClock, FiLogOut, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'react-toastify';
import './scanner.css';

interface Event {
    _id: string;
    title: string;
    date: string;
    location?: string;
    imageUrl?: string;
}

const ScannerDashboard = () => {
    const { user, logout } = useAuth();
    const router = useRouter();
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            const res = await api.get('/event/approved');
            const data = res.data.success ? res.data.data : (res.data.events || res.data || []);
            const eventsList = Array.isArray(data) ? data : [];

            const now = new Date();
            const activeEvents = eventsList.filter((event: Event) => {
                if (!event.date) return false;
                const eventDate = new Date(event.date);
                const expirationDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
                return now < expirationDate;
            });

            setEvents(activeEvents);
        } catch (err) {
            console.error('Error fetching events:', err);
            toast.error('Failed to load events');
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        await logout();
        router.push('/login');
    };

    const formatDate = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    const formatTime = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch {
            return '';
        }
    };

    return (
        <ProtectedRoute requiredRole="Scanner">
            <div className="scanner-dashboard">
                <div className="scanner-dash-bg"></div>

                <div className="scanner-dash-container">
                    {/* Modern Standalone Header */}
                    <div className="scanner-dash-header-compact">
                        <div className="scanner-header-main">
                            <div className="scanner-app-badge">
                                <FiCamera size={22} />
                            </div>
                            <div className="scanner-user-info">
                                <h1>{user?.name || 'Scanner'}</h1>
                                <span className="scanner-role-badge">Official Scanner</span>
                            </div>
                        </div>
                        <button className="scanner-logout-circle" onClick={handleLogout} title="Logout">
                            <FiLogOut size={20} />
                        </button>
                    </div>

                    {/* Quick Controls */}
                    <div className="scanner-quick-controls">
                        <div className="quick-control-card active">
                            <div className="qc-icon"><FiCalendar /></div>
                            <div className="qc-text">
                                <h3>Scan Events</h3>
                                <p>Select event to scan</p>
                            </div>
                        </div>
                        <div className="quick-control-card" onClick={() => window.location.reload()}>
                            <div className="qc-icon"><FiRefreshCw /></div>
                            <div className="qc-text">
                                <h3>Sync Data</h3>
                                <p>Update event list</p>
                            </div>
                        </div>
                    </div>

                    {/* Events List */}
                    <h2 className="scanner-dash-section-title">
                        <FiCalendar /> Available Events
                    </h2>

                    {loading ? (
                        <div className="scanner-dash-loading">
                            <div className="scanner-dash-spinner"></div>
                            <p>Loading events...</p>
                        </div>
                    ) : events.length === 0 ? (
                        <div className="scanner-dash-empty">
                            <FiCalendar size={48} />
                            <h3>No Events Available</h3>
                            <p>There are no events to scan at the moment.</p>
                        </div>
                    ) : (
                        <div className="scanner-events-grid">
                            {events.map((event) => (
                                <div key={event._id} className="scanner-event-card">
                                    <div className="scanner-event-info">
                                        <h3 className="scanner-event-title">{event.title}</h3>
                                        <div className="scanner-event-details">
                                            <span className="scanner-event-detail">
                                                <FiCalendar size={14} />
                                                {formatDate(event.date)}
                                            </span>
                                            <span className="scanner-event-detail">
                                                <FiClock size={14} />
                                                {formatTime(event.date)}
                                            </span>
                                            {event.location && (
                                                <span className="scanner-event-detail">
                                                    <FiMapPin size={14} />
                                                    {event.location}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        className="scanner-scan-btn"
                                        onClick={() => router.push(`/scanner/${event._id}`)}
                                    >
                                        <FiCamera size={20} />
                                        Scan QR
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </ProtectedRoute>
    );
};

export default ScannerDashboard;
