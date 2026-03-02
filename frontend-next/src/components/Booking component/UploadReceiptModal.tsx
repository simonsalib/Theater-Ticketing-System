import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUploadCloud, FiX, FiCheckCircle, FiAlertCircle, FiImage } from 'react-icons/fi';
import api from '@/services/api';
import { toast } from 'react-toastify';
import './UploadReceiptModal.css';

interface UploadReceiptModalProps {
    isOpen: boolean;
    onClose: () => void;
    bookingId: string;
    onSuccess: (bookingId: string) => void;
}

const UploadReceiptModal: React.FC<UploadReceiptModalProps> = ({ isOpen, onClose, bookingId, onSuccess }) => {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];

            // Basic validation
            if (!selectedFile.type.startsWith('image/')) {
                toast.error('Please select an image file');
                return;
            }

            if (selectedFile.size > 5 * 1024 * 1024) { // 5MB limit
                toast.error('Image size should be less than 5MB');
                return;
            }

            setFile(selectedFile);

            // Create preview
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewUrl(reader.result as string);
            };
            reader.readAsDataURL(selectedFile);
        }
    };

    const handleUpload = async () => {
        if (!file || !previewUrl) {
            toast.error('Please select a receipt image first');
            return;
        }

        try {
            setIsUploading(true);
            const response = await api.post(`/booking/${bookingId}/receipt`, {
                receiptBase64: previewUrl
            });

            if (response.data?.success) {
                toast.success('Receipt uploaded successfully! Awaiting organizer verification.');
                onSuccess(bookingId);
                onClose();
            } else {
                toast.error(response.data?.message || 'Failed to upload receipt');
            }
        } catch (error: any) {
            console.error('Error uploading receipt:', error);
            toast.error(error.response?.data?.message || 'Something went wrong while uploading');
        } finally {
            setIsUploading(false);
        }
    };

    const resetSelection = () => {
        setFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="modal-overlay" onClick={onClose}>
                <motion.div
                    className="upload-modal-content"
                    onClick={(e) => e.stopPropagation()}
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                >
                    <button className="close-button" onClick={onClose} disabled={isUploading}>
                        <FiX size={24} />
                    </button>

                    <div className="upload-header">
                        <div className="upload-icon-wrapper">
                            <FiUploadCloud size={32} />
                        </div>
                        <h2>Upload InstaPay Receipt</h2>
                        <p className="upload-subtitle">Provide proof of your transaction to confirm your booking.</p>
                    </div>

                    <div className="warning-box">
                        <FiAlertCircle className="warning-icon" />
                        <div className="warning-text">
                            <strong>Important / هام</strong>
                            <p>Please transfer via InstaPay using ONLY ONE account and upload ONLY ONE screenshot.</p>
                            <p dir="rtl" className="arabic-text">يتم التحويل الانستا باي عن طريق حساب واحد فقط و رفع صورة واحدة فقط.</p>
                        </div>
                    </div>

                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />

                    {!previewUrl ? (
                        <div
                            className="upload-dropzone"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <FiImage size={48} className="dropzone-icon" />
                            <h3>Click to browse files</h3>
                            <p>PNG, JPG or JPEG (Max 5MB)</p>
                        </div>
                    ) : (
                        <div className="preview-container">
                            <div className="image-preview-wrapper">
                                <img src={previewUrl} alt="Receipt Preview" className="receipt-preview-img" />
                                <button
                                    className="remove-image-btn"
                                    onClick={resetSelection}
                                    disabled={isUploading}
                                    title="Remove image"
                                >
                                    <FiX />
                                </button>
                            </div>
                            <div className="file-info">
                                <FiCheckCircle color="#10b981" />
                                <span>{file?.name}</span>
                            </div>
                        </div>
                    )}

                    <div className="upload-actions">
                        <button
                            className="cancel-btn"
                            onClick={onClose}
                            disabled={isUploading}
                        >
                            Cancel
                        </button>
                        <button
                            className="submit-btn"
                            onClick={handleUpload}
                            disabled={!file || isUploading}
                        >
                            {isUploading ? (
                                <><span className="spinner-small"></span> Uploading...</>
                            ) : (
                                'Submit Receipt'
                            )}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default UploadReceiptModal;
