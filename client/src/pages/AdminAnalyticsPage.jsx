import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    BarChart3,
    Users,
    TrendingUp,
    Clock,
    AlertTriangle,
    CheckCircle2,
    Activity,
    X,
    Loader2,
    ChevronRight,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { getDashboard, getStaffPerformance } from '../api/analytics'
import { listUsers } from '../api/users'

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

// ── Stat card ──────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, suffix = '' }) {
    return (
        <div className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col gap-3 backdrop-blur-sm">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
                <Icon size={18} className="text-white" />
            </div>
            <p className="text-3xl font-bold text-white">
                {value ?? '—'}
                {suffix && <span className="text-lg font-medium text-slate-400 ml-1">{suffix}</span>}
            </p>
            <p className="text-sm text-slate-400">{label}</p>
        </div>
    )
}

// ── Horizontal CSS bar chart ───────────────────────────────────────────────────
const BAR_COLORS = {
    // Categories
    MAINTENANCE: 'bg-blue-500',
    SECURITY: 'bg-red-500',
    INFRASTRUCTURE: 'bg-purple-500',
    CLEANLINESS: 'bg-green-500',
    EMERGENCY: 'bg-orange-500',
    OTHER: 'bg-slate-500',
    // Priorities
    CRITICAL: 'bg-red-500',
    HIGH: 'bg-orange-500',
    MEDIUM: 'bg-yellow-500',
    LOW: 'bg-emerald-500',
}

