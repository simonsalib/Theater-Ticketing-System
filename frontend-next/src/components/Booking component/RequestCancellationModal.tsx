"use client";
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiSend, FiCheckSquare, FiSquare } from 'react-icons/fi';
import { useLanguage } from '@/contexts/LanguageContext';
import './CancelSeatsModal.css';

interface Seat {
    row: string;
    seatNumber: number;
    section: string;
    seatType?: string;
    price?: number;
    seatLabel?: string;
}

interface RequestCancellationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (seatKeys: string[], cancelAll: boolean, reason: string) => void;
    seats: Seat[];
    isLoading?: boolean;
    isRTL?: boolean;
}

const RequestCancellationModal: React.FC<RequestCancellationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    seats,
    isLoading = false,
    isRTL = false,
}) => {
    const { t } = useLanguage();
    const [selectedSeatKeys, setSelectedSeatKeys] = useState<Set<string>>(new Set());
    const [selectAll, setSelectAll] = useState(false);
    const [reason, setReason] = useState('');

    const getSeatKey = (seat: Seat) => `${seat.section}-${seat.row}-${seat.seatNumber}`;

    const toggleSeat = (seat: Seat) => {
        const key = getSeatKey(seat);
        const newSelected = new Set(selectedSeatKeys);
        if (newSelected.has(key)) {
            newSelected.delete(key);
        } else {
            newSelected.add(key);
        }
        setSelectedSeatKeys(newSelected);
        setSelectAll(newSelected.size === seats.length);
    };

    const toggleSelectAll = () => {
        if (selectAll) {
            setSelectedSeatKeys(new Set());
            setSelectAll(false);
        } else {
            setSelectedSeatKeys(new Set(seats.map(getSeatKey)));
            setSelectAll(true);
        }
    };

    const handleConfirm = () => {
        const isAll = selectedSeatKeys.size === seats.length;
        onConfirm(Array.from(selectedSeatKeys), isAll, reason);
    };

    const selectedPrice = seats
        .filter((s) => selectedSeatKeys.has(getSeatKey(s)))
        .reduce((sum, s) => sum + (s.price || 0), 0);

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="cancel-seats-overlay" onClick={onClose}>
                <motion.div
                    className="cancel-seats-modal"
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    style={{ direction: isRTL ? 'rtl' : 'ltr', textAlign: isRTL ? 'right' : 'left' }}
                >
                    <div className="csm-header">
                        <h2>{t('booking.requestCancellation')}</h2>
                        <button className="csm-close-btn" onClick={onClose}>
                            <FiX size={20} />
                        </button>
                    </div>

                    <p className="csm-subtitle">
                        {t('modal.cancelSeats.descConfirmed')}
                    </p>

                    <div className="csm-select-all" onClick={toggleSelectAll}>
                        {selectAll ? (
                            <FiCheckSquare size={20} className="csm-check-icon checked" />
                        ) : (
                            <FiSquare size={20} className="csm-check-icon" />
                        )}
                        <span>{t('gen.selectAll').replace('{count}', seats.length.toString())}</span>
                    </div>

                    <div className="csm-seats-grid">
                        {seats.map((seat) => {
                            const key = getSeatKey(seat);
                            const isSelected = selectedSeatKeys.has(key);
                            return (
                                <motion.div
                                    key={key}
                                    className={`csm-seat-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleSeat(seat)}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                >
                                    <div className="csm-seat-check">
                                        {isSelected ? (
                                            <FiCheckSquare size={18} className="csm-check-icon checked" />
                                        ) : (
                                            <FiSquare size={18} className="csm-check-icon" />
                                        )}
                                    </div>
                                    <div className="csm-seat-info">
                                        <span className="csm-seat-label">
                                            {seat.seatLabel || `${seat.row}${seat.seatNumber}`}
                                        </span>
                                        <span className="csm-seat-type">{seat.seatType || t('modal.cancelSeats.standard')}</span>
                                    </div>
                                    <span className="csm-seat-price">
                                        {(seat.price || 0).toFixed(2)} EGP
                                    </span>
                                </motion.div>
                            );
                        })}
                    </div>

                    <div className="csm-reason-field">
                        <label htmlFor="cancel-reason">{t('modal.requestCancel.reason')}</label>
                        <textarea
                            id="cancel-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t('modal.requestCancel.placeholder')}
                            rows={3}
                            maxLength={500}
                        />
                    </div>

                    {selectedSeatKeys.size > 0 && (
                        <div className="csm-summary">
                            <span>{t('gen.seatsSelected').replace('{count}', selectedSeatKeys.size.toString())}</span>
                            <span className="csm-refund">{selectedPrice.toFixed(2)} EGP</span>
                        </div>
                    )}

                    <div className="csm-actions">
                        <button className="csm-cancel-btn" onClick={onClose} disabled={isLoading}>
                            {t('gen.goBack')}
                        </button>
                        <button
                            className="csm-confirm-btn"
                            onClick={handleConfirm}
                            disabled={selectedSeatKeys.size === 0 || isLoading}
                            style={{
                                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                                boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
                            }}
                        >
                            <FiSend size={16} />
                            {isLoading ? t('gen.processing') : t('modal.requestCancel.submit')}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default RequestCancellationModal;
