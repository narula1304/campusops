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
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../api/incidents'

// ── Greeting ──────────────────────────────────────────────────────────────────
function getGreeting() {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

// ── Priority badge ─────────────────────────────────────────────────────────────
const PRIORITY_STYLES = {
    CRITICAL: 'bg-red-500/15 text-red-400 border border-red-500/30',
    HIGH: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    LOW: 'bg-green-500/15 text-green-400 border border-green-500/30',
}

function PriorityBadge({ priority }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority] ?? 'bg-slate-700 text-slate-300'}`}>
            {priority}
        </span>
    )
}

// ── Status badge ───────────────────────────────────────────────────────────────
const STATUS_STYLES = {
    OPEN: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    IN_PROGRESS: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
    RESOLVED: 'bg-green-500/15 text-green-400 border border-green-500/30',
    CLOSED: 'bg-slate-600/40 text-slate-400 border border-slate-600/40',
    ESCALATED: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

function StatusBadge({ status }) {
    const label = status?.replace('_', ' ')
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-700 text-slate-300'}`}>
            {label}
        </span>
    )
}

// ── Skeleton loader ────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, loading }) {
    return (
        <div className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3 backdrop-blur-sm">
            {loading ? (
                <>
                    <Skeleton className="h-9 w-9" />
                    <Skeleton className="h-8 w-16" />
                    <Skeleton className="h-4 w-28" />
                </>
            ) : (
                <>
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                        <Icon size={18} className="text-white" />
                    </div>
                    <p className="text-3xl font-bold text-white">{value ?? '—'}</p>
                    <p className="text-sm text-slate-400">{label}</p>
                </>
            )}
        </div>
    )
}

// ── Stats configuration per role ──────────────────────────────────────────────
function buildStatConfig(role, userId) {
    if (role === 'STUDENT' || role === 'FACULTY') {
        return [
            { label: 'My Open', params: { status: 'OPEN', createdById: userId }, color: 'bg-blue-600', icon: FileText },
            { label: 'My In Progress', params: { status: 'IN_PROGRESS', createdById: userId }, color: 'bg-indigo-600', icon: ClipboardList },
            { label: 'My Resolved', params: { status: 'RESOLVED', createdById: userId }, color: 'bg-green-600', icon: ShieldCheck },
        ]
    }
    if (role === 'MAINTENANCE' || role === 'SECURITY') {
        return [
            { label: 'Assigned to Me', params: { assignedToId: userId, status: 'IN_PROGRESS' }, color: 'bg-orange-600', icon: Wrench },
            { label: 'Resolved Today', params: { assignedToId: userId, status: 'RESOLVED' }, color: 'bg-green-600', icon: ShieldCheck },
        ]
    }
    // ADMIN
    return [
        { label: 'Total Open', params: { status: 'OPEN' }, color: 'bg-blue-600', icon: FileText },
        { label: 'In Progress', params: { status: 'IN_PROGRESS' }, color: 'bg-indigo-600', icon: ClipboardList },
        { label: 'Escalated', params: { status: 'ESCALATED' }, color: 'bg-red-600', icon: AlertTriangle },
        { label: 'Resolved', params: { status: 'RESOLVED' }, color: 'bg-green-600', icon: ShieldCheck },
    ]
}

// ── Recent incidents params per role ─────────────────────────────────────────
function buildRecentParams(role, userId) {
    if (role === 'STUDENT' || role === 'FACULTY') return { createdById: userId, limit: 5, sort: 'createdAt:desc' }
    if (role === 'MAINTENANCE' || role === 'SECURITY') return { assignedToId: userId, limit: 5, sort: 'createdAt:desc' }
    return { limit: 5, sort: 'createdAt:desc' }
}