function BarChart({ data, title }) {
    if (!data || Object.keys(data).length === 0) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <h3 className="text-sm font-semibold text-white mb-4">{title}</h3>
                <p className="text-slate-500 text-sm">No data available.</p>
            </div>
        )
    }

    const entries = Object.entries(data).sort(([, a], [, b]) => b - a)
    const maxVal = Math.max(...entries.map(([, v]) => v), 1)

    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
            <h3 className="text-sm font-semibold text-white mb-5">{title}</h3>
            <div className="space-y-3">
                {entries.map(([key, val]) => (
                    <div key={key} className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 w-28 shrink-0 truncate capitalize">
                            {key.replace('_', ' ')}
                        </span>
                        <div className="flex-1 bg-white/5 rounded-full h-2 overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all duration-700 ${BAR_COLORS[key] ?? 'bg-indigo-500'}`}
                                style={{ width: `${Math.round((val / maxVal) * 100)}%` }}
                            />
                        </div>
                        <span className="text-xs text-slate-300 font-medium w-8 text-right shrink-0">{val}</span>
                    </div>
                ))}
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
        <div className="bg-white/5 rounded-xl p-4 flex flex-col gap-1">
            <p className="text-2xl font-bold text-white">
                {val ?? '—'}{unit && <span className="text-base text-slate-400 ml-1">{unit}</span>}
            </p>
            <p className="text-xs text-slate-500">{label}</p>
        </div>
    )

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative w-full max-w-lg bg-slate-900 border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                    <div>
                        <h2 className="text-white font-semibold">{staff.name}</h2>
                        <p className="text-xs text-slate-500">{staff.role} · Performance Report</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={15} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5">
                    {loading ? (
                        <div className="grid grid-cols-2 gap-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <Skeleton key={i} className="h-20 w-full" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-2 text-red-400 text-sm py-4">
                            <AlertTriangle size={16} />
                            {error}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-3">
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
const STATUS_STYLES = {
    OPEN: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    IN_PROGRESS: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
    RESOLVED: 'bg-green-500/15 text-green-400 border border-green-500/30',
    ESCALATED: 'bg-red-500/15 text-red-400 border border-red-500/30',
    REOPENED: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
}

function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-700 text-slate-300'}`}>
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

    return (
        <div className="min-h-screen bg-slate-900 flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-64 flex-1 min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                            <BarChart3 size={18} className="text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-white">Analytics</h1>
                            <p className="text-sm text-slate-500 mt-0.5">Campus-wide incident intelligence</p>
                        </div>
                    </div>

                    {/* Department filter */}
                    <div className="flex items-center gap-2">
                        <input
                            id="dept-filter-input"
                            type="text"
                            value={deptInput}
                            onChange={(e) => setDeptInput(e.target.value)}
                            placeholder="Department ID (optional)"
                            className="bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 w-52 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 placeholder:text-slate-600"
                        />
                        <button
                            id="dept-filter-apply"
                            onClick={() => setDepartmentId(deptInput.trim())}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                        >
                            Apply
                        </button>
                        {departmentId && (
                            <button
                                id="dept-filter-clear"
                                onClick={() => { setDepartmentId(''); setDeptInput('') }}
                                className="px-3 py-2 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white text-sm transition-colors"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </header>

                <div className="px-8 py-8 space-y-8">
                    {dashError ? (
                        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                            <AlertTriangle size={16} />
                            {dashError}
                        </div>
                    ) : null}

                    {/* ── Stats cards ─────────────────────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Overview</h2>
                        <div className="flex flex-wrap gap-4">
                            {dashLoading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className="flex-1 min-w-[160px] bg-white/5 border border-white/10 rounded-2xl p-5 space-y-3">
                                        <Skeleton className="h-9 w-9" />
                                        <Skeleton className="h-8 w-16" />
                                        <Skeleton className="h-4 w-28" />
                                    </div>
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

                    {/* ── Breakdown charts ─────────────────────────────────────── */}
                    <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {dashLoading ? (
                            <>
                                <Skeleton className="h-56 rounded-2xl" />
                                <Skeleton className="h-56 rounded-2xl" />
                            </>
                        ) : (
                            <>
                                <BarChart data={byCategory} title="By Category" />
                                <BarChart data={byPriority} title="By Priority" />
                            </>
                        )}
                    </section>

                    {/* ── Recent Activity ──────────────────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Recent Activity</h2>
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            {dashLoading ? (
                                <div className="divide-y divide-white/5">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 px-5 py-4">
                                            <Skeleton className="h-4 w-16" />
                                            <Skeleton className="h-4 flex-1" />
                                            <Skeleton className="h-5 w-20" />
                                            <Skeleton className="h-4 w-20" />
                                        </div>
                                    ))}
                                </div>
                            ) : recentActivity.length === 0 ? (
                                <div className="py-12 text-center text-slate-500 text-sm">No recent activity.</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-white/8">
                                            <th className="text-left text-xs font-semibold text-slate-500 px-5 py-3 uppercase tracking-wide">Incident #</th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide">Title</th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden md:table-cell">Status</th>
                                            <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">Date</th>
                                            <th className="w-8 px-4" />
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {recentActivity.slice(0, 10).map((item) => (
                                            <tr
                                                key={item.id}
                                                onClick={() => navigate(`/incidents/${item.id}`)}
                                                className="hover:bg-white/5 cursor-pointer transition-colors"
                                            >
                                                <td className="px-5 py-3 text-indigo-400 font-mono text-xs">
                                                    #{item.incidentNumber ?? '—'}
                                                </td>
                                                <td className="px-4 py-3 text-white text-sm max-w-[260px] truncate">{item.title}</td>
                                                <td className="px-4 py-3 hidden md:table-cell">
                                                    <StatusBadge status={item.status} />
                                                </td>
                                                <td className="px-4 py-3 text-slate-500 text-xs hidden lg:table-cell">
                                                    {formatDate(item.createdAt)}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <ChevronRight size={14} className="text-slate-600" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </section>

                    {/* ── Staff Performance ─────────────────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Staff Performance</h2>
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            {staffLoading ? (
                                <div className="divide-y divide-white/5">
                                    {Array.from({ length: 4 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 px-5 py-4">
                                            <Skeleton className="h-8 w-8 rounded-full" />
                                            <Skeleton className="h-4 w-32" />
                                            <Skeleton className="h-4 w-20" />
                                            <div className="ml-auto">
                                                <Skeleton className="h-8 w-28" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : staff.length === 0 ? (
                                <div className="py-12 text-center text-slate-500 text-sm">No staff members found.</div>
                            ) : (
                                <div className="divide-y divide-white/5">
                                    {staff.map((member) => (
                                        <div key={member.id} className="flex items-center gap-4 px-5 py-4">
                                            <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                                <Users size={14} className="text-indigo-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-white truncate">{member.name}</p>
                                                <p className="text-xs text-slate-500">{member.role} · {member.email}</p>
                                            </div>
                                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${member.staffState === 'AVAILABLE'
                                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                                : member.staffState === 'BUSY'
                                                    ? 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                                                    : 'bg-slate-700/40 text-slate-400 border-slate-600/30'
                                                }`}>
                                                {member.staffState ?? 'UNKNOWN'}
                                            </span>
                                            <button
                                                id={`staff-perf-${member.id}`}
                                                onClick={() => setSelectedStaff(member)}
                                                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white text-xs font-medium transition-all duration-150"
                                            >
                                                <TrendingUp size={12} />
                                                View Performance
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </main>

            {/* ── Performance Modal ──────────────────────────────────────────── */}
            {selectedStaff && (
                <PerformanceModal
                    staff={selectedStaff}
                    onClose={() => setSelectedStaff(null)}
                />
            )}
        </div>
    )
}
