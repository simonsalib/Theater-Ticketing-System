"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from "@/services/api";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiCalendar, FiUser, FiArrowRight, FiCamera, FiClock, FiCreditCard, FiRefreshCw } from 'react-icons/fi';
import { useAuth } from '@/auth/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import EventCard from '@/components/Event Components/EventCard';
import { Event } from '@/types/event';
import { findActiveUnpaidBooking, UnpaidBooking } from '@/utils/unpaidBooking';
import '@/components/Event Components/EventList.css';

const EventListPage = () => {
    const [events, setEvents] = useState<Event[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [myEvents, setMyEvents] = useState<Event[]>([]);
    const [scanDropdownOpen, setScanDropdownOpen] = useState(false);
    const [scanEventsLoading, setScanEventsLoading] = useState(false);
    const [unpaidBooking, setUnpaidBooking] = useState<UnpaidBooking | null>(null);
    const [paymentCheckLoading, setPaymentCheckLoading] = useState(true);
    const [paymentCheckError, setPaymentCheckError] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const paymentRequestId = useRef(0);
    const scanDropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const { user, loading: authLoading } = useAuth();
    const { t } = useLanguage();

    const refreshUnpaidBooking = useCallback(async () => {
        const requestId = ++paymentRequestId.current;
        if (user?.role !== 'Standard User') {
            setUnpaidBooking(null);
            setPaymentCheckLoading(false);
            setPaymentCheckError(false);
            return;
        }
        setPaymentCheckLoading(true);
        try {
            const response = await api.get('/booking/my-bookings?unpaidOnly=true');
            if (requestId !== paymentRequestId.current) return;
            setUnpaidBooking(findActiveUnpaidBooking(response.data?.data));
            setPaymentCheckError(false);
        } catch {
            if (requestId === paymentRequestId.current) setPaymentCheckError(true);
        } finally {
            if (requestId === paymentRequestId.current) setPaymentCheckLoading(false);
        }
    }, [user?._id, user?.role]);

    useEffect(() => {
        if (authLoading) return;
        void refreshUnpaidBooking();
    }, [authLoading, refreshUnpaidBooking]);

    useEffect(() => {
        const tick = () => setNow(Date.now());
        const refreshOnFocus = () => void refreshUnpaidBooking();
        const interval = setInterval(tick, 1000);
        window.addEventListener('focus', refreshOnFocus);
        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', refreshOnFocus);
        };
    }, [refreshUnpaidBooking]);

    const paymentSecondsLeft = unpaidBooking
        ? Math.max(0, Math.ceil((new Date(unpaidBooking.pendingExpiresAt).getTime() - now) / 1000))
        : 0;
    const activeUnpaidBooking = paymentSecondsLeft > 0 ? unpaidBooking : null;
    const bookingBlocked = authLoading || (user?.role === 'Standard User' && (paymentCheckLoading || paymentCheckError || !!activeUnpaidBooking));
    const bookingBlockedReason = activeUnpaidBooking ? 'Complete payment first' : paymentCheckError ? 'Booking unavailable' : 'Checking bookings';
    const pendingEventId = typeof activeUnpaidBooking?.eventId === 'object' ? activeUnpaidBooking.eventId._id : activeUnpaidBooking?.eventId;
    const pendingEventTitle = (typeof activeUnpaidBooking?.eventId === 'object' && activeUnpaidBooking.eventId.title)
        || events.find(event => event._id === pendingEventId)?.title || 'your tickets';
    const paymentTimeLeft = paymentSecondsLeft >= 3600
        ? `${Math.floor(paymentSecondsLeft / 3600)}:${String(Math.floor((paymentSecondsLeft % 3600) / 60)).padStart(2, '0')}:${String(paymentSecondsLeft % 60).padStart(2, '0')}`
        : `${Math.floor(paymentSecondsLeft / 60)}:${String(paymentSecondsLeft % 60).padStart(2, '0')}`;

    // Fetch events immediately — no dependency on auth state
    useEffect(() => {
        fetchEvents();
    }, []);

    // Admin redirect — separate from event fetching
    useEffect(() => {
        if (!authLoading && user?.role === "System Admin") {
            router.push('/admin/events');
        }
    }, [user, authLoading, router]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (scanDropdownRef.current && !scanDropdownRef.current.contains(e.target as Node)) {
                setScanDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleScanQRClick = async () => {
        if (scanDropdownOpen) { setScanDropdownOpen(false); return; }
        setScanEventsLoading(true);
        setScanDropdownOpen(true);
        try {
            const response = await api.get<any>('/user/events');
            const data = response.data.success ? response.data.data : response.data;
            if (Array.isArray(data)) {
                const now = new Date();
                const validEvents = data.filter((event: any) => {
                    const isApproved = event.status === 'approved';
                    let isExpired = false;
                    if (event.date) {
                        const eventDate = new Date(event.date);
                        const expirationDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
                        isExpired = now >= expirationDate;
                    }
                    return isApproved && !isExpired;
                });
                setMyEvents(validEvents);
            } else {
                setMyEvents([]);
            }
        } catch {
            setMyEvents([]);
        } finally {
            setScanEventsLoading(false);
        }
    };

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const response = await api.get<any>('/event/approved');
            const data = response.data.success ? response.data.data : response.data;
            if (Array.isArray(data)) {
                const now = new Date();
                const unexpiredEvents = data.filter((event: any) => {
                    if (!event.date) return true;
                    const eventDate = new Date(event.date);
                    const expirationDate = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);
                    return now < expirationDate;
                });
                setEvents(unexpiredEvents);
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
        <motion.div className="event-list-page" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            <div className="page-background">
                <div className="bg-gradient-orb orb-1"></div>
                <div className="bg-gradient-orb orb-2"></div>
                <div className="bg-gradient-orb orb-3"></div>
            </div>

            <div className="event-list-container">
                <motion.div className="page-header" initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
                    {user && (
                        <motion.div className="user-welcome-banner" whileHover={{ scale: 1.01 }} onClick={() => router.push('/profile')}>
                            <div className="welcome-content">
                                <div className="user-avatar">
                                    {user?.profilePicture ? <img src={user.profilePicture} alt="Profile" /> : <span>{user?.name?.charAt(0)?.toUpperCase() || '?'}</span>}
                                    <div className="avatar-ring"></div>
                                </div>
                                <div className="welcome-text">
                                    <h2>{t('events.welcomeBack')} <span>{user?.name || 'User'}</span></h2>
                                    <p className="user-role">{user?.role}</p>
                                </div>
                            </div>
                            <motion.div className="profile-arrow" whileHover={{ x: 5 }}><FiArrowRight size={20} /></motion.div>
                        </motion.div>
                    )}

                    {user?.role === 'Standard User' && activeUnpaidBooking && (
                        <div className="pending-payment-notice" role="status">
                            <div className="pending-payment-icon"><FiCreditCard size={22} /></div>
                            <div className="pending-payment-copy">
                                <strong>Complete your ticket payment</strong>
                                <span>{pendingEventTitle}{activeUnpaidBooking.numberOfTickets ? ` - ${activeUnpaidBooking.numberOfTickets} ${activeUnpaidBooking.numberOfTickets === 1 ? 'ticket' : 'tickets'}` : ''}. Upload your receipt before the timer ends to keep your reservation.</span>
                            </div>
                            <div className="pending-payment-actions">
                                <span className="pending-payment-timer" aria-label="Payment time remaining"><FiClock size={16} /> {paymentTimeLeft}</span>
                                <Link href={`/bookings?payment=${activeUnpaidBooking._id}`} className="pending-payment-link">Complete payment <FiArrowRight size={17} /></Link>
                            </div>
                        </div>
                    )}

                    {user?.role === 'Standard User' && paymentCheckError && !activeUnpaidBooking && (
                        <div className="pending-payment-notice pending-payment-error" role="alert">
                            <span>Booking status is unavailable. Try again before booking new tickets.</span>
                            <button type="button" onClick={() => void refreshUnpaidBooking()}><FiRefreshCw size={16} /> Retry</button>
                        </div>
                    )}

                    <div className="actions-bar">
                        <div className="search-wrapper">
                            <FiSearch className="search-icon" />
                            <input type="text" placeholder={t('events.search')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
                            {searchTerm && <motion.button className="clear-search" onClick={() => setSearchTerm('')} initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.9 }}>×</motion.button>}
                        </div>

                        <div className="action-buttons">
                            {user?.role === "Organizer" && <Link href="/my-events" className="action-btn primary"><FiCalendar /> <span>{t('events.myEvents')}</span></Link>}
                            {user?.role === "Organizer" && (
                                <div className="scan-qr-wrapper" ref={scanDropdownRef} style={{ position: 'relative' }}>
                                    <button className="action-btn secondary" onClick={handleScanQRClick}>
                                        <FiCamera /> <span>{t('events.scanQR')}</span>
                                    </button>
                                    <AnimatePresence>
                                        {scanDropdownOpen && (
                                            <motion.div
                                                className="scan-event-dropdown"
                                                initial={{ opacity: 0, y: -8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -8 }}
                                                transition={{ duration: 0.18 }}
                                                style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 8px)',
                                                    right: 0,
                                                    background: 'var(--card-bg, #1e1e2e)',
                                                    border: '1px solid var(--border-color, #333)',
                                                    borderRadius: '10px',
                                                    minWidth: '220px',
                                                    boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                                                    zIndex: 100,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <div style={{ padding: '10px 14px 6px', fontSize: '0.75rem', color: 'var(--text-muted, #888)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('events.selectToScan')}</div>
                                                {scanEventsLoading ? (
                                                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted, #888)', fontSize: '0.9rem' }}>Loading...</div>
                                                ) : myEvents.length === 0 ? (
                                                    <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted, #888)', fontSize: '0.9rem' }}>{t('events.noEventsFound')}</div>
                                                ) : (
                                                    myEvents.map(event => (
                                                        <button
                                                            key={event._id}
                                                            onClick={() => { setScanDropdownOpen(false); router.push(`/my-events/${event._id}/scan`); }}
                                                            style={{
                                                                display: 'block',
                                                                width: '100%',
                                                                textAlign: 'left',
                                                                padding: '10px 14px',
                                                                background: 'none',
                                                                border: 'none',
                                                                color: 'var(--text-primary, #fff)',
                                                                cursor: 'pointer',
                                                                fontSize: '0.9rem',
                                                                transition: 'background 0.15s',
                                                            }}
                                                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--hover-bg, rgba(255,255,255,0.07))')}
                                                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                                                        >
                                                            {event.title}
                                                        </button>
                                                    ))
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            )}
                            {user?.role === "Standard User" && <Link href="/bookings" className="action-btn secondary"><FiUser /> <span>{t('nav.bookings')}</span></Link>}
                            <Link href="/events/previous" className="action-btn secondary" style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}>
                                <FiCalendar /> <span>{t('events.previousEvents')}</span>
                            </Link>
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
                        <span className="error-icon">⚠️</span><p>{error}</p><button onClick={fetchEvents} className="retry-btn">Try Again</button>
                    </motion.div>
                )}

                {!loading && !error && (
                    <motion.div className="events-grid" variants={containerVariants} initial="hidden" animate="visible">
                        {filteredEvents.length > 0 ? (
                            filteredEvents.map((event, index) => (
                                <motion.div key={event._id} className="event-card-wrapper" variants={itemVariants}>
                                    <EventCard event={event} index={index} bookingBlocked={bookingBlocked} bookingBlockedReason={bookingBlockedReason} />
                                </motion.div>
                            ))
                        ) : (
                            <motion.div className="no-events" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><span className="no-events-icon">🎭</span><h3>{t('events.noEventsFound')}</h3><p>{searchTerm ? `${t('events.noMatch')} "${searchTerm}"` : t('events.checkLater')}</p></motion.div>
                        )}
                    </motion.div>
                )}

                {!loading && !error && filteredEvents.length > 0 && (
                    <motion.div className="results-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>{t('events.showing')} {filteredEvents.length} {filteredEvents.length !== 1 ? t('events.events') : t('events.event')}</motion.div>
                )}
            </div>
        </motion.div>
    );
};

export default EventListPage;
