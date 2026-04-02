"use client";
import React, { useState, useEffect } from 'react';
import api from "@/services/api";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiArrowLeft, FiAlertCircle } from 'react-icons/fi';
import { useLanguage } from '@/contexts/LanguageContext';
import EventCard from '@/components/Event Components/EventCard';
import { Event } from '@/types/event';
import '@/components/Event Components/EventList.css';
import { ProtectedRoute } from '@/auth/ProtectedRoute';

const AdminPreviousEventsPage = () => {
    const [events, setEvents] = useState<Event[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();
    const { t } = useLanguage();

    useEffect(() => {
        fetchEvents();
    }, []);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const response = await api.get<any>('/event/all');
            const data = response.data.success ? response.data.data : response.data;
            if (Array.isArray(data)) {
                const now = new Date();
                const expiredEvents = data.filter((event: any) => {
                    if (!event.date) return false;
                    const eventDate = new Date(event.date);
                    const expirationDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000); // 1 day after event date
                    return now >= expirationDate && event.status === 'approved';
                });
                setEvents(expiredEvents);
            } else {
                setEvents([]);
            }
        } catch (err: any) {
            console.error("Error fetching events:", err);
            setError(err.response?.data?.message || err.message);
        } finally {
            setLoading(false);
        }
    };

    const filteredEvents = events.filter(event =>
        (event.title || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    const containerVariants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.08, delayChildren: 0.2 }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] }
        }
    };

    return (
        <ProtectedRoute requiredRole="System Admin">
            <motion.div className="event-list-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
                <div className="page-background">
                    <div className="bg-gradient-orb orb-1"></div>
                    <div className="bg-gradient-orb orb-2"></div>
                    <div className="bg-gradient-orb orb-3"></div>
                </div>

                <div className="event-list-container">
                    <motion.div className="page-header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                            <Link href="/admin/events" className="action-btn secondary" style={{ padding: '8px 12px' }}>
                                <FiArrowLeft /> <span>{t('admin.backToDashboard')}</span>
                            </Link>
                            <h1 style={{ margin: 0, fontSize: '1.8rem', color: '#fff' }}>{t('admin.previousEventsTitle')}</h1>
                        </div>

                        <div className="actions-bar">
                            <div className="search-wrapper">
                                <FiSearch className="search-icon" />
                                <input type="text" placeholder={t('events.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
                                {searchTerm && <motion.button className="clear-search" onClick={() => setSearchTerm('')} initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }}>×</motion.button>}
                            </div>
                        </div>
                    </motion.div>

                    <AnimatePresence>
                        {loading && (
                            <motion.div className="loading-container" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <div className="loading-spinner"><div className="spinner-ring"></div><div className="spinner-ring"></div><div className="spinner-ring"></div></div>
                                <p>{t('events.loading')}</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {error && (
                        <motion.div className="error-container" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
                            <span className="error-icon"><FiAlertCircle /></span><p>{error}</p><button onClick={fetchEvents} className="retry-btn">{t('gen.tryAgain')}</button>
                        </motion.div>
                    )}

                    {!loading && !error && (
                        <motion.div className="events-grid" variants={containerVariants} initial="hidden" animate="visible">
                            {filteredEvents.length > 0 ? (
                                filteredEvents.map((event, index) => (
                                    <motion.div key={event._id} className="event-card-wrapper" variants={itemVariants}>
                                        <EventCard event={event} index={index} />
                                    </motion.div>
                                ))
                            ) : (
                                <motion.div className="no-events" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                    <span className="no-events-icon">⏳</span>
                                    <h3>{t('events.noPreviousEvents')}</h3>
                                    <p>{searchTerm ? `${t('events.noMatch')} "${searchTerm}"` : t('events.noPreviousEventsDesc')}</p>
                                </motion.div>
                            )}
                        </motion.div>
                    )}

                    {!loading && !error && filteredEvents.length > 0 && (
                        <motion.div className="results-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>{t('events.showing')} {filteredEvents.length} {filteredEvents.length !== 1 ? t('events.events') : t('events.event')}</motion.div>
                    )}
                </div>
            </motion.div>
        </ProtectedRoute>
    );
};

export default AdminPreviousEventsPage;
