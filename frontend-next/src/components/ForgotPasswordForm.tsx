'use client';

import { useState, useRef, useEffect, ChangeEvent, FormEvent, KeyboardEvent, MouseEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import api from '@/services/api';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "react-toastify";
import './ForgotPasswordForm.css';

const ForgotPasswordForm = () => {
    const [email, setEmail] = useState<string>('');
    const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
    const [newPassword, setNewPassword] = useState<string>('');
    const [confirmPassword, setConfirmPassword] = useState<string>('');
    const [step, setStep] = useState<number>(1);
    const [error, setError] = useState<string>('');
    const [success, setSuccess] = useState<string>('');
    const [loading, setLoading] = useState<boolean>(false);
    const [showPassword, setShowPassword] = useState<boolean>(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
    const router = useRouter();

    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Handle OTP input and auto-focus to next input
    const handleOtpChange = (index: number, value: string) => {
        if (value.length <= 1) {
            const newOtpDigits = [...otpDigits];
            newOtpDigits[index] = value;
            setOtpDigits(newOtpDigits);

            // Auto focus to next input
            if (value && index < 5) {
                inputRefs.current[index + 1]?.focus();
            }
        }
    };

    // Handle backspace to go to previous input
    const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handleRequestOtp = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!email) {
            setError(t('forgot.emailRequired'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await api.post('/auth/forget-password', { 
                email: email.toLowerCase() 
            });

            setSuccess(response.data.message || t('forgot.otpSent'));
            setStep(2);
        } catch (err: any) {
            console.error('Error:', err.response?.data || err.message);
            setError(err.response?.data?.message || t('forgot.failedOTP'));
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e: FormEvent<HTMLFormElement> | MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        const otp = otpDigits.join('');

        if (!otp || !newPassword || !confirmPassword) {
            setError(t('forgot.fieldsRequired'));
            return;
        }

        if (newPassword !== confirmPassword) {
            setError(t('forgot.passMismatch'));
            return;
        }

        setLoading(true);
        setError('');

        try {
            const response = await api.post('/auth/verify-otp', { 
                email: email.toLowerCase(), 
                otp, 
                newPassword 
            });

            setSuccess(response.data.message || t('forgot.success'));
            setTimeout(() => {
                router.push('/login');
            }, 2000);
        } catch (err: any) {
            console.error('Error:', err.response?.data || err.message);
            setError(err.response?.data?.message || t('forgot.failedReset'));
        } finally {
            setLoading(false);
        }
    };

    const { t } = useLanguage();

    // Focus first input when OTP form appears
    useEffect(() => {
        if (step === 2) {
            setTimeout(() => {
                inputRefs.current[0]?.focus();
            }, 100);
        }
    }, [step]);

    const handleResendCode = async (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        try {
            toast.info(t('gen.processing'));
            await api.post('/auth/forget-password', { email: email.toLowerCase() });
            toast.success(t('otp.resendSuccess') || 'New verification code sent to your email');
        } catch (err: any) {
            console.error('Error resending code:', err);
            toast.error(err.response?.data?.message || 'Failed to resend verification code');
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                <h2 className="login-title">{t('forgot.title')}</h2>
                {step === 1 ? (
                    <p className="redirect-link">
                        {t('forgot.step1Subtitle')}
                    </p>
                ) : (
                    <p className="redirect-link">
                        {t('forgot.step2Subtitle')}
                    </p>
                )}

                {error && <div className="error-message">{error}</div>}
                {success && <div className="success-message">{success}</div>}

                {step === 1 ? (
                    <form onSubmit={handleRequestOtp}>
                        <div className="form-group">
                            <label htmlFor="email" className="form-label">{t('forgot.emailLabel')}</label>
                            <input
                                type="email"
                                id="email"
                                className="form-input"
                                value={email}
                                onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={loading}
                        >
                            {loading ? t('forgot.sending') : t('forgot.sendCode')}
                        </button>
                    </form>
                ) : (
                    <div>
                        <div className="otp-form-container">
                            <form className="otp-form">
                                <div className="content">
                                    <p style={{ textAlign: 'center' }}>{t('forgot.otpVerification')}</p>
                                    <div className="inp">
                                        {[0, 1, 2, 3, 4, 5].map((i) => (
                                            <input
                                                key={i}
                                                type="text"
                                                className="input"
                                                maxLength={1}
                                                value={otpDigits[i]}
                                                onChange={(e: ChangeEvent<HTMLInputElement>) => handleOtpChange(i, e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(i, e)}
                                                ref={(el) => { inputRefs.current[i] = el; }}
                                            />
                                        ))}
                                    </div>
                                    <svg className="svg" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                                        <path fill="#4073ff" d="M56.8,-23.9C61.7,-3.2,45.7,18.8,26.5,31.7C7.2,44.6,-15.2,48.2,-35.5,36.5C-55.8,24.7,-73.9,-2.6,-67.6,-25.2C-61.3,-47.7,-30.6,-65.6,-2.4,-64.8C25.9,-64.1,51.8,-44.7,56.8,-23.9Z" transform="translate(100 100)" className="path"></path>
                                    </svg>
                                    <button
                                        type="button"
                                        className="verify-btn"
                                        onClick={handleResetPassword}
                                        disabled={loading || otpDigits.some(digit => !digit)}
                                        style={{ marginTop: '20px' }}
                                    >
                                        {loading ? t('otp.verifying') : t('otp.verify')}
                                    </button>
                                    <p style={{ textAlign: "center", marginTop: "10px", fontSize: "0.8rem" }}>
                                        <a
                                            href="#"
                                            onClick={handleResendCode}
                                            style={{ color: "var(--primary)", textDecoration: "underline" }}
                                        >
                                            {t('otp.resend')}
                                        </a>
                                    </p>
                                </div>
                            </form>
                        </div>

                        <form onSubmit={handleResetPassword} className="password-reset-form">
                            <div className="form-group">
                                <label htmlFor="newPassword" className="form-label">{t('forgot.newPassword')}</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        id="newPassword"
                                        className="form-input"
                                        value={newPassword}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setNewPassword(e.target.value)}
                                        required
                                        style={{ paddingRight: '2.5rem' }}
                                    />
                                    <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255, 255, 255, 0.5)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="confirmPassword" className="form-label">{t('forgot.confirmPassword')}</label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showConfirmPassword ? "text" : "password"}
                                        id="confirmPassword"
                                        className="form-input"
                                        value={confirmPassword}
                                        onChange={(e: ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                                        required
                                        style={{ paddingRight: '2.5rem' }}
                                    />
                                    <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'rgba(255, 255, 255, 0.5)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        {showConfirmPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="verify-btn"
                                disabled={loading}
                            >
                                {loading ? t('forgot.resetting') : t('forgot.resetButton')}
                            </button>
                        </form>
                    </div>
                )}

                <div className="redirect-link">
                    <Link href="/login">{t('forgot.returnLogin')}</Link>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordForm;
