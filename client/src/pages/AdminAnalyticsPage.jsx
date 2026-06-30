import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    BarChart3,
    Users,
    TrendingUp,
    Clock,
    AlertTriangle,
    CheckCircle2,
    Activity,
    X,
    ChevronRight,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { getDashboard, getStaffPerformance } from '../api/analytics'
import { listUsers } from '../api/users'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'rgba(255,255,255,0.04)' }} />
}

// ── Stat card with glow hover ──────────────────────────────────────────────────
const STAT_STYLES = {
    'bg-blue-600':   { accent: '#38bdf8', glow: 'rgba(14,165,233,0.3)',  ring: 'rgba(14,165,233,0.25)' },
    'bg-indigo-600': { accent: '#818cf8', glow: 'rgba(99,102,241,0.3)',  ring: 'rgba(99,102,241,0.25)' },
    'bg-green-600':  { accent: '#34d399', glow: 'rgba(16,185,129,0.3)',  ring: 'rgba(16,185,129,0.25)' },
    'bg-red-600':    { accent: '#f87171', glow: 'rgba(239,68,68,0.3)',   ring: 'rgba(239,68,68,0.25)' },
    'bg-orange-600': { accent: '#fbbf24', glow: 'rgba(245,158,11,0.3)',  ring: 'rgba(245,158,11,0.25)' },
    'bg-purple-600': { accent: '#a78bfa', glow: 'rgba(167,139,250,0.3)', ring: 'rgba(167,139,250,0.25)' },
}

