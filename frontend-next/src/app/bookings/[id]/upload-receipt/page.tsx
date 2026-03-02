'use client';

import React, { useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUploadCloud, FiX, FiCheckCircle, FiAlertCircle, FiImage, FiArrowLeft } from 'react-icons/fi';
import api from '@/services/api';
import { toast } from 'react-toastify';
import '@/components/RegisterForm.css'; // For the generic auth layout
import '@/components/Booking component/UploadReceiptModal.css'; // For the upload specific parts
import './UploadReceiptPage.css';

const UploadReceiptPage = () => {
    const router = useRouter();
    const params = useParams();
    const bookingId = params.id as string;

    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    /**
     * Compress image using canvas to reduce base64 payload size.
     * Resizes to max 1200px on the longest side and uses JPEG at 0.7 quality.
     */
    const compressImage = (file: File, maxDimension = 1200, quality = 0.7): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let { width, height } = img;

                    // Scale down if needed
                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = Math.round((height * maxDimension) / width);
                            width = maxDimension;
                        } else {
                            width = Math.round((width * maxDimension) / height);
                            height = maxDimension;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0, width, height);

                    const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                    resolve(compressedDataUrl);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

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

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file || !previewUrl) {
            toast.error('Please select a receipt image first');
            return;
        }

        try {
            setIsUploading(true);

            // Compress image before uploading to avoid 413 Payload Too Large
            const compressedBase64 = await compressImage(file);

            const response = await api.post(`/booking/${bookingId}/receipt`, {
                receiptBase64: compressedBase64
            });

            if (response.data?.success) {
                toast.success('Receipt uploaded successfully! Awaiting organizer verification.');
                setTimeout(() => {
                    router.push('/bookings');
                }, 2000);
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

    const resetSelection = (e: React.MouseEvent) => {
        e.preventDefault();
        setFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="login-container upload-page-container">
            <div className="background-shapes">
                <div className="shape shape-1"></div>
                <div className="shape shape-2"></div>
                <div className="shape shape-3"></div>
            </div>

            <div className="login-card upload-receipt-card" style={{ maxWidth: '600px', width: '90%' }}>
                <div className="card-decoration"></div>

                <button
                    className="back-btn"
                    onClick={() => router.back()}
                    disabled={isUploading}
                    style={{ background: 'transparent', border: 'none', color: '#a78bfa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', padding: '10px 0', fontSize: '0.95rem', marginBottom: '10px' }}
                >
                    <FiArrowLeft /> Back
                </button>

                <div className="upload-header">
                    <div className="upload-icon-wrapper" style={{ margin: '0 auto 1rem', background: 'rgba(54, 158, 255, 0.15)', color: '#369eff' }}>
                        <FiUploadCloud size={32} />
                    </div>
                    <h1 className="login-title" style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>Upload Receipt</h1>
                    <p className="upload-subtitle" style={{ textAlign: 'center', marginBottom: '1.5rem', color: '#9ca3af' }}>Provide proof of your transaction to confirm your booking.</p>
                </div>

                <div className="warning-box" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
                    <FiAlertCircle className="warning-icon" style={{ color: '#f59e0b', fontSize: '1.5rem', marginTop: '0.2rem' }} />
                    <div className="warning-text">
                        <strong style={{ color: '#fbbf24', display: 'block', marginBottom: '0.3rem' }}>Important / هام</strong>
                        <p style={{ color: '#e5e7eb', fontSize: '0.9rem', marginBottom: '0.5rem', lineHeight: '1.4' }}>Please transfer via InstaPay using ONLY ONE account and upload ONLY ONE screenshot.</p>
                        <p dir="rtl" className="arabic-text" style={{ fontFamily: 'Tajawal, Cairo, sans-serif', fontSize: '0.95rem', color: '#fcd34d', margin: '0' }}>يتم التحويل الانستا باي عن طريق حساب واحد فقط و رفع صورة واحدة فقط.</p>
                    </div>
                </div>

                <form onSubmit={handleUpload}>
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
                            style={{ border: '2px dashed rgba(54, 158, 255, 0.4)', borderRadius: '12px', padding: '2.5rem 2rem', textAlign: 'center', cursor: 'pointer', background: 'rgba(255, 255, 255, 0.02)', marginBottom: '1.5rem', transition: 'all 0.2s' }}
                        >
                            <FiImage size={48} className="dropzone-icon" style={{ color: '#6b7280', marginBottom: '1rem' }} />
                            <h3 style={{ color: '#e5e7eb', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Click to browse files</h3>
                            <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.85rem' }}>PNG, JPG or JPEG (Max 5MB)</p>
                        </div>
                    ) : (
                        <div className="preview-container" style={{ background: 'rgba(0, 0, 0, 0.2)', borderRadius: '12px', padding: '1rem', marginBottom: '1.5rem' }}>
                            <div className="image-preview-wrapper" style={{ position: 'relative', width: '100%', height: '250px', borderRadius: '8px', overflow: 'hidden', marginBottom: '1rem', background: '#000' }}>
                                <img src={previewUrl} alt="Receipt Preview" className="receipt-preview-img" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                <button
                                    className="remove-image-btn"
                                    onClick={resetSelection}
                                    disabled={isUploading}
                                    title="Remove image"
                                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(239, 68, 68, 0.9)', color: 'white', border: 'none', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                >
                                    <FiX />
                                </button>
                            </div>
                            <div className="file-info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#d1d5db', fontSize: '0.9rem' }}>
                                <FiCheckCircle color="#10b981" />
                                <span>{file?.name}</span>
                            </div>
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={() => router.back()}
                            disabled={isUploading}
                            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#9ca3af', flex: 1 }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={!file || isUploading}
                            style={{ flex: 1 }}
                        >
                            {isUploading ? (
                                <>
                                    <span className="form-loader"></span>
                                    Uploading...
                                </>
                            ) : (
                                'Submit Receipt'
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default UploadReceiptPage;
