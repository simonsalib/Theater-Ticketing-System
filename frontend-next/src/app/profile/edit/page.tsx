"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/auth/AuthContext';
import api from '@/services/api';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiMail, FiCamera, FiCheck, FiX, FiArrowLeft, FiDollarSign, FiPhone, FiImage } from 'react-icons/fi';
import '@/components/UserComponent/UpdateProfilePage.css';

const UpdateProfilePageContent = () => {
    const { user, updateUser } = useAuth();
    const router = useRouter();

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        profilePicture: '',
        instapayNumber: '',
        instapayQR: ''
    });

    const [profileImage, setProfileImage] = useState<string | null>(null);
    const [instapayQRImage, setInstapayQRImage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [profilePictureChanged, setProfilePictureChanged] = useState(false);
    const [instapayQRChanged, setInstapayQRChanged] = useState(false);

    // Fetch fresh user data from API to ensure instapayQR and all fields are loaded
    useEffect(() => {
        const fetchFreshProfile = async () => {
            try {
                const res = await api.get('/user/profile');
                const freshUser = res.data.success ? res.data.data : res.data;
                setFormData({
                    name: freshUser.name || '',
                    email: freshUser.email || '',
                    phone: freshUser.phone || '',
                    profilePicture: freshUser.profilePicture || '',
                    instapayNumber: freshUser.instapayNumber || '',
                    instapayQR: freshUser.instapayQR || ''
                });
                if (freshUser.profilePicture) {
                    setProfileImage(freshUser.profilePicture);
                }
                if (freshUser.instapayQR) {
                    setInstapayQRImage(freshUser.instapayQR);
                }
            } catch {
                // Fallback to auth context user if API fails
                if (user) {
                    setFormData({
                        name: user.name || '',
                        email: user.email || '',
                        phone: user.phone || '',
                        profilePicture: user.profilePicture || '',
                        instapayNumber: user.instapayNumber || '',
                        instapayQR: user.instapayQR || ''
                    });
                    if (user.profilePicture) {
                        setProfileImage(user.profilePicture);
                    }
                    if (user.instapayQR) {
                        setInstapayQRImage(user.instapayQR);
                    }
                }
            }
        };
        fetchFreshProfile();
    }, []);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setProfileImage(result);
                setProfilePictureChanged(true);
                setFormData(prev => ({
                    ...prev,
                    profilePicture: result
                }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleInstapayQRUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                toast.error('QR image must be under 5MB');
                return;
            }
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                setInstapayQRImage(result);
                setInstapayQRChanged(true);
                setFormData(prev => ({
                    ...prev,
                    instapayQR: result
                }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const phone = formData.phone.trim();
        if (phone && !/^\d{11}$/.test(phone)) {
            const msg = "Phone number must be exactly 11 digits";
            setError(msg);
            toast.error(msg);
            return;
        }

        // Only include text fields + changed images to avoid sending huge base64 on every save
        const submissionData: any = {
            name: formData.name,
            email: formData.email,
            phone: phone,
        };
        if (profilePictureChanged) {
            submissionData.profilePicture = formData.profilePicture;
        }
        if (instapayQRChanged) {
            submissionData.instapayQR = formData.instapayQR;
        }

        if (user?.role === 'Organizer' && formData.instapayNumber) {
            const instapay = formData.instapayNumber.trim();
            if (!/^\d{11}$/.test(instapay)) {
                const msg = "InstaPay number must be exactly 11 digits";
                setError(msg);
                toast.error(msg);
                return;
            }
            submissionData.instapayNumber = instapay;
        }

        try {
            setIsLoading(true);
            const response = await api.put('/user/profile', submissionData);

            const updatedData = response.data.success ? response.data.data : response.data;

            // Update global auth state immediately
            if (updateUser) {
                updateUser(updatedData);
            }

            toast.success("Profile updated successfully!");
            router.push('/profile');
        } catch (err: any) {
            console.error("Profile update error:", err);
            const msg = err.response?.data?.message || err.message || 'Unknown error';
            setError(msg);
            toast.error(msg);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        router.push('/profile');
    };

    return (
        <div className="update-profile-container">
            {/* Animated Background Orbs */}
            <div className="page-background">
                <div className="bg-gradient-orb orb-1"></div>
                <div className="bg-gradient-orb orb-2"></div>
                <div className="bg-gradient-orb orb-3"></div>
            </div>

            <motion.div
                className="update-profile-wrapper"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4 }}
            >
                <div className="update-header">
                    <motion.button
                        className="back-btn"
                        onClick={handleCancel}
                        whileHover={{ x: -3 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        <FiArrowLeft />
                    </motion.button>
                    <h2>Edit Profile</h2>
                    <div style={{ width: 40 }}></div>
                </div>

                <AnimatePresence mode="wait">
                    {error && (
                        <motion.div
                            className="error-message"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                        >
                            <FiX />
                            <span>{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} className="update-profile-form">
                    {/* Avatar Upload Section */}
                    <motion.div
                        className="avatar-upload-section"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                    >
                        <div className="avatar-preview-wrapper">
                            {profileImage ? (
                                <img
                                    src={profileImage}
                                    alt="Profile Preview"
                                    className="profile-image-preview"
                                />
                            ) : (
                                <div className="profile-image-placeholder">
                                    {formData.name?.charAt(0)?.toUpperCase() || <FiUser />}
                                </div>
                            )}
                            <label htmlFor="image-upload" className="upload-badge">
                                <FiCamera />
                            </label>
                        </div>
                        <input
                            id="image-upload"
                            type="file"
                            onChange={handleImageUpload}
                            accept="image/*"
                            style={{ display: 'none' }}
                        />
                        <p className="upload-hint">Click the camera icon to change photo</p>
                    </motion.div>

                    <div className="form-fields">
                        <motion.div
                            className="form-group"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.2 }}
                        >
                            <label>
                                <FiUser className="label-icon" />
                                Full Name
                            </label>
                            <div className="input-wrapper">
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="your name"
                                    required
                                    minLength={3}
                                    maxLength={30}
                                />
                                <div className="focus-border"></div>
                            </div>
                        </motion.div>

                        <motion.div
                            className="form-group"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                        >
                            <label>
                                <FiMail className="label-icon" />
                                Email Address
                            </label>
                            <div className="input-wrapper">
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    placeholder="email@example.com"
                                    required
                                />
                                <div className="focus-border"></div>
                            </div>
                        </motion.div>

                        <motion.div
                            className="form-group"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.35 }}
                        >
                            <label>
                                <FiPhone className="label-icon" />
                                Phone Number
                            </label>
                            <div className="input-wrapper">
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    placeholder="e.g. 01012345678"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                />
                                <div className="focus-border"></div>
                            </div>
                        </motion.div>

                        {user?.role === 'Organizer' && (
                            <>
                            <motion.div
                                className="form-group"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.4 }}
                            >
                                <label>
                                    <FiDollarSign className="label-icon" />
                                    InstaPay Number
                                </label>
                                <div className="input-wrapper">
                                    <input
                                        type="text"
                                        name="instapayNumber"
                                        value={formData.instapayNumber}
                                        onChange={handleChange}
                                        placeholder="e.g. 01221627432"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                    />
                                    <div className="focus-border"></div>
                                </div>
                            </motion.div>

                            <motion.div
                                className="form-group"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: 0.45 }}
                            >
                                <label>
                                    <FiImage className="label-icon" />
                                    InstaPay QR Code
                                </label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {instapayQRImage && (
                                        <div style={{ position: 'relative', width: 'fit-content' }}>
                                            <img
                                                src={instapayQRImage}
                                                alt="InstaPay QR"
                                                style={{ width: '160px', height: '160px', objectFit: 'contain', borderRadius: '10px', border: '2px solid var(--border-color, rgba(255,255,255,0.1))', background: '#fff' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => { setInstapayQRImage(null); setInstapayQRChanged(true); setFormData(prev => ({ ...prev, instapayQR: '' })); }}
                                                style={{ position: 'absolute', top: '-8px', right: '-8px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}
                                            >
                                                <FiX size={14} />
                                            </button>
                                        </div>
                                    )}
                                    <label
                                        htmlFor="instapay-qr-upload"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 18px', background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', border: '1px dashed rgba(139,92,246,0.4)', borderRadius: '10px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 500, width: 'fit-content', transition: 'all 0.2s' }}
                                    >
                                        <FiImage size={18} />
                                        {instapayQRImage ? 'Change QR Image' : 'Upload QR Image'}
                                    </label>
                                    <input
                                        id="instapay-qr-upload"
                                        type="file"
                                        accept="image/*"
                                        onChange={handleInstapayQRUpload}
                                        style={{ display: 'none' }}
                                    />
                                </div>
                            </motion.div>
                            </>
                        )}
                    </div>

                    <motion.div
                        className="form-buttons"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                    >
                        <button
                            type="button"
                            className="cancel-btn"
                            onClick={handleCancel}
                            disabled={isLoading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="save-btn"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <div className="btn-loading">
                                    <div className="small-spinner"></div>
                                    <span>Saving...</span>
                                </div>
                            ) : (
                                <>
                                    <FiCheck />
                                    <span>Save Changes</span>
                                </>
                            )}
                        </button>
                    </motion.div>
                </form>
            </motion.div>
        </div>
    );
};

const UpdateProfilePage = () => {
    return (
        <ProtectedRoute>
            <UpdateProfilePageContent />
        </ProtectedRoute>
    );
};

export default UpdateProfilePage;