function StatCard({ label, value, icon: Icon, color, suffix = '', loading }) {
    const s = STAT_STYLES[color] ?? STAT_STYLES['bg-blue-600']

    if (loading) {
        return (
            <div
                className="flex-1 min-w-[160px] rounded-2xl p-5 space-y-3"
                style={{
                    background: 'var(--surface-2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                }}
            >
                <Skeleton className="h-10 w-10 rounded-xl" />
                <Skeleton className="h-8 w-16 rounded-lg" />
                <Skeleton className="h-4 w-28 rounded" />
            </div>
        )
    }

    return (
        <div
            className="flex-1 min-w-[160px] rounded-2xl relative overflow-hidden group cursor-default"
            style={{
                background: 'var(--surface-2)',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                transition: 'transform 400ms cubic-bezier(.16,1,.3,1), box-shadow 400ms, border-color 250ms',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-4px)'
                e.currentTarget.style.boxShadow = `0 20px 60px rgba(0,0,0,0.4), 0 8px 24px ${s.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`
                e.currentTarget.style.borderColor = s.ring
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
            }}
        >
            {/* Top highlight */}
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)' }} />
            {/* Bottom accent */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, ${s.accent}60, transparent)` }} />
            {/* Ambient glow */}
            <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full blur-3xl opacity-15 group-hover:opacity-25 transition-opacity duration-500"
                style={{ background: s.accent }} />

            <div className="relative z-10 p-5">
                <div className="flex items-start justify-between mb-4">
                    <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center"
                        style={{
                            background: `${s.accent}15`,
                            border: `1px solid ${s.ring}`,
                            boxShadow: `0 4px 16px -4px ${s.glow}`,
                        }}
                    >
                        <Icon size={20} style={{ color: s.accent }} />
                    </div>
                </div>
                <p className="text-3xl font-bold text-white tracking-tight tabular-nums">
                    {value ?? '—'}
                    {suffix && <span className="text-lg font-medium ml-1" style={{ color: 'var(--color-text-muted)' }}>{suffix}</span>}
                </p>
                <p className="text-xs font-medium mt-1.5" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
            </div>
        </div>
    )
}

// ── Horizontal bar chart with gradient fills ───────────────────────────────────
const BAR_GRADIENTS = {
    MAINTENANCE:    { from: '#38bdf8', to: '#0ea5e9' },
    SECURITY:       { from: '#f87171', to: '#ef4444' },
    INFRASTRUCTURE: { from: '#818cf8', to: '#6366f1' },
    CLEANLINESS:    { from: '#34d399', to: '#10b981' },
    EMERGENCY:      { from: '#fbbf24', to: '#f59e0b' },
    OTHER:          { from: '#94a3b8', to: '#64748b' },
    CRITICAL:       { from: '#f87171', to: '#dc2626' },
    HIGH:           { from: '#fbbf24', to: '#f59e0b' },
    MEDIUM:         { from: '#38bdf8', to: '#0284c7' },
    LOW:            { from: '#34d399', to: '#059669' },
}

function BarChart({ data, title }) {
    if (!data || Object.keys(data).length === 0) {
        return (
            <div
                className="rounded-2xl p-6"
                style={{
                    background: 'var(--surface-2)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                }}
            >
                <h3 className="text-sm font-bold text-white mb-4">{title}</h3>
                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No data available.</p>
            </div>
        )
    }

    const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
    const maxVal = Math.max(...entries.map(([, v]) => v), 1)

    return (
        <div
            className="rounded-2xl p-6"
            style={{
                background: 'var(--surface-2)',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
        >
            <h3 className="text-sm font-bold text-white mb-6">{title}</h3>
            <div className="space-y-4">
                {entries.map(([key, val]) => {
                    const grad = BAR_GRADIENTS[key] ?? { from: '#818cf8', to: '#6366f1' }
                    const pct = Math.round((val / maxVal) * 100)
                    return (
                        <div key={key} className="flex items-center gap-4">
                            <span className="text-xs font-medium w-28 shrink-0 truncate capitalize" style={{ color: 'var(--color-text-secondary)' }}>
                                {key.replace('_', ' ')}
                            </span>
                            <div
                                className="flex-1 rounded-full h-2.5 overflow-hidden"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}
                            >
                                <div
                                    className="h-full rounded-full transition-all duration-1000"
                                    style={{
                                        width: `${pct}%`,
                                        background: `linear-gradient(90deg, ${grad.from}, ${grad.to})`,
                                        boxShadow: `0 0 8px ${grad.from}40`,
                                    }}
                                />
                            </div>
                            <span className="text-xs font-bold text-white w-8 text-right shrink-0 tabular-nums">{val}</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Staff Performance Modal ────────────────────────────────────────────────────
function PerformanceModal({ staff, onClose }) {
    const [data, setData] = useState(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            try {
                const res = await getStaffPerformance(staff.id)
                if (!cancelled) setData(res)
            } catch (e) {
                if (!cancelled) setError(e?.response?.data?.error?.message ?? 'Failed to load performance data')
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [staff.id])

    const stat = (label, val, unit = '') => (
        <div
            className="rounded-xl p-5 flex flex-col gap-1.5"
            style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
            }}
        >
            <p className="text-2xl font-bold text-white tabular-nums">
                {val ?? '—'}{unit && <span className="text-sm font-medium ml-1" style={{ color: 'var(--color-text-muted)' }}>{unit}</span>}
            </p>
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
        </div>
    )

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0"
                style={{ background: 'rgba(3,7,18,0.8)', backdropFilter: 'blur(8px)' }}
                onClick={onClose}
            />
            <div
                className="relative w-full max-w-lg rounded-2xl overflow-hidden"
                style={{
                    background: 'var(--surface-2)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    boxShadow: '0 32px 100px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
                    animation: 'fadeDown 200ms cubic-bezier(.16,1,.3,1)',
                }}
            >
                {/* Top accent line */}
                <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)' }} />

                {/* Header */}
                <div
                    className="flex items-center justify-between px-6 py-5"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <div>
                        <h2 className="text-white font-bold">{staff.name}</h2>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{staff.role} · Performance Report</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    >
                        <X size={14} style={{ color: 'var(--color-text-muted)' }} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-6">
                    {loading ? (
                        <div className="grid grid-cols-2 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton key={i} className="h-24 w-full rounded-xl" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 text-sm py-4" style={{ color: 'var(--color-danger-400)' }}>
                            <AlertTriangle size={16} />
                            {error}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-4">
                            {stat('Total Assigned', data?.totalAssigned)}
                            {stat('Resolved', data?.totalResolved)}
                            {stat('Avg Resolution', data?.avgResolutionHours?.toFixed(1), 'hrs')}
                            {stat('SLA Met', data?.slaMet)}
                            {stat('SLA Breached', data?.slaBreached)}
                            {stat('SLA Rate', data?.slaBreachRate !== undefined ? `${(data.slaBreachRate * 100).toFixed(1)}` : '—', '%')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Status badge ───────────────────────────────────────────────────────────────
const STATUS_STYLE = {
    OPEN:        { bg: 'rgba(14,165,233,0.1)',  border: 'rgba(14,165,233,0.2)',  text: '#38bdf8' },
    IN_PROGRESS: { bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.2)',  text: '#818cf8' },
    RESOLVED:    { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)',  text: '#34d399' },
    ESCALATED:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   text: '#f87171' },
    REOPENED:    { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  text: '#fbbf24' },
}

function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' }
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
            style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {status?.replace('_', ' ')}
        </span>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AdminAnalyticsPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [departmentId, setDepartmentId] = useState('')
    const [deptInput, setDeptInput] = useState('')

    const [dashboard, setDashboard] = useState(null)
    const [dashLoading, setDashLoading] = useState(true)
    const [dashError, setDashError] = useState('')

    const [staff, setStaff] = useState([])
    const [staffLoading, setStaffLoading] = useState(true)

    const [selectedStaff, setSelectedStaff] = useState(null)

    const fetchDashboard = useCallback(async () => {
        setDashLoading(true)
        setDashError('')
        try {
            const res = await getDashboard(departmentId || undefined)
            setDashboard(res)
        } catch (e) {
            setDashError(e?.response?.data?.error?.message ?? 'Failed to load analytics')
        } finally {
            setDashLoading(false)
        }
    }, [departmentId])

    const fetchStaff = useCallback(async () => {
        setStaffLoading(true)
        try {
            const [maint, sec] = await Promise.all([
                listUsers({ role: 'MAINTENANCE', limit: 50 }),
                listUsers({ role: 'SECURITY', limit: 50 }),
            ])
            setStaff([...(maint?.data ?? []), ...(sec?.data ?? [])])
        } catch {
            setStaff([])
        } finally {
            setStaffLoading(false)
        }
    }, [])

    useEffect(() => { fetchDashboard() }, [fetchDashboard])
    useEffect(() => { fetchStaff() }, [fetchStaff])

    const handleLogout = () => { logout(); navigate('/login') }

    const formatDate = (iso) => {
        if (!iso) return '—'
        return new Date(iso).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
        })
    }

    const recentActivity = dashboard?.recentActivity ?? []
    const byCategory = Object.fromEntries(
        (dashboard?.byCategory ?? []).map(({ category, count }) => [category, count])
    )
    const byPriority = Object.fromEntries(
        (dashboard?.byPriority ?? []).map(({ priority, count }) => [priority, count])
    )

    // Role-color avatar backgrounds
    const roleColor = (role) => {
        const map = {
            MAINTENANCE: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
            SECURITY:    { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  text: '#f87171' },
        }
        return map[role] ?? { bg: 'rgba(99,102,241,0.1)', border: 'rgba(99,102,241,0.2)', text: '#818cf8' }
    }

    return (
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen flex flex-col">
                {/* ── Header ── */}
                <header
                    className="sticky top-0 z-30 px-8 py-4 flex items-center justify-between gap-4"
                    style={{
                        background: 'rgba(3,7,18,0.85)',
                        backdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center"
                            style={{
                                background: 'rgba(99,102,241,0.1)',
                                border: '1px solid rgba(99,102,241,0.2)',
                            }}
                        >
                            <BarChart3 size={20} style={{ color: '#818cf8' }} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Analytics</h1>
                            <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                Campus-wide incident intelligence
                            </p>
                        </div>
                    </div>

                    {/* Department filter */}
                    <div className="flex items-center gap-3">
                        <Input
                            placeholder="Department ID"
                            value={deptInput}
                            onChange={(e) => setDeptInput(e.target.value)}
                            wrapperClassName="w-48"
                        />
                        <Button
                            variant="primary"
                            onClick={() => setDepartmentId(deptInput.trim())}
                        >
                            Apply
                        </Button>
                        {departmentId && (
                            <button
                                onClick={() => { setDepartmentId(''); setDeptInput('') }}
                                className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                            >
                                <X size={14} style={{ color: 'var(--color-text-muted)' }} />
                            </button>
                        )}
                    </div>
                </header>

                <div className="p-8 space-y-10 flex-1">
                    {dashError && (
                        <div
                            className="flex items-center gap-2 rounded-xl px-5 py-4 text-sm font-medium"
                            style={{
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: 'var(--color-danger-400)',
                            }}
                        >
                            <AlertTriangle size={18} />
                            {dashError}
                        </div>
                    )}

                    {/* ── Stats ── */}
                    <section>
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-base font-semibold text-white">Overview</h2>
                            <div className="flex items-center gap-2">
                                <span className="dot-live" />
                                <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Live data</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-5">
                            {dashLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <StatCard key={i} loading color="bg-blue-600" icon={Activity} label="" />
                                ))
                            ) : (
                                <>
                                    <StatCard label="Total Open" value={dashboard?.totalOpen} icon={Activity} color="bg-blue-600" />
                                    <StatCard label="In Progress" value={dashboard?.totalInProgress} icon={Clock} color="bg-indigo-600" />
                                    <StatCard label="Resolved" value={dashboard?.totalResolved} icon={CheckCircle2} color="bg-green-600" />
                                    <StatCard label="Escalated" value={dashboard?.totalEscalated} icon={AlertTriangle} color="bg-red-600" />
                                    <StatCard
                                        label="SLA Breach Rate"
                                        value={dashboard?.slaBreachRate !== undefined
                                            ? (dashboard.slaBreachRate * 100).toFixed(1)
                                            : '—'}
                                        icon={TrendingUp}
                                        color="bg-orange-600"
                                        suffix="%"
                                    />
                                    <StatCard
                                        label="Avg Resolution"
                                        value={dashboard?.avgResolutionHours?.toFixed(1) ?? '—'}
                                        icon={Clock}
                                        color="bg-purple-600"
                                        suffix="hrs"
                                    />
                                </>
                            )}
                        </div>
                    </section>

                    {/* ── Charts ── */}
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {dashLoading ? (
                            <>
                                <Skeleton className="h-64 rounded-2xl" />
                                <Skeleton className="h-64 rounded-2xl" />
                            </>
                        ) : (
                            <>
                                <BarChart data={byCategory} title="By Category" />
                                <BarChart data={byPriority} title="By Priority" />
                            </>
                        )}
                    </section>

                    {/* ── Recent Activity ── */}
                    <section>
                        <h2 className="text-base font-semibold text-white mb-5">Recent Activity</h2>
                        <div
                            className="overflow-hidden rounded-2xl"
                            style={{
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            {dashLoading ? (
                                <div className="space-y-0">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <Skeleton className="h-4 w-16" />
                                            <Skeleton className="h-4 flex-1" />
                                            <Skeleton className="h-6 w-20 rounded-full" />
                                            <Skeleton className="h-4 w-20" />
                                        </div>
                                    ))}
                                </div>
                            ) : recentActivity.length === 0 ? (
                                <div className="py-16 text-center text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                    No recent activity.
                                </div>
                            ) : (
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            {['Incident #', 'Title', 'Status', 'Date', ''].map((h, i) => (
                                                <th
                                                    key={i}
                                                    className={`px-6 py-4 text-[10px] font-bold uppercase tracking-[0.1em] ${i >= 2 && i < 4 ? 'hidden md:table-cell' : ''}`}
                                                    style={{ color: 'var(--color-text-muted)' }}
                                                >
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentActivity.slice(0, 10).map((item) => (
                                            <tr
                                                key={item.id}
                                                onClick={() => navigate(`/incidents/${item.id}`)}
                                                className="cursor-pointer group transition-all duration-150"
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                            >
                                                <td className="px-6 py-4 font-mono text-xs group-hover:text-primary-400 transition-colors" style={{ color: 'var(--color-text-muted)' }}>
                                                    #{item.incidentNumber ?? '—'}
                                                </td>
                                                <td className="px-6 py-4 font-medium max-w-[300px] truncate group-hover:text-primary-300 transition-colors" style={{ color: 'var(--color-text-primary)' }}>
                                                    {item.title}
                                                </td>
                                                <td className="px-6 py-4 hidden md:table-cell">
                                                    <StatusBadge status={item.status} />
                                                </td>
                                                <td className="px-6 py-4 text-xs hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                                                    {formatDate(item.createdAt)}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" style={{ color: 'var(--color-text-muted)' }} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>

                    {/* ── Staff Performance ── */}
                    <section>
                        <h2 className="text-base font-semibold text-white mb-5">Staff Performance</h2>
                        <div
                            className="overflow-hidden rounded-2xl"
                            style={{
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            {staffLoading ? (
                                <div>
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <Skeleton className="h-10 w-10 rounded-full" />
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-4 w-20" />
                                            <div className="ml-auto">
                                                <Skeleton className="h-9 w-32 rounded-lg" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : staff.length === 0 ? (
                                <div className="py-16 text-center text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                    No staff members found.
                                </div>
                            ) : (
                                <div>
                                    {staff.map((member) => {
                                        const rc = roleColor(member.role)
                                        return (
                                            <div
                                                key={member.id}
                                                className="flex items-center gap-4 px-6 py-5 transition-colors cursor-default group"
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.03)'}
                                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                            >
                                                <div
                                                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                                                    style={{
                                                        background: rc.bg,
                                                        border: `1px solid ${rc.border}`,
                                                        color: rc.text,
                                                    }}
                                                >
                                                    {(member.name ?? '?')[0].toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold text-white truncate">{member.name}</p>
                                                    <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                                        {member.role} · {member.email}
                                                    </p>
                                                </div>

                                                <Badge
                                                    variant={member.staffState === 'AVAILABLE' ? 'success' : member.staffState === 'BUSY' ? 'warning' : 'neutral'}
                                                    className="hidden sm:inline-flex"
                                                >
                                                    {member.staffState ?? 'UNKNOWN'}
                                                </Badge>

                                                <Button
                                                    id={`staff-perf-${member.id}`}
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setSelectedStaff(member)}
                                                    icon={TrendingUp}
                                                >
                                                    Performance
                                                </Button>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </main>

            {/* ── Performance Modal ── */}
            {selectedStaff && (
                <PerformanceModal
                    staff={selectedStaff}
                    onClose={() => setSelectedStaff(null)}
                />
            )}
        </div>
    )
}
