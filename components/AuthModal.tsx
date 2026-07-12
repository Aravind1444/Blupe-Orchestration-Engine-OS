import React, { useState } from 'react';
import { Zap, Shield, Key, Loader2, Globe, Mail, Lock, User, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { auth } from '../services/supabase';
import { Logo } from './Logo';

interface AuthModalProps {
    onLogin?: () => void;
    onSkip?: () => void;
    onBack?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onLogin, onSkip, onBack }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [mode, setMode] = useState<'login' | 'signup'>('login');

    // Email/Password form state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError('');
        try {
            await auth.signInWithGoogle();
        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to initiate Google Login");
            setLoading(false);
        }
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccessMessage('');

        try {
            if (mode === 'signup') {
                const result = await auth.signUpWithEmail(email, password, fullName);
                if (result.user && !result.session) {
                    // Email confirmation required
                    setSuccessMessage('Check your email for a confirmation link!');
                    setLoading(false);
                    return;
                }
            } else {
                await auth.signInWithEmail(email, password);
            }
            // Auth state change will handle redirect
        } catch (e: any) {
            console.error(e);
            setError(e.message || `Failed to ${mode === 'signup' ? 'sign up' : 'log in'}`);
            setLoading(false);
        }
    };

    const handleGuest = () => {
        onSkip();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 text-slate-900">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-8 animate-in slide-up fade-in">
                <div className="flex justify-center mb-6">
                    <Logo className="w-16 h-16" />
                </div>

                <h2 className="text-2xl font-bold text-center mb-2 tracking-tight">Welcome to Blupe</h2>
                <p className="text-slate-500 text-center mb-6 text-sm">Enterprise Orchestration Engine</p>

                {onBack && (
                    <button onClick={onBack} className="absolute top-6 left-6 text-slate-400 hover:text-slate-600 transition-colors">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                )}

                {/* Mode Toggle */}
                <div className="flex bg-slate-100 rounded-lg p-1 mb-6">
                    <button
                        onClick={() => { setMode('login'); setError(''); setSuccessMessage(''); }}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Log In
                    </button>
                    <button
                        onClick={() => { setMode('signup'); setError(''); setSuccessMessage(''); }}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signup' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Sign Up
                    </button>
                </div>

                {/* Email/Password Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4 mb-4">
                    {mode === 'signup' && (
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Full Name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-sm"
                            />
                        </div>
                    )}

                    <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-sm"
                        />
                    </div>

                    <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            className="w-full pl-10 pr-12 py-3 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-sm"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-600/20"
                    >
                        {loading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Mail className="w-4 h-4" />
                                {mode === 'signup' ? 'Create Account' : 'Log In'}
                            </>
                        )}
                    </button>
                </form>

                <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-slate-200"></div>
                    <span className="flex-shrink-0 mx-4 text-xs text-slate-400">OR</span>
                    <div className="flex-grow border-t border-slate-200"></div>
                </div>

                <div className="space-y-3 mt-4">
                    <button
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-3 relative overflow-hidden group shadow-sm"
                    >
                        {/* Google "G" Icon SVG */}
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.95l3.66-2.84z" />
                            <path fill="#EA4335" d="M12 4.62c1.61 0 3.1.56 4.25 1.64l3.18-3.18C17.46 1.05 14.97 0 12 0 7.7 0 3.99 2.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        <span>Continue with Google</span>
                    </button>

                    <button
                        onClick={handleGuest}
                        className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-900/10"
                    >
                        <Key className="w-4 h-4" />
                        Continue as Guest (Local Only)
                    </button>
                </div>

                {successMessage && (
                    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-600 text-xs text-center">
                        {successMessage}
                    </div>
                )}

                {error && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs text-center">
                        {error}
                    </div>
                )}

                <div className="mt-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
                    <Shield className="w-3 h-3" />
                    <span>Secure Enterprise-Grade Authentication</span>
                </div>
            </div>
        </div>
    );
};