import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Flame, Filter, ArrowUpDown, ChevronDown } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { getHeatmap } from '../api/analytics'
import { Button } from '../components/ui/Button'

const CATEGORY_OPTIONS = ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']
const DAY_OPTIONS = [7, 14, 30, 90]

function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'rgba(255,255,255,0.04)' }} />
}

// ── Gradient heat bar ──────────────────────────────────────────────────────────
function HeatBar({ count, max }) {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0
    // Gradient from green → amber → red based on percentage
    const getGradient = (p) => {
        if (p > 75) return { from: '#f87171', to: '#dc2626', shadow: 'rgba(239,68,68,0.3)' }
        if (p > 50) return { from: '#fbbf24', to: '#f59e0b', shadow: 'rgba(245,158,11,0.3)' }
        if (p > 25) return { from: '#fbbf24', to: '#eab308', shadow: 'rgba(234,179,8,0.25)' }
        return { from: '#34d399', to: '#10b981', shadow: 'rgba(16,185,129,0.25)' }
    }
    const g = getGradient(pct)

    return (
        <div className="flex items-center gap-3">
            <div
                className="flex-1 rounded-full h-2.5 overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.04)' }}
            >
                <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${g.from}, ${g.to})`,
                        boxShadow: `0 0 8px ${g.shadow}`,
                    }}
                />
            </div>
            <span className="text-xs font-bold text-white w-8 text-right tabular-nums">{count}</span>
        </div>
    )
}

// ── Rank badge for top 3 ───────────────────────────────────────────────────────
function RankBadge({ rank }) {
    const styles = {
        1: { bg: 'rgba(251,191,36,0.15)', border: 'rgba(251,191,36,0.3)', color: '#fbbf24', label: '🥇' },
        2: { bg: 'rgba(148,163,184,0.12)', border: 'rgba(148,163,184,0.25)', color: '#94a3b8', label: '🥈' },
        3: { bg: 'rgba(180,83,9,0.12)', border: 'rgba(180,83,9,0.25)', color: '#d97706', label: '🥉' },
    }
    const s = styles[rank]
    if (!s) return null

    return (
        <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm shrink-0"
            style={{ background: s.bg, border: `1px solid ${s.border}` }}
        >
            {s.label}
        </span>
    )
}

export default function HeatmapPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [days, setDays] = useState(30)
    const [category, setCategory] = useState('')
    const [appliedDays, setAppliedDays] = useState(30)
    const [appliedCategory, setAppliedCategory] = useState('')

    const [hotspots, setHotspots] = useState([])
    const [loading, setLoading] = useState(true)
    const [sortAsc, setSortAsc] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await getHeatmap(appliedDays, appliedCategory || undefined)
            const raw = Array.isArray(res) ? res : (res?.hotspots ?? res?.data ?? [])
            setHotspots(raw)
        } catch {
            setHotspots([])
        } finally {
            setLoading(false)
        }
    }, [appliedDays, appliedCategory])

    useEffect(() => { fetchData() }, [fetchData])

    const handleLogout = () => { logout(); navigate('/login') }

    const applyFilters = () => {
        setAppliedDays(days)
        setAppliedCategory(category)
    }

    const sorted = [...hotspots].sort((a, b) =>
        sortAsc
            ? (a.count ?? a.incidentCount ?? 0) - (b.count ?? b.incidentCount ?? 0)
            : (b.count ?? b.incidentCount ?? 0) - (a.count ?? a.incidentCount ?? 0)
    )

    const maxCount = sorted.reduce((m, h) => Math.max(m, h.count ?? h.incidentCount ?? 0), 1)

    const formatDate = (iso) => {
        if (!iso) return '—'
        return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    }

    return (
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen flex flex-col">
                {/* ── Header ── */}
                <header
                    className="sticky top-0 z-30 px-8 py-4 flex items-center justify-between gap-4 flex-wrap"
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
                                background: 'rgba(245,158,11,0.1)',
                                border: '1px solid rgba(245,158,11,0.2)',
                            }}
                        >
                            <Flame size={20} style={{ color: '#fbbf24' }} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Incident Heatmap</h1>
                            <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                Location-based incident concentration
                            </p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex items-end gap-4 flex-wrap">
                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="heatmap-days" className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-muted)' }}>
                                Period
                            </label>
                            <div className="relative">
                                <select
                                    id="heatmap-days"
                                    value={days}
                                    onChange={(e) => setDays(Number(e.target.value))}
                                    className="appearance-none cursor-pointer text-sm font-medium rounded-xl px-4 py-2.5 pr-10 outline-none w-32 text-white"
                                    style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.4)'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                                >
                                    {DAY_OPTIONS.map((d) => (
                                        <option key={d} value={d}>{d} days</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label htmlFor="heatmap-category" className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-muted)' }}>
                                Category
                            </label>
                            <div className="relative">
                                <select
                                    id="heatmap-category"
                                    value={category}
                                    onChange={(e) => setCategory(e.target.value)}
                                    className="appearance-none cursor-pointer text-sm font-medium rounded-xl px-4 py-2.5 pr-10 outline-none w-44 text-white"
                                    style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                        transition: 'border-color 200ms',
                                    }}
                                    onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.4)'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                                >
                                    <option value="">All Categories</option>
                                    {CATEGORY_OPTIONS.map((c) => (
                                        <option key={c} value={c}>{c.replace('_', ' ')}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                            </div>
                        </div>

                        <Button
                            id="heatmap-apply-btn"
                            onClick={applyFilters}
                            variant="primary"
                            icon={Filter}
                            className="h-[42px]"
                            style={{ boxShadow: '0 4px 16px -4px rgba(99,102,241,0.4)' }}
                        >
                            Apply
                        </Button>
                    </div>
                </header>

                <div className="px-8 py-8 flex-1">
                    {/* Summary */}
                    {!loading && (
                        <p className="text-sm font-medium mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                            <span className="text-white font-bold">{hotspots.length}</span> incident hotspot{hotspots.length !== 1 ? 's' : ''} in the last{' '}
                            <span className="text-white font-bold">{appliedDays}</span> days
                            {appliedCategory ? <> · <span className="font-bold" style={{ color: '#818cf8' }}>{appliedCategory}</span></> : ''}
                        </p>
                    )}

                    {/* Table */}
                    <div
                        className="overflow-hidden rounded-2xl"
                        style={{
                            background: 'var(--surface-2)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                    >
                        {loading ? (
                            <div>
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 flex-1" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                ))}
                            </div>
                        ) : sorted.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 text-center">
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                                    style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid rgba(255,255,255,0.07)',
                                    }}
                                >
                                    <MapPin size={28} style={{ color: 'var(--color-text-muted)' }} />
                                </div>
                                <p className="text-lg font-bold text-white">No hotspot data</p>
                                <p className="text-sm font-medium mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    No incidents for the selected period{appliedCategory ? ' and category' : ''}.
                                </p>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead>
                                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                            <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.1em] w-10" style={{ color: 'var(--color-text-muted)' }}>#</th>
                                            <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--color-text-muted)' }}>Block</th>
                                            <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'var(--color-text-muted)' }}>Room</th>
                                            <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.1em] w-48 sm:w-64" style={{ color: 'var(--color-text-muted)' }}>
                                                <button
                                                    onClick={() => setSortAsc((v) => !v)}
                                                    className="inline-flex items-center gap-1.5 transition-colors focus:outline-none"
                                                    style={{ color: 'var(--color-text-muted)' }}
                                                    onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                                                >
                                                    Count <ArrowUpDown size={14} />
                                                </button>
                                            </th>
                                            <th className="px-4 py-4 text-[10px] font-bold uppercase tracking-[0.1em] hidden lg:table-cell" style={{ color: 'var(--color-text-muted)' }}>Last Incident</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sorted.map((spot, i) => {
                                            const count = spot.count ?? spot.incidentCount ?? 0
                                            const block = spot.block ?? spot.locationBlock ?? '—'
                                            const room = spot.room ?? spot.locationRoom ?? '—'
                                            const lastDate = spot.lastIncidentAt ?? spot.lastAt ?? null
                                            const rank = i + 1
                                            return (
                                                <tr
                                                    key={i}
                                                    className="group transition-all duration-150"
                                                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.04)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = ''}
                                                >
                                                    <td className="px-6 py-4">
                                                        {rank <= 3 ? (
                                                            <RankBadge rank={rank} />
                                                        ) : (
                                                            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                                                                {rank}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <div className="flex items-center gap-2.5">
                                                            <MapPin size={14} style={{ color: '#818cf8' }} className="shrink-0" />
                                                            <span className="text-white font-bold">Block {block}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 font-medium" style={{ color: 'var(--color-text-secondary)' }}>{room}</td>
                                                    <td className="px-4 py-4 pr-8">
                                                        <HeatBar count={count} max={maxCount} />
                                                    </td>
                                                    <td className="px-4 py-4 text-xs font-medium hidden lg:table-cell" style={{ color: 'var(--color-text-muted)' }}>
                                                        {formatDate(lastDate)}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
