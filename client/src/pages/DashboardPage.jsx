import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    FileText,
    Plus,
    ShieldCheck,
    Wrench,
    ClipboardList,
    ChevronRight,
    AlertTriangle,
    Search,
    Bell,
    TrendingUp,
    Activity,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../api/incidents'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import PageTransition from '../components/PageTransition'

// ── Greeting ───────────────────────────────────────────────────────────────────
function getGreeting() {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
}

// ── Priority badge ─────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
    const map = {
        CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
        HIGH:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
        MEDIUM:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
        LOW:      'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    }
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${map[priority] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {priority}
        </span>
    )
}

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
    const map = {
        OPEN:        'bg-sky-500/10 text-sky-400 border-sky-500/20',
        IN_PROGRESS: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        RESOLVED:    'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        CLOSED:      'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
        ESCALATED:   'bg-red-500/10 text-red-400 border-red-500/20',
    }
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${map[status] || 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {status?.replace('_', ' ')}
        </span>
    )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Sk({ className = '' }) {
    return <div className={`skeleton ${className}`} />
}

// ── StatCard ──────────────────────────────────────────────────────────────────
const STAT_STYLES = {
    'bg-blue-600':   { grad: 'from-sky-500/15 to-blue-500/0',     icon: 'from-sky-500 to-blue-600',   ring: 'rgba(14,165,233,0.25)',  accent: '#38bdf8', glow: 'rgba(14,165,233,0.3)' },
    'bg-indigo-600': { grad: 'from-indigo-500/15 to-violet-500/0', icon: 'from-indigo-500 to-violet-600', ring: 'rgba(99,102,241,0.25)', accent: '#818cf8', glow: 'rgba(99,102,241,0.3)' },
    'bg-green-600':  { grad: 'from-emerald-500/15 to-teal-500/0',  icon: 'from-emerald-500 to-teal-600', ring: 'rgba(16,185,129,0.25)', accent: '#34d399', glow: 'rgba(16,185,129,0.3)' },
    'bg-orange-600': { grad: 'from-orange-500/15 to-amber-500/0',  icon: 'from-orange-500 to-amber-600', ring: 'rgba(245,158,11,0.25)', accent: '#fbbf24', glow: 'rgba(245,158,11,0.3)' },
    'bg-red-600':    { grad: 'from-red-500/15 to-rose-500/0',      icon: 'from-red-500 to-rose-600',   ring: 'rgba(239,68,68,0.25)',  accent: '#f87171', glow: 'rgba(239,68,68,0.3)' },
}

