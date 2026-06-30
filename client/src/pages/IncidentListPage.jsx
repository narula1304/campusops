import { useEffect, useState, useCallback, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
    Plus,
    Filter,
    ChevronDown,
    ChevronUp,
    Search,
    X,
    FileText,
    ChevronLeft,
    ChevronRight,
    SlidersHorizontal,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../api/incidents'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10

const STATUS_OPTIONS   = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'REOPENED']
const PRIORITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const CATEGORY_OPTIONS = ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']

// ── Priority / Status colors ────────────────────────────────────────────────────
const PRIORITY_STYLE = {
    CRITICAL: { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   text: '#f87171' },
    HIGH:     { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  text: '#fbbf24' },
    MEDIUM:   { bg: 'rgba(234,179,8,0.1)',   border: 'rgba(234,179,8,0.2)',   text: '#facc15' },
    LOW:      { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)',  text: '#34d399' },
}

const STATUS_STYLE = {
    OPEN:        { bg: 'rgba(14,165,233,0.1)',  border: 'rgba(14,165,233,0.2)',  text: '#38bdf8' },
    IN_PROGRESS: { bg: 'rgba(99,102,241,0.1)',  border: 'rgba(99,102,241,0.2)',  text: '#818cf8' },
    RESOLVED:    { bg: 'rgba(16,185,129,0.1)',  border: 'rgba(16,185,129,0.2)',  text: '#34d399' },
    CLOSED:      { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' },
    ESCALATED:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   text: '#f87171' },
    REOPENED:    { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  text: '#fbbf24' },
}

function PriorityBadge({ priority }) {
    const s = PRIORITY_STYLE[priority] || { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' }
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border"
            style={{ background: s.bg, borderColor: s.border, color: s.text }}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {priority}
        </span>
    )
}

function StatusBadge({ status }) {
    const s = STATUS_STYLE[status] || { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' }
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border"
            style={{ background: s.bg, borderColor: s.border, color: s.text }}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {status?.replace('_', ' ')}
        </span>
    )
}

// ── Skeleton rows ──────────────────────────────────────────────────────────────
function SkeletonRows() {
    return (
        <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    {[28, 180, 80, 70, 80, 72].map((w, j) => (
                        <td key={j} className="px-6 py-4">
                            <div className="skeleton rounded h-4" style={{ width: w }} />
                        </td>
                    ))}
                </tr>
            ))}
        </tbody>
    )
}

