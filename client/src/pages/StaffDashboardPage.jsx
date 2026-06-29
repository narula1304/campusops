import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ClipboardList,
    CheckCircle2,
    Clock,
    MapPin,
    ExternalLink,
    AlertTriangle,
    Loader2,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../api/incidents'

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

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

// ── SLA Countdown ──────────────────────────────────────────────────────────────
function SLACountdown({ deadline }) {
    const [remaining, setRemaining] = useState(() => computeRemaining(deadline))

    function computeRemaining(dl) {
        if (!dl) return null
        const diff = new Date(dl).getTime() - Date.now()
        return diff
    }

    useEffect(() => {
        if (!deadline) return
        const id = setInterval(() => {
            setRemaining(computeRemaining(deadline))
        }, 1000)
        return () => clearInterval(id)
    }, [deadline])

    if (remaining === null) return <span className="text-slate-500 text-xs">No SLA set</span>

    if (remaining <= 0) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                <AlertTriangle size={11} />
                SLA Breached
            </span>
        )
    }

    const totalSec = Math.floor(remaining / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60

    const formatted = h > 0
        ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
        : `${m}m ${String(s).padStart(2, '0')}s`

    const underHalf = remaining < 30 * 60 * 1000          // < 30 min → red
    const underTwo = remaining < 2 * 60 * 60 * 1000        // < 2 hr → orange

    const colorCls = underHalf
        ? 'text-red-400 font-bold'
        : underTwo
        ? 'text-orange-400 font-semibold'
        : 'text-emerald-400 font-medium'

    return (
        <span className={`text-xs tabular-nums ${colorCls} flex items-center gap-1`}>
            <Clock size={11} className="shrink-0" />
            {formatted} remaining
        </span>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffDashboardPage() {
    const { user, logout, on } = useAuth()
    const navigate = useNavigate()

    const userId = user?.id

    const [queue, setQueue] = useState([])
    const [queueLoading, setQueueLoading] = useState(true)

    const [resolved, setResolved] = useState([])
    const [resolvedLoading, setResolvedLoading] = useState(true)

    const [refreshKey, setRefreshKey] = useState(0)

    const fetchQueue = useCallback(async () => {
        setQueueLoading(true)
        try {
            const res = await listIncidents({
                assignedToId: userId,
                status: 'IN_PROGRESS',
                limit: 20,
                sort: 'slaDeadlineAt:asc',
            })
            setQueue(res?.data ?? [])
        } catch {
            setQueue([])
        } finally {
            setQueueLoading(false)
        }
    }, [userId])

    const fetchResolved = useCallback(async () => {
        setResolvedLoading(true)
        try {
            const res = await listIncidents({
                assignedToId: userId,
                status: 'RESOLVED',
                limit: 5,
                sort: 'resolvedAt:desc',
            })
            setResolved(res?.data ?? [])
        } catch {
            setResolved([])
        } finally {
            setResolvedLoading(false)
        }
    }, [userId])

    useEffect(() => {
        fetchQueue()
        fetchResolved()
    }, [fetchQueue, fetchResolved, refreshKey])

    // Real-time refresh
    useEffect(() => {
        const bump = () => setRefreshKey((k) => k + 1)
        const u1 = on('incident_created', bump)
        const u2 = on('incident_updated', bump)
        return () => { u1(); u2() }
    }, [on])

    const handleLogout = () => { logout(); navigate('/login') }

    const formatTime = (iso) => {
        if (!iso) return '—'
        return new Date(iso).toLocaleTimeString('en-IN', {
            hour: '2-digit', minute: '2-digit', hour12: true,
        })
    }

    const formatDate = (iso) => {
        if (!iso) return '—'
        return new Date(iso).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
        })
    }

    const locationStr = (incident) => {
        const loc = incident.location
        if (!loc) return '—'
        const parts = [loc.block && `Block ${loc.block}`, loc.room].filter(Boolean)
        return parts.length ? parts.join(' · ') : '—'
    }

    return (
        <div className="min-h-screen bg-slate-900 flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-64 flex-1 min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4 flex items-center gap-4">
                    <div className="w-9 h-9 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                        <ClipboardList size={18} className="text-indigo-400" />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-semibold text-white">My Queue</h1>
                            {!queueLoading && (
                                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
                                    {queue.length} active
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-slate-500 mt-0.5">
                            Incidents assigned to you, sorted by SLA urgency
                        </p>
                    </div>
                </header>

                <div className="px-8 py-8 space-y-10">
                    {/* ── Assigned / In-Progress queue ────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                            Active Incidents
                        </h2>

                        {queueLoading ? (
                            <div className="space-y-3">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className="bg-white/5 border border-white/8 rounded-2xl p-5 flex items-center gap-4">
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 flex-1" />
                                        <Skeleton className="h-5 w-16" />
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-9 w-28" />
                                    </div>
                                ))}
                            </div>
                        ) : queue.length === 0 ? (
                            <div className="bg-white/5 border border-white/8 rounded-2xl flex flex-col items-center justify-center py-16 text-center">
                                <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                                    <CheckCircle2 size={24} className="text-emerald-600" />
                                </div>
                                <p className="text-slate-400 font-medium">Queue is clear!</p>
                                <p className="text-slate-600 text-sm mt-1">No active incidents assigned to you.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {queue.map((incident) => {
                                    const deadline = incident.sla?.deadlineAt ?? incident.slaDeadlineAt ?? null
                                    return (
                                        <div
                                            key={incident.id}
                                            className="bg-white/5 border border-white/8 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4 hover:bg-white/8 transition-colors group"
                                        >
                                            {/* Number + Title */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-indigo-400 font-mono text-xs">
                                                        #{incident.incidentNumber ?? '—'}
                                                    </span>
                                                    <PriorityBadge priority={incident.priority} />
                                                </div>
                                                <p className="text-white font-medium text-sm truncate group-hover:text-indigo-300 transition-colors">
                                                    {incident.title}
                                                </p>
                                                <div className="flex items-center gap-1 mt-1 text-xs text-slate-500">
                                                    <MapPin size={11} className="shrink-0" />
                                                    {locationStr(incident)}
                                                </div>
                                            </div>

                                            {/* SLA countdown */}
                                            <div className="shrink-0">
                                                <SLACountdown deadline={deadline} />
                                            </div>

                                            {/* View & Resolve button */}
                                            <button
                                                id={`view-incident-${incident.id}`}
                                                onClick={() => navigate(`/incidents/${incident.id}`)}
                                                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all duration-150 hover:shadow-lg hover:shadow-indigo-500/20"
                                            >
                                                <ExternalLink size={13} />
                                                View & Resolve
                                            </button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>

                    {/* ── Resolved Today ───────────────────────────────────────── */}
                    <section>
                        <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                            Recently Resolved
                        </h2>

                        {resolvedLoading ? (
                            <div className="bg-white/5 border border-white/8 rounded-2xl divide-y divide-white/5">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-4 px-5 py-4">
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 flex-1" />
                                        <Skeleton className="h-4 w-20" />
                                    </div>
                                ))}
                            </div>
                        ) : resolved.length === 0 ? (
                            <div className="bg-white/5 border border-white/8 rounded-2xl flex flex-col items-center justify-center py-12 text-center">
                                <p className="text-slate-500 text-sm">No resolved incidents yet.</p>
                            </div>
                        ) : (
                            <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
                                <div className="divide-y divide-white/5">
                                    {resolved.map((incident) => (
                                        <div
                                            key={incident.id}
                                            className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors cursor-pointer"
                                            onClick={() => navigate(`/incidents/${incident.id}`)}
                                        >
                                            <span className="text-indigo-400 font-mono text-xs shrink-0">
                                                #{incident.incidentNumber ?? '—'}
                                            </span>
                                            <p className="text-sm text-slate-300 truncate flex-1">
                                                {incident.title}
                                            </p>
                                            <span className="text-xs text-slate-500 shrink-0 flex items-center gap-1">
                                                <CheckCircle2 size={11} className="text-emerald-500" />
                                                {incident.resolvedAt
                                                    ? `${formatDate(incident.resolvedAt)} · ${formatTime(incident.resolvedAt)}`
                                                    : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    )
}
