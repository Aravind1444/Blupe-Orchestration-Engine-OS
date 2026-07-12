import React, { useEffect, useState, useMemo } from 'react';
import {
    Users,
    CreditCard,
    Zap,
    TrendingUp,
    PlayCircle,
    CheckCircle2,
    Coins,
    BarChart3,
    Calendar,
    DollarSign,
    Activity,
    Loader2,
    XCircle,
    RefreshCw,
    Filter,
    ChevronDown,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { admin } from '../services/supabase';
import { AdminAnalytics } from '../types';
import clsx from 'clsx';

interface ChartDataPoint {
    date: string;
    count: number;
}

// Calendar Date Picker Component
const CalendarPicker: React.FC<{
    selectedDate: Date | null;
    onSelect: (date: Date | null) => void;
    minDate?: Date;
    maxDate?: Date;
}> = ({ selectedDate, onSelect, minDate, maxDate }) => {
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [isOpen, setIsOpen] = useState(false);

    const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

    const days = useMemo(() => {
        const result = [];
        // Empty cells before first day
        for (let i = 0; i < firstDayOfMonth; i++) {
            result.push(null);
        }
        // Days of month
        for (let i = 1; i <= daysInMonth; i++) {
            result.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i));
        }
        return result;
    }, [currentMonth, daysInMonth, firstDayOfMonth]);

    const isSelectedDay = (day: Date | null) => {
        if (!day || !selectedDate) return false;
        return day.toDateString() === selectedDate.toDateString();
    };

    const isToday = (day: Date | null) => {
        if (!day) return false;
        return day.toDateString() === new Date().toDateString();
    };

    const isDisabled = (day: Date | null) => {
        if (!day) return true;
        if (minDate && day < minDate) return true;
        if (maxDate && day > maxDate) return true;
        return false;
    };

    const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
    const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
                <Calendar className="w-4 h-4" />
                {selectedDate ? selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Select Date'}
                <ChevronDown className={clsx("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-20 p-4 w-72">
                    {/* Month Navigation */}
                    <div className="flex items-center justify-between mb-4">
                        <button onClick={prevMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                            <ChevronLeft className="w-5 h-5 text-slate-600" />
                        </button>
                        <span className="font-medium text-slate-900">
                            {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                        </span>
                        <button onClick={nextMonth} className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                            <ChevronRight className="w-5 h-5 text-slate-600" />
                        </button>
                    </div>

                    {/* Day Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                            <div key={d} className="text-center text-xs font-medium text-slate-400 py-1">{d}</div>
                        ))}
                    </div>

                    {/* Days Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {days.map((day, idx) => (
                            <button
                                key={idx}
                                onClick={() => { if (day && !isDisabled(day)) { onSelect(day); setIsOpen(false); } }}
                                disabled={isDisabled(day)}
                                className={clsx(
                                    "w-8 h-8 rounded-lg text-sm font-medium transition-colors",
                                    !day && "invisible",
                                    day && isSelectedDay(day) && "bg-brand-600 text-white",
                                    day && isToday(day) && !isSelectedDay(day) && "bg-brand-100 text-brand-700",
                                    day && !isSelectedDay(day) && !isToday(day) && !isDisabled(day) && "hover:bg-slate-100 text-slate-700",
                                    isDisabled(day) && "text-slate-300 cursor-not-allowed"
                                )}
                            >
                                {day?.getDate()}
                            </button>
                        ))}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
                        <button
                            onClick={() => { onSelect(new Date()); setIsOpen(false); }}
                            className="flex-1 px-3 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                        >
                            Today
                        </button>
                        <button
                            onClick={() => { onSelect(null); setIsOpen(false); }}
                            className="flex-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Interactive Bar Chart with day selection
const InteractiveBarChart: React.FC<{
    data: ChartDataPoint[];
    color: string;
    height?: number;
    onDayClick?: (date: string) => void;
    selectedDate?: string | null;
}> = ({ data, color, height = 120, onDayClick, selectedDate }) => {
    const maxValue = Math.max(...data.map(d => d.count), 1);

    return (
        <div className="w-full">
            <div className="flex items-end gap-1 justify-between" style={{ height }}>
                {data.slice(-14).map((point, idx) => {
                    const barHeight = (point.count / maxValue) * 100;
                    const date = new Date(point.date);
                    const isToday = new Date().toDateString() === date.toDateString();
                    const isSelected = selectedDate === point.date;
                    return (
                        <div
                            key={idx}
                            className="flex-1 min-w-[8px] max-w-[20px] group relative cursor-pointer"
                            style={{ height: '100%' }}
                            onClick={() => onDayClick?.(point.date)}
                        >
                            <div
                                className={clsx(
                                    "w-full rounded-t transition-all duration-300 hover:opacity-80",
                                    isToday && "ring-2 ring-offset-1 ring-brand-500",
                                    isSelected && "ring-2 ring-offset-1 ring-amber-500"
                                )}
                                style={{
                                    height: `${Math.max(barHeight, 2)}%`,
                                    backgroundColor: isSelected ? '#f59e0b' : color,
                                    marginTop: 'auto',
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0
                                }}
                            />
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                                <div className="bg-slate-900 text-white text-xs rounded-lg px-2 py-1 whitespace-nowrap">
                                    <p className="font-medium">{point.count}</p>
                                    <p className="text-slate-400">{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-slate-400">
                <span>14 days ago</span>
                <span>Today</span>
            </div>
        </div>
    );
};

// Stat card with optional trend
const StatCard: React.FC<{
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    color: string;
    iconBg: string;
    trend?: { value: number; label: string };
}> = ({ title, value, subtitle, icon, color, iconBg }) => (
    <div className={`bg-white rounded-2xl border p-6 hover:shadow-lg transition-all ${color}`}>
        <div className="flex items-start justify-between mb-4">
            <div className={`p-3 rounded-xl ${iconBg}`}>
                {icon}
            </div>
        </div>
        <div className="space-y-1">
            <p className="text-sm font-medium text-slate-500">{title}</p>
            <p className="text-3xl font-bold text-slate-900">{value}</p>
            {subtitle && (
                <p className="text-xs text-slate-400">{subtitle}</p>
            )}
        </div>
    </div>
);

type DateRange = '7d' | '30d' | '90d' | 'all' | 'custom';

export const AdminDashboard: React.FC = () => {
    const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<DateRange>('30d');
    const [showDateDropdown, setShowDateDropdown] = useState(false);
    const [customDate, setCustomDate] = useState<Date | null>(null);
    const [selectedChartDate, setSelectedChartDate] = useState<string | null>(null);

    useEffect(() => {
        loadAnalytics();
    }, []);

    const loadAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await admin.getAnalytics();
            setAnalytics(data);
        } catch (e: any) {
            console.error('Failed to load analytics:', e);
            setError(e.message || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    // Parse chart data from analytics
    const dailyUsers = useMemo<ChartDataPoint[]>(() => {
        if (!analytics?.daily_users) return [];
        try {
            return Array.isArray(analytics.daily_users) ? analytics.daily_users : [];
        } catch { return []; }
    }, [analytics?.daily_users]);

    const dailyRuns = useMemo<ChartDataPoint[]>(() => {
        if (!analytics?.daily_runs) return [];
        try {
            return Array.isArray(analytics.daily_runs) ? analytics.daily_runs : [];
        } catch { return []; }
    }, [analytics?.daily_runs]);

    // Get metrics for selected date
    const selectedDayMetrics = useMemo(() => {
        if (!selectedChartDate) return null;
        const userCount = dailyUsers.find(d => d.date === selectedChartDate)?.count || 0;
        const runCount = dailyRuns.find(d => d.date === selectedChartDate)?.count || 0;
        return { date: selectedChartDate, users: userCount, runs: runCount };
    }, [selectedChartDate, dailyUsers, dailyRuns]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
                <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-600 font-medium text-lg mb-2">Failed to load analytics</p>
                <p className="text-red-500 text-sm mb-4">{error}</p>
                <button
                    onClick={loadAnalytics}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors"
                >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                </button>
            </div>
        );
    }

    if (!analytics) return null;

    const successRate = analytics.total_runs > 0
        ? Math.round((analytics.successful_runs / analytics.total_runs) * 100)
        : 0;

    const failedRuns = (analytics as any).failed_runs || (analytics.total_runs - analytics.successful_runs);

    const dateRangeOptions: { value: DateRange; label: string }[] = [
        { value: '7d', label: 'Last 7 days' },
        { value: '30d', label: 'Last 30 days' },
        { value: '90d', label: 'Last 90 days' },
        { value: 'all', label: 'All time' },
        { value: 'custom', label: 'Custom date' },
    ];

    // Get metrics based on date range
    const getMetricsByRange = () => {
        switch (dateRange) {
            case '7d':
                return {
                    users: analytics.users_last_7_days,
                    runs: analytics.runs_last_7_days,
                    credits: (analytics as any).credits_last_7_days || 0,
                };
            case '30d':
            default:
                return {
                    users: analytics.users_last_30_days,
                    runs: analytics.runs_last_30_days,
                    credits: (analytics as any).credits_last_30_days || 0,
                };
        }
    };

    const rangeMetrics = getMetricsByRange();

    return (
        <div className="space-y-8">
            {/* Header with Date Filter */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-900">Platform Analytics</h2>
                    <p className="text-slate-500 text-sm mt-1">Real-time insights across all metrics</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Calendar Date Picker */}
                    <CalendarPicker
                        selectedDate={customDate}
                        onSelect={(date) => {
                            setCustomDate(date);
                            if (date) {
                                setDateRange('custom');
                                setSelectedChartDate(date.toISOString().split('T')[0]);
                            } else {
                                setSelectedChartDate(null);
                            }
                        }}
                        maxDate={new Date()}
                        minDate={new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)}
                    />

                    {/* Date Range Filter */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDateDropdown(!showDateDropdown)}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                        >
                            <Filter className="w-4 h-4" />
                            {dateRangeOptions.find(o => o.value === dateRange)?.label}
                            <ChevronDown className={clsx("w-4 h-4 transition-transform", showDateDropdown && "rotate-180")} />
                        </button>
                        {showDateDropdown && (
                            <div className="absolute right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-10 py-1 min-w-[150px]">
                                {dateRangeOptions.filter(o => o.value !== 'custom').map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            setDateRange(option.value);
                                            setShowDateDropdown(false);
                                            setSelectedChartDate(null);
                                            setCustomDate(null);
                                        }}
                                        className={clsx(
                                            "w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors",
                                            dateRange === option.value ? "text-brand-600 font-medium bg-brand-50" : "text-slate-700"
                                        )}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        onClick={loadAnalytics}
                        disabled={loading}
                        className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-xl text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={clsx("w-4 h-4", loading && "animate-spin")} />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Selected Day Detail Card */}
            {selectedDayMetrics && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 animate-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-amber-100 rounded-xl">
                                <Calendar className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-amber-700">
                                    {new Date(selectedDayMetrics.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                                </p>
                                <p className="text-xs text-amber-600">Selected day metrics</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-8">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-amber-900">{selectedDayMetrics.users}</p>
                                <p className="text-xs text-amber-600">New Users</p>
                            </div>
                            <div className="text-center">
                                <p className="text-2xl font-bold text-amber-900">{selectedDayMetrics.runs}</p>
                                <p className="text-xs text-amber-600">Workflow Runs</p>
                            </div>
                            <button
                                onClick={() => { setSelectedChartDate(null); setCustomDate(null); setDateRange('30d'); }}
                                className="p-2 hover:bg-amber-100 rounded-lg transition-colors"
                            >
                                <XCircle className="w-5 h-5 text-amber-600" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                    title="Total Users"
                    value={analytics.total_users.toLocaleString()}
                    icon={<Users className="w-6 h-6" />}
                    color="bg-blue-50 text-blue-600 border-blue-100"
                    iconBg="bg-blue-100"
                />
                <StatCard
                    title="Paid Users"
                    value={analytics.paid_users.toLocaleString()}
                    subtitle={`${analytics.total_users > 0 ? Math.round((analytics.paid_users / analytics.total_users) * 100) : 0}% conversion`}
                    icon={<CreditCard className="w-6 h-6" />}
                    color="bg-emerald-50 text-emerald-600 border-emerald-100"
                    iconBg="bg-emerald-100"
                />
                <StatCard
                    title="MRR (Est.)"
                    value={`₹${analytics.mrr_estimate.toLocaleString()}`}
                    subtitle={`~$${Math.round(analytics.mrr_estimate / 83)} USD`}
                    icon={<DollarSign className="w-6 h-6" />}
                    color="bg-amber-50 text-amber-600 border-amber-100"
                    iconBg="bg-amber-100"
                />
                <StatCard
                    title="Total Flows"
                    value={analytics.total_flows.toLocaleString()}
                    icon={<Zap className="w-6 h-6" />}
                    color="bg-purple-50 text-purple-600 border-purple-100"
                    iconBg="bg-purple-100"
                />
            </div>

            {/* Charts Row - Interactive */}
            {(dailyUsers.length > 0 || dailyRuns.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* User Signups Chart */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-slate-900">User Signups</h3>
                                <p className="text-sm text-slate-500">Click any bar for details</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold text-slate-900">{rangeMetrics.users}</p>
                                <p className="text-xs text-slate-400">in period</p>
                            </div>
                        </div>
                        <InteractiveBarChart
                            data={dailyUsers}
                            color="#3b82f6"
                            height={100}
                            onDayClick={setSelectedChartDate}
                            selectedDate={selectedChartDate}
                        />
                    </div>

                    {/* Workflow Runs Chart */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <h3 className="font-bold text-slate-900">Workflow Runs</h3>
                                <p className="text-sm text-slate-500">Click any bar for details</p>
                            </div>
                            <div className="text-right">
                                <p className="text-2xl font-bold text-slate-900">{rangeMetrics.runs}</p>
                                <p className="text-xs text-slate-400">in period</p>
                            </div>
                        </div>
                        <InteractiveBarChart
                            data={dailyRuns}
                            color="#10b981"
                            height={100}
                            onDayClick={setSelectedChartDate}
                            selectedDate={selectedChartDate}
                        />
                    </div>
                </div>
            )}

            {/* Run Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard
                    title="Total Runs"
                    value={analytics.total_runs.toLocaleString()}
                    icon={<PlayCircle className="w-6 h-6" />}
                    color="bg-indigo-50 text-indigo-600 border-indigo-100"
                    iconBg="bg-indigo-100"
                />
                <StatCard
                    title="Successful"
                    value={analytics.successful_runs.toLocaleString()}
                    subtitle={`${successRate}% success rate`}
                    icon={<CheckCircle2 className="w-6 h-6" />}
                    color="bg-green-50 text-green-600 border-green-100"
                    iconBg="bg-green-100"
                />
                <StatCard
                    title="Failed"
                    value={failedRuns.toLocaleString()}
                    subtitle={`${100 - successRate}% failure rate`}
                    icon={<XCircle className="w-6 h-6" />}
                    color="bg-red-50 text-red-600 border-red-100"
                    iconBg="bg-red-100"
                />
                <StatCard
                    title="Credits Used"
                    value={analytics.total_credits_used.toLocaleString()}
                    icon={<Coins className="w-6 h-6" />}
                    color="bg-yellow-50 text-yellow-600 border-yellow-100"
                    iconBg="bg-yellow-100"
                />
            </div>

            {/* Time Range Metrics */}
            <div>
                <h3 className="text-lg font-bold text-slate-900 mb-4">Activity by Period</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:border-brand-200 transition-colors">
                        <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-slate-400">New Users (7d)</p>
                            <p className="text-2xl font-bold text-slate-900">{analytics.users_last_7_days.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:border-brand-200 transition-colors">
                        <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                            <Calendar className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-slate-400">New Users (30d)</p>
                            <p className="text-2xl font-bold text-slate-900">{analytics.users_last_30_days.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:border-brand-200 transition-colors">
                        <div className="p-2 bg-green-100 rounded-lg text-green-600">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-slate-400">Runs (7d)</p>
                            <p className="text-2xl font-bold text-slate-900">{analytics.runs_last_7_days.toLocaleString()}</p>
                        </div>
                    </div>
                    <div className="bg-white rounded-xl border border-slate-200 p-5 flex items-center gap-4 hover:border-brand-200 transition-colors">
                        <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-xs font-medium text-slate-400">Runs (30d)</p>
                            <p className="text-2xl font-bold text-slate-900">{analytics.runs_last_30_days.toLocaleString()}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Platform Health */}
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-8 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-bold mb-2">Platform Health</h3>
                        <p className="text-slate-400 text-sm">
                            {successRate >= 90 ? 'All systems operational' :
                                successRate >= 70 ? 'Minor issues detected' :
                                    'Performance degradation detected'}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="text-right">
                            <p className="text-3xl font-bold">{successRate}%</p>
                            <p className="text-slate-400 text-sm">Uptime</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-4 w-4">
                                <span className={clsx(
                                    "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
                                    successRate >= 90 ? "bg-green-400" : successRate >= 70 ? "bg-yellow-400" : "bg-red-400"
                                )}></span>
                                <span className={clsx(
                                    "relative inline-flex rounded-full h-4 w-4",
                                    successRate >= 90 ? "bg-green-500" : successRate >= 70 ? "bg-yellow-500" : "bg-red-500"
                                )}></span>
                            </span>
                            <span className={clsx(
                                "font-medium",
                                successRate >= 90 ? "text-green-400" : successRate >= 70 ? "text-yellow-400" : "text-red-400"
                            )}>
                                {successRate >= 90 ? 'Healthy' : successRate >= 70 ? 'Degraded' : 'Issues'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminDashboard;
