import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
    ClipboardList,
    CheckCircle2,
    Clock,
    MapPin,
    ExternalLink,
    Loader2,
    Sparkles,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import SLACountdown from '../components/SLACountdown'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../api/incidents'
import { Button } from '../components/ui/Button'

// ── Priority badge ─────────────────────────────────────────────────────────────
const PRIORITY_STYLE = {
    CRITICAL: { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  text: '#f87171' },
    HIGH:     { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
    MEDIUM:   { bg: 'rgba(234,179,8,0.1)',  border: 'rgba(234,179,8,0.2)',  text: '#facc15' },
    LOW:      { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', text: '#34d399' },
}

function PriorityBadge({ priority }) {
    const s = PRIORITY_STYLE[priority] || { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' }
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
            style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {priority}
        </span>
    )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'rgba(255,255,255,0.04)' }} />
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
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen flex flex-col">
                {/* ── Header ── */}
                <header
                    className="sticky top-0 z-30 px-8 py-4 flex items-center gap-4"
                    style={{
                        background: 'rgba(3,7,18,0.85)',
                        backdropFilter: 'blur(20px)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                    }}
                >
                    <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                            background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.2)',
                        }}
                    >
                        <ClipboardList size={20} style={{ color: '#818cf8' }} />
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-xl font-bold text-white tracking-tight">My Queue</h1>
                            {!queueLoading && queue.length > 0 && (
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider"
                                    style={{
                                        background: 'rgba(99,102,241,0.12)',
                                        border: '1px solid rgba(99,102,241,0.25)',
                                        color: '#818cf8',
                                        boxShadow: '0 0 12px rgba(99,102,241,0.15)',
                                    }}
                                >
                                    <span className="dot-live" />
                                    {queue.length} active
                                </span>
                            )}
                        </div>
                        <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            Incidents assigned to you, sorted by SLA urgency
                        </p>
                    </div>
                </header>

                <div className="p-8 space-y-10 flex-1">
                    {/* ── Active queue ── */}
                    <section>
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--color-text-muted)' }}>
                            Active Incidents
                        </h2>

                        {queueLoading ? (
                            <div className="space-y-4">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="rounded-2xl p-5 flex items-center gap-4"
                                        style={{
                                            background: 'var(--surface-2)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                        }}
                                    >
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 flex-1" />
                                        <Skeleton className="h-5 w-16 rounded-full" />
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-10 w-32 rounded-xl" />
                                    </div>
                                ))}
                            </div>
                        ) : queue.length === 0 ? (
                            <div
                                className="rounded-2xl flex flex-col items-center justify-center py-20 text-center"
                                style={{
                                    background: 'var(--surface-2)',
                                    border: '1px solid rgba(255,255,255,0.05)',
                                    boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                                }}
                            >
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                                    style={{
                                        background: 'rgba(16,185,129,0.1)',
                                        border: '1px solid rgba(16,185,129,0.2)',
                                        boxShadow: '0 8px 24px -8px rgba(16,185,129,0.3)',
                                    }}
                                >
                                    <Sparkles size={28} style={{ color: '#34d399' }} />
                                </div>
                                <p className="text-lg font-bold text-white">Queue is clear!</p>
                                <p className="text-sm mt-1 max-w-sm" style={{ color: 'var(--color-text-muted)' }}>
                                    No active incidents are assigned to you at the moment.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {queue.map((incident) => {
                                    const deadline = incident.sla?.deadlineAt ?? incident.slaDeadlineAt ?? null
                                    return (
                                        <div
                                            key={incident.id}
                                            className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-5 group transition-all duration-200 cursor-pointer"
                                            style={{
                                                background: 'var(--surface-2)',
                                                border: '1px solid rgba(255,255,255,0.05)',
                                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                                                transition: 'transform 300ms cubic-bezier(.16,1,.3,1), box-shadow 300ms, border-color 200ms',
                                            }}
                                            onClick={() => navigate(`/incidents/${incident.id}`)}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.transform = 'translateY(-2px)'
                                                e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.4), 0 4px 16px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.06)'
                                                e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.transform = ''
                                                e.currentTarget.style.boxShadow = '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)'
                                                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'
                                            }}
                                        >
                                            {/* Number + Title */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="font-mono text-xs font-bold" style={{ color: '#818cf8' }}>
                                                        #{incident.incidentNumber ?? '—'}
                                                    </span>
                                                    <PriorityBadge priority={incident.priority} />
                                                </div>
                                                <p className="text-white font-semibold text-base truncate group-hover:text-primary-300 transition-colors">
                                                    {incident.title}
                                                </p>
                                                <div className="flex items-center gap-1.5 mt-2 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                                    <MapPin size={12} className="shrink-0" />
                                                    {locationStr(incident)}
                                                </div>
                                            </div>

                                            {/* SLA countdown */}
                                            <div className="shrink-0">
                                                <SLACountdown deadline={deadline} />
                                            </div>

                                            {/* View & Resolve button */}
                                            <Button
                                                id={`view-incident-${incident.id}`}
                                                onClick={(e) => { e.stopPropagation(); navigate(`/incidents/${incident.id}`) }}
                                                className="shrink-0"
                                                icon={ExternalLink}
                                            >
                                                View & Resolve
                                            </Button>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </section>

                    {/* ── Recently Resolved ── */}
                    <section>
                        <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] mb-5" style={{ color: 'var(--color-text-muted)' }}>
                            Recently Resolved
                        </h2>

                        <div
                            className="overflow-hidden rounded-2xl"
                            style={{
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            {resolvedLoading ? (
                                <div>
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className="flex items-center gap-4 px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <Skeleton className="h-4 w-16" />
                                            <Skeleton className="h-4 flex-1" />
                                            <Skeleton className="h-4 w-32" />
                                        </div>
                                    ))}
                                </div>
                            ) : resolved.length === 0 ? (
                                <div className="py-16 text-center text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                    No resolved incidents yet.
                                </div>
                            ) : (
                                <div>
                                    {resolved.map((incident) => (
                                        <div
                                            key={incident.id}
                                            className="flex items-center gap-4 px-6 py-5 cursor-pointer group transition-all duration-150"
                                            style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                            onClick={() => navigate(`/incidents/${incident.id}`)}
                                            onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                                            onMouseLeave={e => e.currentTarget.style.background = ''}
                                        >
                                            <span className="font-mono text-xs shrink-0 group-hover:text-primary-400 transition-colors" style={{ color: 'var(--color-text-muted)' }}>
                                                #{incident.incidentNumber ?? '—'}
                                            </span>
                                            <p className="text-sm font-medium truncate flex-1 group-hover:text-primary-300 transition-colors" style={{ color: 'var(--color-text-primary)' }}>
                                                {incident.title}
                                            </p>
                                            <span className="text-xs font-medium shrink-0 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                                <CheckCircle2 size={12} style={{ color: '#34d399' }} />
                                                {incident.resolvedAt
                                                    ? `${formatDate(incident.resolvedAt)} · ${formatTime(incident.resolvedAt)}`
                                                    : '—'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                </div>
            </main>
        </div>
    )
}