function StatCard({ label, value, icon: Icon, color, loading }) {
    const s = STAT_STYLES[color] ?? STAT_STYLES['bg-blue-600']

    return (
        <div
            className="relative overflow-hidden rounded-2xl group cursor-default"
            style={{
                background: 'var(--surface-2)',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                transition: 'transform 400ms cubic-bezier(.16,1,.3,1), box-shadow 400ms cubic-bezier(.16,1,.3,1), border-color 250ms ease',
            }}
            onMouseEnter={e => {
                e.currentTarget.style.transform = 'translateY(-5px)'
                e.currentTarget.style.boxShadow = `0 20px 60px rgba(0,0,0,0.4), 0 8px 24px ${s.glow}, inset 0 1px 0 rgba(255,255,255,0.06)`
                e.currentTarget.style.borderColor = s.ring
            }}
            onMouseLeave={e => {
                e.currentTarget.style.transform = ''
                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
            }}
        >
            {/* Top edge highlight */}
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)' }} />

            {/* Background gradient */}
            <div className={`absolute inset-0 opacity-80 bg-gradient-to-br ${s.grad}`} />

            {/* Ambient glow orb */}
            <div className="absolute -right-8 -top-8 w-36 h-36 rounded-full blur-3xl opacity-20 transition-transform duration-700 group-hover:scale-125"
                style={{ background: s.accent }} />

            {/* Bottom accent bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px]"
                style={{ background: `linear-gradient(90deg, ${s.accent}60, transparent)`, transition: 'opacity 300ms' }} />

            <div className="relative z-10 p-6">
                {loading ? (
                    <div className="space-y-4">
                        <Sk className="h-11 w-11 rounded-xl" />
                        <Sk className="h-9 w-20 rounded-lg" />
                        <Sk className="h-3.5 w-32 rounded" />
                    </div>
                ) : (
                    <>
                        {/* Top row */}
                        <div className="flex items-start justify-between mb-6">
                            <div
                                className="h-12 w-12 rounded-xl flex items-center justify-center"
                                style={{
                                    background: `linear-gradient(135deg, var(--color-${color.replace('bg-', '').replace('-600', '-500')}), var(--color-${color.replace('bg-', '')}))`,
                                    background: `linear-gradient(135deg, ${s.accent}30, ${s.accent}10)`,
                                    border: `1px solid ${s.ring}`,
                                    boxShadow: `0 4px 16px -4px ${s.glow}`,
                                }}
                            >
                                <Icon size={22} style={{ color: s.accent }} />
                            </div>
                            <div className="flex items-center gap-1.5">
                                <span className="dot-live" />
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: s.accent }}>Live</span>
                            </div>
                        </div>

                        {/* Value */}
                        <div>
                            <p className="text-4xl font-bold text-white tracking-tight tabular-nums">
                                {value ?? '—'}
                            </p>
                            <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                {label}
                            </p>
                        </div>

                        {/* Footer */}
                        <div className="mt-5 flex items-center justify-between">
                            <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-faint)' }}>
                                Updated now
                            </span>
                            <Activity size={13} style={{ color: s.accent, opacity: 0.5 }} />
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ── Stats config ──────────────────────────────────────────────────────────────
function buildStatConfig(role, userId) {
    if (role === 'STUDENT' || role === 'FACULTY') return [
        { label: 'My Open',        params: { status: 'OPEN',        createdById: userId }, color: 'bg-blue-600',   icon: FileText },
        { label: 'My In Progress', params: { status: 'IN_PROGRESS', createdById: userId }, color: 'bg-indigo-600', icon: ClipboardList },
        { label: 'My Resolved',    params: { status: 'RESOLVED',    createdById: userId }, color: 'bg-green-600',  icon: ShieldCheck },
    ]
    if (role === 'MAINTENANCE' || role === 'SECURITY') return [
        { label: 'Assigned to Me', params: { assignedToId: userId, status: 'IN_PROGRESS' }, color: 'bg-orange-600', icon: Wrench },
        { label: 'Resolved Today', params: { assignedToId: userId, status: 'RESOLVED' },    color: 'bg-green-600',  icon: ShieldCheck },
    ]
    return [
        { label: 'Total Open',  params: { status: 'OPEN' },        color: 'bg-blue-600',   icon: FileText },
        { label: 'In Progress', params: { status: 'IN_PROGRESS' }, color: 'bg-indigo-600', icon: ClipboardList },
        { label: 'Escalated',   params: { status: 'ESCALATED' },   color: 'bg-red-600',    icon: AlertTriangle },
        { label: 'Resolved',    params: { status: 'RESOLVED' },    color: 'bg-green-600',  icon: ShieldCheck },
    ]
}

function buildRecentParams(role, userId) {
    if (role === 'STUDENT' || role === 'FACULTY') return { createdById: userId, limit: 5, sort: 'createdAt:desc' }
    if (role === 'MAINTENANCE' || role === 'SECURITY') return { assignedToId: userId, limit: 5, sort: 'createdAt:desc' }
    return { limit: 5, sort: 'createdAt:desc' }
}

