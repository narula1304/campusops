import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, Flame, Filter, ArrowUpDown } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { getHeatmap } from '../api/analytics'

const CATEGORY_OPTIONS = ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']
const DAY_OPTIONS = [7, 14, 30, 90]

function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

function HeatBar({ count, max }) {
    const pct = max > 0 ? Math.round((count / max) * 100) : 0
    const color = pct > 75 ? 'bg-red-500' : pct > 50 ? 'bg-orange-500' : pct > 25 ? 'bg-yellow-500' : 'bg-emerald-500'
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 bg-white/5 rounded-full h-1.5 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ${color}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs text-slate-400 w-6 text-right">{count}</span>
        </div>
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
            // Normalize: API returns array of hotspots
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

    // Sort by count
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
        <div className="min-h-screen bg-slate-900 flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-64 flex-1 min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4 flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-600/20 flex items-center justify-center">
                            <Flame size={18} className="text-orange-400" />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-white">Incident Heatmap</h1>
                            <p className="text-sm text-slate-500 mt-0.5">Location-based incident concentration</p>
                        </div>
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex flex-col gap-1">
                            <label htmlFor="heatmap-days" className="text-xs text-slate-500 uppercase tracking-wide">Period</label>
                            <select
                                id="heatmap-days"
                                value={days}
                                onChange={(e) => setDays(Number(e.target.value))}
                                className="bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            >
                                {DAY_OPTIONS.map((d) => (
                                    <option key={d} value={d}>{d} days</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <label htmlFor="heatmap-category" className="text-xs text-slate-500 uppercase tracking-wide">Category</label>
                            <select
                                id="heatmap-category"
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                            >
                                <option value="">All Categories</option>
                                {CATEGORY_OPTIONS.map((c) => (
                                    <option key={c} value={c}>{c.replace('_', ' ')}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            id="heatmap-apply-btn"
                            onClick={applyFilters}
                            className="self-end inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
                        >
                            <Filter size={14} />
                            Apply
                        </button>
                    </div>
                </header>

                <div className="px-8 py-8">
                    {/* Summary */}
                    {!loading && (
                        <p className="text-sm text-slate-400 mb-5">
                            <span className="text-white font-semibold">{hotspots.length}</span> incident hotspot{hotspots.length !== 1 ? 's' : ''} in the last{' '}
                            <span className="text-white font-semibold">{appliedDays}</span> days
                            {appliedCategory ? <> · <span className="text-indigo-400">{appliedCategory}</span></> : ''}
                        </p>
                    )}

                    {/* Table */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        {loading ? (
                            <div className="divide-y divide-white/5">
                                {Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className="flex items-center gap-4 px-6 py-4">
                                        <Skeleton className="h-4 w-16" />
                                        <Skeleton className="h-4 w-20" />
                                        <Skeleton className="h-4 flex-1" />
                                        <Skeleton className="h-4 w-24" />
                                    </div>
                                ))}
                            </div>
                        ) : sorted.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-20 text-center">
                                <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                                    <MapPin size={24} className="text-slate-600" />
                                </div>
                                <p className="text-slate-400 font-medium">No hotspot data</p>
                                <p className="text-slate-600 text-sm mt-1">No incidents for the selected period{appliedCategory ? ` and category` : ''}.</p>
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/8">
                                        <th className="text-left text-xs font-semibold text-slate-500 px-6 py-3 uppercase tracking-wide">Block</th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide">Room</th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide w-48">
                                            <button
                                                onClick={() => setSortAsc((v) => !v)}
                                                className="inline-flex items-center gap-1 hover:text-white transition-colors"
                                            >
                                                Count <ArrowUpDown size={12} />
                                            </button>
                                        </th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">Last Incident</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {sorted.map((spot, i) => {
                                        const count = spot.count ?? spot.incidentCount ?? 0
                                        const block = spot.block ?? spot.locationBlock ?? '—'
                                        const room = spot.room ?? spot.locationRoom ?? '—'
                                        const lastDate = spot.lastIncidentAt ?? spot.lastAt ?? null
                                        return (
                                            <tr key={i} className="hover:bg-white/5 transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin size={13} className="text-indigo-400 shrink-0" />
                                                        <span className="text-white font-medium">Block {block}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 text-slate-400">{room}</td>
                                                <td className="px-4 py-4">
                                                    <HeatBar count={count} max={maxCount} />
                                                </td>
                                                <td className="px-4 py-4 text-slate-500 text-xs hidden lg:table-cell">
                                                    {formatDate(lastDate)}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