// ── Filter select ──────────────────────────────────────────────────────────────
function FilterSelect({ id, label, value, onChange, options }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--color-text-muted)' }}>
                {label}
            </label>
            <div className="relative">
                <select
                    id={id}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="input px-3.5 py-2 pr-9 text-sm min-w-[130px] appearance-none cursor-pointer"
                    style={{ background: 'var(--surface-3)' }}
                >
                    <option value="">All</option>
                    {options.map(opt => (
                        <option key={opt} value={opt}>{opt.replace('_', ' ')}</option>
                    ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: 'var(--color-text-muted)' }} />
            </div>
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function IncidentListPage() {
    const { user, logout, on } = useAuth()
    const navigate = useNavigate()

    const role            = user?.role
    const userId          = user?.id
    const showReportButton = ['STUDENT', 'FACULTY', 'ADMIN'].includes(role)

    const [filtersOpen,      setFiltersOpen]      = useState(false)
    const [statusFilter,     setStatusFilter]     = useState('')
    const [priorityFilter,   setPriorityFilter]   = useState('')
    const [categoryFilter,   setCategoryFilter]   = useState('')
    const [searchInput,      setSearchInput]      = useState('')
    const [searchDebounced,  setSearchDebounced]  = useState('')
    const debounceRef = useRef(null)

    useEffect(() => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            setSearchDebounced(searchInput)
            setPage(1)
        }, 400)
        return () => clearTimeout(debounceRef.current)
    }, [searchInput])

    const [page,       setPage]       = useState(1)
    const [incidents,  setIncidents]  = useState([])
    const [total,      setTotal]      = useState(0)
    const [loading,    setLoading]    = useState(true)
    const [refreshKey, setRefreshKey] = useState(0)

    const buildParams = useCallback(() => {
        const p = { limit: PAGE_SIZE, page, sort: 'createdAt:desc' }
        if (role === 'STUDENT' || role === 'FACULTY') p.createdById  = userId
        else if (role === 'MAINTENANCE' || role === 'SECURITY')     p.assignedToId = userId
        if (statusFilter)       p.status   = statusFilter
        if (priorityFilter)     p.priority  = priorityFilter
        if (categoryFilter)     p.category  = categoryFilter
        if (searchDebounced.trim()) p.search = searchDebounced.trim()
        return p
    }, [role, userId, page, statusFilter, priorityFilter, categoryFilter, searchDebounced])

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setLoading(true)
            try {
                const res = await listIncidents(buildParams())
                if (!cancelled) {
                    setIncidents(res?.data ?? [])
                    setTotal(res?.meta?.total ?? 0)
                }
            } catch {
                if (!cancelled) { setIncidents([]); setTotal(0) }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [buildParams, refreshKey])

    useEffect(() => { setPage(1) }, [statusFilter, priorityFilter, categoryFilter])

    useEffect(() => {
        const bump = () => setRefreshKey(k => k + 1)
        const u1 = on('incident_created', bump)
        const u2 = on('incident_updated', bump)
        return () => { u1(); u2() }
    }, [on])

    const handleLogout = () => { logout(); navigate('/login') }

    const hasActiveFilters = statusFilter || priorityFilter || categoryFilter || searchDebounced
    const clearFilters = () => {
        setStatusFilter(''); setPriorityFilter(''); setCategoryFilter('')
        setSearchInput(''); setSearchDebounced(''); setPage(1)
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const fromItem   = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
    const toItem     = Math.min(page * PAGE_SIZE, total)

    const formatDate = (d) => !d ? '—' : new Date(d).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
    })

    const activeFilterCount = [statusFilter, priorityFilter, categoryFilter, searchDebounced].filter(Boolean).length

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
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Incidents</h1>
                        <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            {role === 'ADMIN'
                                ? 'All incidents across campus'
                                : (role === 'MAINTENANCE' || role === 'SECURITY')
                                    ? 'Incidents assigned to you'
                                    : 'Your submitted incidents'}
                        </p>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                        <button
                            id="toggle-filters-btn"
                            onClick={() => setFiltersOpen(v => !v)}
                            className="relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                            style={{
                                background: (filtersOpen || hasActiveFilters) ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.04)',
                                border: (filtersOpen || hasActiveFilters) ? '1px solid rgba(99,102,241,0.3)' : '1px solid rgba(255,255,255,0.07)',
                                color: (filtersOpen || hasActiveFilters) ? '#818cf8' : 'var(--color-text-secondary)',
                            }}
                        >
                            <SlidersHorizontal size={14} />
                            Filters
                            {activeFilterCount > 0 && (
                                <span
                                    className="flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold text-white"
                                    style={{ background: 'var(--color-primary-500)' }}
                                >
                                    {activeFilterCount}
                                </span>
                            )}
                            {filtersOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>

                        {showReportButton && (
                            <Button
                                id="report-incident-btn"
                                variant="primary"
                                size="sm"
                                onClick={() => navigate('/incidents/new')}
                                icon={Plus}
                            >
                                Report Incident
                            </Button>
                        )}
                    </div>
                </header>

                {/* ── Filter bar ── */}
                <div
                    id="filter-bar"
                    className="overflow-hidden transition-all duration-300"
                    style={{
                        maxHeight: filtersOpen ? '200px' : '0px',
                        opacity: filtersOpen ? 1 : 0,
                    }}
                >
                    <div
                        className="px-8 py-5 flex flex-wrap items-end gap-4"
                        style={{
                            background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(255,255,255,0.01))',
                            borderBottom: '1px solid rgba(255,255,255,0.05)',
                        }}
                    >
                        <FilterSelect id="filter-status"   label="Status"   value={statusFilter}   onChange={setStatusFilter}   options={STATUS_OPTIONS}   />
                        <FilterSelect id="filter-priority" label="Priority" value={priorityFilter} onChange={setPriorityFilter} options={PRIORITY_OPTIONS} />
                        <FilterSelect id="filter-category" label="Category" value={categoryFilter} onChange={setCategoryFilter} options={CATEGORY_OPTIONS} />

                        <div className="flex flex-col gap-1.5 flex-1 min-w-[180px] max-w-xs">
                            <label className="text-[10px] font-bold uppercase tracking-[0.12em]"
                                style={{ color: 'var(--color-text-muted)' }}>Search</label>
                            <Input
                                id="search-incidents"
                                icon={Search}
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                                placeholder="Search by title…"
                                size="sm"
                            />
                        </div>

                        {hasActiveFilters && (
                            <Button
                                id="clear-filters-btn"
                                variant="ghost"
                                size="sm"
                                onClick={clearFilters}
                                icon={X}
                                className="text-danger-400 hover:text-danger-300 mb-0.5"
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                </div>

                {/* ── Table ── */}
                <div className="p-8 flex-1">
                    <div
                        className="overflow-hidden rounded-2xl"
                        style={{
                            background: 'var(--surface-2)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        {['#', 'Title', 'Category', 'Priority', 'Status', 'Created'].map((h, i) => (
                                            <th
                                                key={h}
                                                className="px-6 py-4 text-[10px] font-bold uppercase tracking-[0.1em]"
                                                style={{ color: 'var(--color-text-muted)', display: i === 2 ? undefined : undefined }}
                                            >
                                                {h}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>

                                {loading ? (
                                    <SkeletonRows />
                                ) : incidents.length === 0 ? (
                                    <tbody>
                                        <tr>
                                            <td colSpan={6}>
                                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                                    <div
                                                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                                                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                                                    >
                                                        <FileText size={26} style={{ color: 'var(--color-text-muted)' }} />
                                                    </div>
                                                    <p className="text-base font-semibold text-white">No incidents found</p>
                                                    <p className="text-sm mt-1.5 max-w-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                        {hasActiveFilters ? 'Try adjusting your filters.' : 'No incidents have been reported yet.'}
                                                    </p>
                                                    {hasActiveFilters && (
                                                        <Button
                                                            id="empty-clear-filters-btn"
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={clearFilters}
                                                            className="mt-5"
                                                            icon={X}
                                                        >
                                                            Clear filters
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                ) : (
                                    <tbody>
                                        {incidents.map((incident) => (
                                            <tr
                                                key={incident.id}
                                                onClick={() => navigate(`/incidents/${incident.id}`)}
                                                className="cursor-pointer group transition-all duration-150 relative"
                                                style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                onMouseEnter={e => {
                                                    e.currentTarget.style.background = 'rgba(99,102,241,0.05)'
                                                }}
                                                onMouseLeave={e => {
                                                    e.currentTarget.style.background = ''
                                                }}
                                            >
                                                {/* Left accent on hover */}
                                                <td className="px-6 py-4 relative">
                                                    <div
                                                        className="absolute left-0 top-0 bottom-0 w-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150 rounded-r"
                                                        style={{ background: 'var(--color-primary-500)' }}
                                                    />
                                                    <span
                                                        className="font-mono text-[11px] font-bold group-hover:text-primary-400 transition-colors"
                                                        style={{ color: 'var(--color-text-muted)' }}
                                                    >
                                                        #{incident.incidentNumber ?? '—'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 max-w-[240px]">
                                                    <Link
                                                        to={`/incidents/${incident.id}`}
                                                        onClick={e => e.stopPropagation()}
                                                        className="font-semibold text-sm truncate block transition-colors group-hover:text-primary-300"
                                                        style={{ color: 'var(--color-text-primary)' }}
                                                    >
                                                        {incident.title}
                                                    </Link>
                                                </td>
                                                <td className="px-6 py-4 hidden md:table-cell text-xs font-medium"
                                                    style={{ color: 'var(--color-text-secondary)' }}>
                                                    {incident.category ?? '—'}
                                                </td>
                                                <td className="px-6 py-4 hidden sm:table-cell">
                                                    <PriorityBadge priority={incident.priority} />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <StatusBadge status={incident.status} />
                                                </td>
                                                <td className="px-6 py-4 hidden lg:table-cell text-xs font-medium"
                                                    style={{ color: 'var(--color-text-muted)' }}>
                                                    {formatDate(incident.createdAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                )}
                            </table>
                        </div>

                        {/* ── Pagination ── */}
                        {!loading && total > 0 && (
                            <div
                                className="flex items-center justify-between px-6 py-4 flex-wrap gap-4"
                                style={{
                                    borderTop: '1px solid rgba(255,255,255,0.05)',
                                    background: 'rgba(255,255,255,0.015)',
                                }}
                            >
                                <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                    Showing{' '}
                                    <span className="font-bold text-white">{fromItem}</span>
                                    {' '}–{' '}
                                    <span className="font-bold text-white">{toItem}</span>
                                    {' '}of{' '}
                                    <span className="font-bold text-white">{total}</span>
                                    {' '}results
                                </p>

                                <div className="flex items-center gap-2">
                                    <Button
                                        id="pagination-prev-btn"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        icon={ChevronLeft}
                                    >
                                        Prev
                                    </Button>

                                    <div
                                        className="px-3 py-1.5 rounded-lg text-xs font-bold"
                                        style={{
                                            background: 'rgba(99,102,241,0.12)',
                                            border: '1px solid rgba(99,102,241,0.2)',
                                            color: 'var(--color-primary-300)',
                                        }}
                                    >
                                        {page} / {totalPages}
                                    </div>

                                    <Button
                                        id="pagination-next-btn"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages}
                                        iconRight={ChevronRight}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