// ── DashboardPage ─────────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { user, logout, on } = useAuth()
    const navigate = useNavigate()

    const role        = user?.role
    const userId      = user?.id
    const statConfig  = buildStatConfig(role, userId)
    const recentParams = buildRecentParams(role, userId)

    const [stats,        setStats]        = useState([])
    const [statsLoading, setStatsLoading] = useState(true)
    const [recent,       setRecent]       = useState([])
    const [recentLoading,setRecentLoading]= useState(true)
    const [refreshKey,   setRefreshKey]   = useState(0)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setStatsLoading(true)
            try {
                const results = await Promise.all(
                    statConfig.map(({ params }) => listIncidents({ ...params, limit: 1 }))
                )
                if (!cancelled)
                    setStats(results.map((r, i) => ({
                        ...statConfig[i],
                        value: r?.meta?.total ?? (r?.data?.length ?? 0),
                    })))
            } catch { /* silent */ }
            finally { if (!cancelled) setStatsLoading(false) }
        })()
        return () => { cancelled = true }
    }, [role, userId, refreshKey])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setRecentLoading(true)
            try {
                const res = await listIncidents(recentParams)
                if (!cancelled) setRecent(res?.data ?? [])
            } catch { if (!cancelled) setRecent([]) }
            finally { if (!cancelled) setRecentLoading(false) }
        })()
        return () => { cancelled = true }
    }, [role, userId, refreshKey])

    useEffect(() => {
        const bump = () => setRefreshKey(k => k + 1)
        const u1 = on('incident_created', bump)
        const u2 = on('incident_updated', bump)
        return () => { u1(); u2() }
    }, [on])

    const handleLogout = () => { logout(); navigate('/login') }
    const showFAB = ['STUDENT', 'FACULTY', 'ADMIN'].includes(role)

    return (
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen flex flex-col relative z-10">
                <PageTransition className="flex-1 flex flex-col">

                    {/* ── Header ── */}
                    <header className="relative px-10 pt-10 pb-8">
                        {/* Ambient glow */}
                        <div className="absolute inset-x-0 top-0 h-48 pointer-events-none"
                            style={{ background: 'radial-gradient(ellipse 70% 80% at 50% -20%, rgba(99,102,241,0.1), transparent)' }}
                        />

                        <div className="relative flex items-center justify-between gap-6">
                            {/* Left: Greeting */}
                            <div className="flex-1 min-w-0">
                                <div
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4 text-[10px] font-bold uppercase tracking-[0.14em]"
                                    style={{
                                        background: 'rgba(99,102,241,0.1)',
                                        border: '1px solid rgba(99,102,241,0.2)',
                                        color: 'var(--color-primary-300)',
                                    }}
                                >
                                    <span className="text-base leading-none">👋</span>
                                    {getGreeting()}
                                </div>

                                <h1 className="text-4xl font-bold text-white tracking-tight leading-tight">
                                    Welcome back,
                                </h1>
                                <h2
                                    className="text-4xl font-bold tracking-tight leading-tight mt-0.5"
                                    style={{
                                        background: 'linear-gradient(90deg, #a5b4fc 0%, #ffffff 45%, #818cf8 100%)',
                                        backgroundClip: 'text',
                                        WebkitBackgroundClip: 'text',
                                        WebkitTextFillColor: 'transparent',
                                    }}
                                >
                                    {user?.name?.split(' ')[0]}
                                </h2>
                                <p className="mt-3 text-sm leading-relaxed max-w-lg" style={{ color: 'var(--color-text-muted)' }}>
                                    Here's an overview of campus operations and incidents happening today.
                                </p>
                            </div>

                            {/* Right: Search + Notification + Avatar */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                                {/* Search */}
                                <div className="relative hidden lg:block">
                                    <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                                    <input
                                        placeholder="Search incidents…"
                                        className="
                                            h-10 w-72 rounded-xl pl-10 pr-4 text-sm text-white
                                            placeholder:text-zinc-600
                                            outline-none transition-all duration-250
                                            focus:ring-2
                                        "
                                        style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            backdropFilter: 'blur(12px)',
                                        }}
                                        onFocus={e => {
                                            e.target.style.background = 'rgba(255,255,255,0.05)'
                                            e.target.style.borderColor = 'rgba(99,102,241,0.4)'
                                            e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)'
                                        }}
                                        onBlur={e => {
                                            e.target.style.background = 'rgba(255,255,255,0.03)'
                                            e.target.style.borderColor = 'rgba(255,255,255,0.06)'
                                            e.target.style.boxShadow = ''
                                        }}
                                    />
                                </div>

                                {/* Notification bell */}
                                <button
                                    className="relative h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-200 group"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
                                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                                    }}
                                >
                                    <Bell size={17} className="text-zinc-400 group-hover:text-white transition-colors" />
                                    {/* Pulse dot */}
                                    <span className="absolute top-2 right-2 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-60" />
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                                    </span>
                                </button>

                                {/* Avatar pill */}
                                <div
                                    className="flex items-center gap-2.5 rounded-xl px-3 py-2"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                    }}
                                >
                                    <div
                                        className="h-8 w-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
                                        style={{
                                            background: 'linear-gradient(135deg, #6366f1, #4338ca)',
                                            boxShadow: '0 2px 8px -2px rgba(99,102,241,0.5)',
                                        }}
                                    >
                                        {user?.name?.charAt(0)?.toUpperCase()}
                                    </div>
                                    <div className="hidden sm:block">
                                        <p className="text-xs font-semibold text-white leading-tight">{user?.name?.split(' ')[0]}</p>
                                        <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>{user?.role}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </header>

                    <div className="px-10 pb-12 space-y-10 flex-1 max-w-7xl">

                        {/* ── Stats ── */}
                        <section>
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h2 className="text-base font-semibold text-white">Overview</h2>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                        Live statistics from your campus
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="dot-live" />
                                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                        Auto-refresh on updates
                                    </span>
                                </div>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                                {statsLoading
                                    ? statConfig.map((_, i) => (
                                        <StatCard key={i} loading color="bg-blue-600" icon={FileText} label="" />
                                    ))
                                    : stats.map(s => (
                                        <StatCard key={s.label} {...s} />
                                    ))
                                }
                            </div>
                        </section>

                        {/* ── Recent Incidents ── */}
                        <section>
                            <div className="flex items-center justify-between mb-5">
                                <div>
                                    <h2 className="text-base font-semibold text-white">Recent Incidents</h2>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                        Latest reports across the campus
                                    </p>
                                </div>
                                <Link
                                    to="/incidents"
                                    className="flex items-center gap-1.5 text-xs font-semibold transition-colors px-3.5 py-2 rounded-lg"
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        color: 'var(--color-text-secondary)',
                                    }}
                                    onMouseEnter={e => {
                                        e.currentTarget.style.background = 'rgba(99,102,241,0.1)'
                                        e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'
                                        e.currentTarget.style.color = '#fff'
                                    }}
                                    onMouseLeave={e => {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                                        e.currentTarget.style.color = 'var(--color-text-secondary)'
                                    }}
                                >
                                    View all
                                    <ChevronRight size={14} />
                                </Link>
                            </div>

                            <div
                                className="overflow-hidden rounded-2xl"
                                style={{
                                    background: 'var(--surface-2)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                                }}
                            >
                                {recentLoading ? (
                                    <div className="space-y-4 p-6">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <div key={i} className="flex items-center gap-4">
                                                <Sk className="h-9 w-9 rounded-lg" />
                                                <Sk className="h-4 flex-1 rounded" />
                                                <Sk className="h-6 w-20 rounded-full" />
                                                <Sk className="h-6 w-24 rounded-full" />
                                            </div>
                                        ))}
                                    </div>
                                ) : recent.length === 0 ? (
                                    <div className="py-20 flex flex-col items-center text-center">
                                        <div
                                            className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
                                            style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)' }}
                                        >
                                            <FileText size={28} className="text-primary-400" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-white">No incidents found</h3>
                                        <p className="text-sm mt-2 max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                                            Everything looks good right now. New reports will appear here automatically.
                                        </p>
                                        {showFAB && (
                                            <Link
                                                to="/incidents/new"
                                                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-white transition-all duration-200 hover:scale-105"
                                                style={{
                                                    background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                                    boxShadow: '0 4px 16px -4px rgba(99,102,241,0.5)',
                                                }}
                                            >
                                                <Plus size={16} /> Report Incident
                                            </Link>
                                        )}
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    {['Incident', 'Category', 'Priority', 'Status', 'Date'].map(h => (
                                                        <th key={h} className="px-6 py-4 text-left text-[10px] font-bold uppercase tracking-[0.1em]"
                                                            style={{ color: 'var(--color-text-muted)' }}>
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {recent.map((inc, idx) => (
                                                    <tr
                                                        key={inc.id}
                                                        onClick={() => navigate(`/incidents/${inc.id}`)}
                                                        className="cursor-pointer group transition-all duration-150"
                                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                        onMouseEnter={e => {
                                                            e.currentTarget.style.background = 'rgba(99,102,241,0.04)'
                                                        }}
                                                        onMouseLeave={e => {
                                                            e.currentTarget.style.background = ''
                                                        }}
                                                    >
                                                        <td className="px-6 py-5">
                                                            <p className="font-semibold text-sm text-white group-hover:text-primary-300 transition-colors truncate max-w-[200px]">
                                                                {inc.title}
                                                            </p>
                                                            <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                                                                #{inc.incidentNumber}
                                                            </p>
                                                        </td>
                                                        <td className="px-6 py-5 text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                                            {inc.category}
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <PriorityBadge priority={inc.priority} />
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <StatusBadge status={inc.status} />
                                                        </td>
                                                        <td className="px-6 py-5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                            {new Date(inc.createdAt).toLocaleDateString('en-IN', {
                                                                day: '2-digit', month: 'short', year: 'numeric',
                                                            })}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>
                </PageTransition>
            </main>

            {/* ── FAB ── */}
            {showFAB && (
                <Link
                    to="/incidents/new"
                    aria-label="Report new incident"
                    className="fixed bottom-8 right-8 flex items-center gap-2.5 px-5 py-3 rounded-full text-white font-semibold text-sm shadow-xl transition-all duration-300 hover:scale-105 hover:-translate-y-1 active:scale-95 z-50"
                    style={{
                        background: 'linear-gradient(135deg, #6366f1, #4338ca)',
                        boxShadow: '0 8px 32px -8px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.2)',
                    }}
                >
                    <Plus size={18} />
                    <span className="hidden sm:inline">Report</span>
                </Link>
            )}
        </div>
    )
}