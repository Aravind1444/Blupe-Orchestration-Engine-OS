import React, { useEffect, useState } from 'react';
import {
    LayoutDashboard,
    Users,
    Box,
    LayoutTemplate,
    ArrowLeft,
    Shield,
    Loader2
} from 'lucide-react';
import { Logo } from '../components/Logo';
import { admin } from '../services/supabase';
import { PageView, AdminPageView } from '../types';
import clsx from 'clsx';

interface AdminLayoutProps {
    children: React.ReactNode;
    activePage: AdminPageView;
    onNavigate: (page: PageView) => void;
    onAdminNavigate: (page: AdminPageView) => void;
}

const navItems: { id: AdminPageView; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-5 h-5" /> },
    { id: 'nodes', label: 'Nodes', icon: <Box className="w-5 h-5" /> },
    { id: 'templates', label: 'Templates', icon: <LayoutTemplate className="w-5 h-5" /> },
];

export const AdminLayout: React.FC<AdminLayoutProps> = ({
    children,
    activePage,
    onNavigate,
    onAdminNavigate
}) => {
    const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

    useEffect(() => {
        checkAdmin();
    }, []);

    const checkAdmin = async () => {
        try {
            const result = await admin.isAdmin();
            setIsAdmin(result);
            if (!result) {
                // Redirect non-admins to dashboard
                onNavigate('dashboard');
            }
        } catch (e) {
            console.error('Admin check failed:', e);
            onNavigate('dashboard');
        }
    };

    if (isAdmin === null) {
        return (
            <div className="h-screen w-full bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
                    <p className="text-slate-500 text-sm">Verifying admin access...</p>
                </div>
            </div>
        );
    }

    if (!isAdmin) {
        return null;
    }

    return (
        <div className="h-screen w-full bg-slate-50 flex overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
                {/* Logo */}
                <div className="h-16 border-b border-slate-800 flex items-center px-6 gap-3">
                    <Logo className="w-8 h-8" />
                    <span className="font-bold text-lg">Blupe</span>
                    <span className="bg-amber-500/20 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        Admin
                    </span>
                </div>

                {/* Navigation */}
                <nav className="flex-1 py-6 px-3 space-y-1">
                    {navItems.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => onAdminNavigate(item.id)}
                            className={clsx(
                                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                                activePage === item.id
                                    ? "bg-white/10 text-white"
                                    : "text-slate-400 hover:text-white hover:bg-white/5"
                            )}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>

                {/* Back to App */}
                <div className="p-4 border-t border-slate-800">
                    <button
                        onClick={() => onNavigate('dashboard')}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Back to App
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto">
                {/* Header */}
                <header className="h-16 bg-white border-b border-slate-200 flex items-center px-8 sticky top-0 z-10">
                    <h1 className="text-lg font-bold text-slate-900 capitalize">
                        {activePage === 'dashboard' ? 'Analytics Dashboard' : `${activePage} Management`}
                    </h1>
                </header>

                {/* Page Content */}
                <div className="p-8">
                    {children}
                </div>
            </main>
        </div>
    );
};

export default AdminLayout;