// ── Main DashboardPage ────────────────────────────────────────────────────────
export default function DashboardPage() {
    const { user, logout, on } = useAuth()
    const navigate = useNavigate()

    const role = user?.role
    const userId = user?.id

    const statConfig = buildStatConfig(role, userId)
    const recentParams = buildRecentParams(role, userId)

    const [stats, setStats] = useState([])
    const [statsLoading, setStatsLoading] = useState(true)
    const [recent, setRecent] = useState([])
    const [recentLoading, setRecentLoading] = useState(true)
    const [refreshKey, setRefreshKey] = useState(0)

    // Fetch stat counts
    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setStatsLoading(true)
                try {
                    const results = await Promise.all(
                        statConfig.map(({ params }) => listIncidents({ ...params, limit: 1 }))
                    )
                    if (!cancelled) {
                        setStats(results.map((r, i) => ({
                            ...statConfig[i],
                            value: r?.meta?.total ?? (r?.data?.length ?? 0),
                        })))
                    }
                } catch {
                    // silently ignore — stats will show —
                } finally {
                    if (!cancelled) setStatsLoading(false)
                }
            })()
        return () => { cancelled = true }
    }, [role, userId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

    // Fetch recent incidents
    useEffect(() => {
        let cancelled = false
            ; (async () => {
                setRecentLoading(true)
                try {
                    const res = await listIncidents(recentParams)
                    if (!cancelled) setRecent(res?.data ?? [])
                } catch {
                    if (!cancelled) setRecent([])
                } finally {
                    if (!cancelled) setRecentLoading(false)
                }
            })()
        return () => { cancelled = true }
    }, [role, userId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

    // ── Real-time socket subscriptions ────────────────────────────────────────
    useEffect(() => {
        const bump = () => setRefreshKey(k => k + 1)
        const unsub1 = on('incident_created', bump)
        const unsub2 = on('incident_updated', bump)
        return () => { unsub1(); unsub2() }
    }, [on])

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const showFAB = ['STUDENT', 'FACULTY', 'ADMIN'].includes(role)

    return (
        <div className="min-h-screen bg-slate-900 flex">
            {/* Sidebar */}
            <Sidebar user={user} onLogout={handleLogout} />

            {/* Main content */}
            <main className="ml-64 flex-1 min-h-screen">
                {/* Top header */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4">
                    <h1 className="text-xl font-semibold text-white">
                        {getGreeting()},{' '}
                        <span className="text-indigo-400">{user?.name?.split(' ')[0]}</span>
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                        Here's what's happening across campus today.
                    </p>
                </header>

                <div className="px-8 py-8 space-y-8">
                    {/* ── Stats row ─────────────────────────────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                            Overview
                        </h2>
                        <div className="flex flex-wrap gap-4">
                            {statsLoading
                                ? statConfig.map((_, i) => (
                                    <div key={i} className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                                        <Skeleton className="h-9 w-9" />
                                        <Skeleton className="h-8 w-16" />
                                        <Skeleton className="h-4 w-28" />
                                    </div>
                                ))
                                : stats.map((s) => (
                                    <StatCard
                                        key={s.label}
                                        label={s.label}
                                        value={s.value}
                                        icon={s.icon}
                                        color={s.color}
                                        loading={false}
                                    />
                                ))
                            }
                        </div>
                    </section>

                    {/* ── Recent incidents ───────────────────────────────────────────── */}
                    <section>
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                                Recent Incidents
                            </h2>
                            <Link
                                to="/incidents"
                                className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                            >
                                View all <ChevronRight size={13} />
                            </Link>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            {recentLoading ? (
                                <div className="divide-y divide-white/8">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 px-6 py-4">
                                            <Skeleton className="h-4 w-20" />
                                            <Skeleton className="h-4 flex-1" />
                                            <Skeleton className="h-5 w-16" />
                                            <Skeleton className="h-5 w-20" />
                                            <Skeleton className="h-5 w-24" />
                                        </div>
                                    ))}
                                </div>
                            ) : recent.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center">
                                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                                        <FileText size={24} className="text-slate-600" />
                                    </div>
                                    <p className="text-slate-400 font-medium">No incidents yet</p>
                                    <p className="text-slate-600 text-sm mt-1">Incidents will appear here once created.</p>
                                    {showFAB && (
                                        <Link
                                            to="/incidents/new"
                                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                                        >
                                            <Plus size={15} /> Report Incident
                                        </Link>
                                    )}
                                </div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/8">
                                            <th className="text-left text-xs font-semibold text-slate-500 px-6 py-3 uppercase tracking-wide">
                                                Incident #
                                            </th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide">
                                                Title
                                            </th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden md:table-cell">
                                                Category
                                            </th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden sm:table-cell">
                                                Priority
                                            </th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide">
                                                Status
                                            </th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">
                                                Created
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {recent.map((incident) => (
                                            <tr
                                                key={incident.id}
                                                onClick={() => navigate(`/incidents/${incident.id}`)}
                                                className="hover:bg-white/5 cursor-pointer transition-colors group"
                                            >
                                                <td className="px-6 py-4 text-indigo-400 font-mono text-xs">
                                                    #{incident.incidentNumber ?? '—'}
                                                </td>
                                                <td className="px-4 py-4 text-white font-medium max-w-[220px] truncate group-hover:text-indigo-300 transition-colors">
                                                    {incident.title}
                                                </td>
                                                <td className="px-4 py-4 text-slate-400 hidden md:table-cell">
                                                    {incident.category ?? '—'}
                                                </td>
                                                <td className="px-4 py-4 hidden sm:table-cell">
                                                    <PriorityBadge priority={incident.priority} />
                                                </td>
                                                <td className="px-4 py-4">
                                                    <StatusBadge status={incident.status} />
                                                </td>
                                                <td className="px-4 py-4 text-slate-500 text-xs hidden lg:table-cell">
                                                    {incident.createdAt
                                                        ? new Date(incident.createdAt).toLocaleDateString('en-IN', {
                                                            day: '2-digit',
                                                            month: 'short',
                                                            year: 'numeric',
                                                        })
                                                        : '—'}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>
                </div>
            </main>

            {/* ── Floating Action Button ────────────────────────────────────────────── */}
            {showFAB && (
                <Link
                    to="/incidents/new"
                    aria-label="Report new incident"
                    className="fixed bottom-8 right-8 w-14 h-14 rounded-full bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/30 flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 z-50"
                >
                    <Plus size={24} className="text-white" />
                </Link>
            )}
        </div>
    )
}