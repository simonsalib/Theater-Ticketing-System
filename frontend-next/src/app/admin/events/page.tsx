"use client";
import React, { useState, useEffect, useMemo } from 'react';
import api from '@/services/api';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCalendar, FiUsers, FiGrid, FiSearch, FiX, FiCheck, FiXCircle, FiClock, FiEye, FiRefreshCw, FiAlertCircle, FiTrendingUp } from 'react-icons/fi';
import { toast } from 'react-toastify';
import EventCard from '@/components/Event Components/EventCard';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { useLanguage } from '@/contexts/LanguageContext';
import { Event } from '@/types/event';
import '@/components/Event Components/AdminEventsPage.css';

const AdminEventsPage = () => {
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeFilter, setActiveFilter] = useState<'pending' | 'approved' | 'declined'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const { t } = useLanguage();

    useEffect(() => { fetchEvents(); }, []);

    const fetchEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<any>(`/event/all`);
            const data = response.data.success ? response.data.data : response.data;
            setEvents(Array.isArray(data) ? data : []);
        } catch (err: any) {
            setError(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredEvents = useMemo(() => {
        const now = new Date();

        // Filter out expired events for the main dashboard views
        const activeEvents = events.filter(event => {
            if (!event.date) return false;
            const eventDate = new Date(event.date);
            const expirationDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000); // 1 day after

            // If the event is expired AND it was declined, it's purged from existence entirely on this list
            if (now >= expirationDate && event.status === 'declined') {
                return false;
            }

            // Otherwise, it's just considered expired and we return false (meaning don't show on active views)
            return now < expirationDate;
        });

        let filtered = activeEvents.filter(event => (event.status as any) === activeFilter);
        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(event => event.title?.toLowerCase().includes(query) || event.location?.toLowerCase().includes(query));
        }
        return filtered;
    }, [events, activeFilter, searchQuery]);

    const stats = useMemo(() => {
        const now = new Date();

        let pending = 0;
        let approved = 0;
        let declined = 0;
        // Total should probably only reflect non-purged active events, or everything minus purged?
        // Let's count active unexpired logic for approve, and pending.

        events.forEach(event => {
            // Calculate expiration exactly as in the filter
            let isExpired = false;
            if (event.date) {
                const expirationDate = new Date(new Date(event.date).getTime() + 24 * 60 * 60 * 1000);
                isExpired = now >= expirationDate;
            }

            if (event.status === 'declined' && isExpired) {
                // Completely purged, don't count it anywhere
                return;
            }

            if (event.status === 'pending' && !isExpired) {
                pending++;
            } else if (event.status === 'approved' && !isExpired) {
                approved++;
            } else if (event.status === 'declined' && !isExpired) {
                declined++;
            }
        });

        return {
            pending,
            approved,
            declined,
            total: pending + approved + declined // Active non-expired total across all categories
        };
    }, [events]);

    const handleStatusChange = async (eventId: string, newStatus: string) => {
        try {
            await api.put(`/event/${eventId}/`, { status: newStatus });
            setEvents(events.map(event => event._id === eventId ? { ...event, status: newStatus as any } : event));
            toast.success(`Event ${newStatus === 'approved' ? 'approved' : 'declined'} successfully`);
        } catch (err: any) {
            const errorMessage = err.response?.data?.message || err.message;
            toast.error(errorMessage);
            setError(errorMessage);
        }
    };

    return (
        <ProtectedRoute requiredRole="System Admin">
            <div className="admin-events-page">
                <div className="admin-page-header">
                    <div className="header-left"><FiCalendar /><div><h1>{t('admin.eventAdmin')}</h1><p>{t('admin.manageSubmissions')}</p></div></div>
                    <div className="header-actions">
                        <Link href="/admin/events/previous" className="nav-btn" style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#8B5CF6' }}>
                            <FiClock /> {t('events.previousEvents')}
                        </Link>
                        <Link href="/admin/users" className="nav-btn"><FiUsers /> {t('admin.users')}</Link>
                        <Link href="/admin/theaters" className="nav-btn"><FiGrid /> {t('admin.theaters')}</Link>
                        <button className="refresh-btn" onClick={fetchEvents} disabled={loading}><FiRefreshCw className={loading ? 'spinning' : ''} /></button>
                    </div>
                </div>
                <div className="stats-grid">
                    <div className="stat-card total"><FiTrendingUp /><span>{stats.total} {t('admin.total')}</span></div>
                    <div className={`stat-card pending ${activeFilter === 'pending' ? 'active' : ''}`} onClick={() => setActiveFilter('pending')}><FiClock /><span>{stats.pending} {t('admin.pending')}</span></div>
                    <div className={`stat-card approved ${activeFilter === 'approved' ? 'active' : ''}`} onClick={() => setActiveFilter('approved')}><FiCheck /><span>{stats.approved} {t('admin.approved')}</span></div>
                    <div className={`stat-card declined ${activeFilter === 'declined' ? 'active' : ''}`} onClick={() => setActiveFilter('declined')}><FiXCircle /><span>{stats.declined} {t('admin.declined')}</span></div>
                </div>
                <div className="controls-section">
                    <div className="search-box"><FiSearch /><input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></div>
                </div>
                {loading ? <div className="loading">Loading...</div> : (
                    <div className="events-grid">
                        {filteredEvents.map(event => (
                            <div key={event._id} className="event-admin-card">
                                <EventCard event={event} />
                                <div className="event-admin-actions">
                                    <Link href={`/events/${event._id}`} className="action-btn view"><FiEye /> {t('admin.details')}</Link>
                                    {activeFilter === 'pending' && (<><button className="action-btn approve" onClick={() => handleStatusChange(event._id, 'approved')}><FiCheck /> {t('admin.approve')}</button><button className="action-btn decline" onClick={() => handleStatusChange(event._id, 'declined')}><FiXCircle /> {t('admin.decline')}</button></>)}
                                    {activeFilter === 'approved' && <button className="action-btn decline" onClick={() => handleStatusChange(event._id, 'declined')}><FiXCircle /> {t('admin.revoke')}</button>}
                                    {activeFilter === 'declined' && <button className="action-btn approve" onClick={() => handleStatusChange(event._id, 'approved')}><FiCheck /> {t('admin.approve')}</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </ProtectedRoute>
    );
};

export default AdminEventsPage;
