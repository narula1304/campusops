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
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { listIncidents } from '../api/incidents'

// ── Constants ──────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10

const STATUS_OPTIONS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'REOPENED']
const PRIORITY_OPTIONS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
const CATEGORY_OPTIONS = ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']

// ── Badge styles ───────────────────────────────────────────────────────────────
const PRIORITY_STYLES = {
    CRITICAL: 'bg-red-500/15 text-red-400 border border-red-500/30',
    HIGH: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    LOW: 'bg-green-500/15 text-green-400 border border-green-500/30',
}

const STATUS_STYLES = {
    OPEN: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    IN_PROGRESS: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
    RESOLVED: 'bg-green-500/15 text-green-400 border border-green-500/30',
    CLOSED: 'bg-slate-600/40 text-slate-400 border border-slate-600/40',
    ESCALATED: 'bg-red-500/15 text-red-400 border border-red-500/30',
    REOPENED: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
}

function PriorityBadge({ priority }) {
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                PRIORITY_STYLES[priority] ?? 'bg-slate-700 text-slate-300'
            }`}
        >
            {priority}
        </span>
    )
}

function StatusBadge({ status }) {
    const label = status?.replace('_', ' ')
    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                STATUS_STYLES[status] ?? 'bg-slate-700 text-slate-300'
            }`}
        >
            {label}
        </span>
    )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

function SkeletonRows() {
    return (
        <tbody className="divide-y divide-white/5">
            {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                <tr key={i} className="flex items-center gap-4 px-6 py-4 hidden [&]:flex">
                    <td className="px-6 py-4 w-28">
                        <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-4 flex-1">
                        <Skeleton className="h-4 w-full max-w-xs" />
                    </td>
                    <td className="px-4 py-4 hidden md:table-cell w-28">
                        <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-4 hidden sm:table-cell w-24">
                        <Skeleton className="h-5 w-16" />
                    </td>
                    <td className="px-4 py-4 w-28">
                        <Skeleton className="h-5 w-20" />
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell w-28">
                        <Skeleton className="h-4 w-24" />
                    </td>
                </tr>
            ))}
        </tbody>
    )
}

// ── Select control ─────────────────────────────────────────────────────────────
function FilterSelect({ id, label, value, onChange, options }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                {label}
            </label>
            <select
                id={id}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="bg-slate-800 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all appearance-none cursor-pointer min-w-[140px]"
            >
                <option value="">All</option>
                {options.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt.replace('_', ' ')}
                    </option>
                ))}
            </select>
        </div>
    )
}

// ── Search bar ─────────────────────────────────────────────────────────────────
function SearchInput({ value, onChange }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor="search-incidents" className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                Search
            </label>
            <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                    id="search-incidents"
                    type="text"
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="Search by title…"
                    className="bg-slate-800 border border-white/10 text-white text-sm rounded-xl pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all w-full sm:w-56 placeholder:text-slate-600"
                />
            </div>
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function IncidentListPage() {
    const { user, logout, on } = useAuth()
    const navigate = useNavigate()

    const role = user?.role
    const userId = user?.id
    const showReportButton = ['STUDENT', 'FACULTY', 'ADMIN'].includes(role)

    // ── Filter state ───────────────────────────────────────────────────────────
    const [filtersOpen, setFiltersOpen] = useState(false)
    const [statusFilter, setStatusFilter] = useState('')
    const [priorityFilter, setPriorityFilter] = useState('')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [searchInput, setSearchInput] = useState('')
    const [searchDebounced, setSearchDebounced] = useState('')
    const debounceRef = useRef(null)

    // Debounce search
    useEffect(() => {
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            setSearchDebounced(searchInput)
            setPage(1)
        }, 400)
        return () => clearTimeout(debounceRef.current)
    }, [searchInput])

    // ── Pagination ─────────────────────────────────────────────────────────────
    const [page, setPage] = useState(1)

    // ── Data ───────────────────────────────────────────────────────────────────
    const [incidents, setIncidents] = useState([])
    const [total, setTotal] = useState(0)
    const [loading, setLoading] = useState(true)
    const [refreshKey, setRefreshKey] = useState(0)

    // Build query params with role-based pre-filters
    const buildParams = useCallback(() => {
        const params = {
            limit: PAGE_SIZE,
            page,
            sort: 'createdAt:desc',
        }

        // Role-based base filters
        if (role === 'STUDENT' || role === 'FACULTY') {
            params.createdById = userId
        } else if (role === 'MAINTENANCE' || role === 'SECURITY') {
            params.assignedToId = userId
        }
        // ADMIN — no pre-filter

        // User-applied filters
        if (statusFilter) params.status = statusFilter
        if (priorityFilter) params.priority = priorityFilter
        if (categoryFilter) params.category = categoryFilter
        if (searchDebounced.trim()) params.search = searchDebounced.trim()

        return params
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
                if (!cancelled) {
                    setIncidents([])
                    setTotal(0)
                }
            } finally {
                if (!cancelled) setLoading(false)
            }
        })()
        return () => {
            cancelled = true
        }
    }, [buildParams, refreshKey])

    // Reset to page 1 when filters change
    useEffect(() => {
        setPage(1)
    }, [statusFilter, priorityFilter, categoryFilter])

    // Real-time refresh
    useEffect(() => {
        const bump = () => setRefreshKey((k) => k + 1)
        const unsub1 = on('incident_created', bump)
        const unsub2 = on('incident_updated', bump)
        return () => {
            unsub1()
            unsub2()
        }
    }, [on])

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    // ── Helpers ────────────────────────────────────────────────────────────────
    const hasActiveFilters =
        statusFilter !== '' || priorityFilter !== '' || categoryFilter !== '' || searchDebounced !== ''

    const clearFilters = () => {
        setStatusFilter('')
        setPriorityFilter('')
        setCategoryFilter('')
        setSearchInput('')
        setSearchDebounced('')
        setPage(1)
    }

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const fromItem = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
    const toItem = Math.min(page * PAGE_SIZE, total)

    const formatDate = (dateStr) => {
        if (!dateStr) return '—'
        return new Date(dateStr).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })
    }

    return (
        <div className="min-h-screen bg-slate-900 flex">
            {/* Sidebar */}
            <Sidebar user={user} onLogout={handleLogout} />

            {/* Main content */}
            <main className="ml-64 flex-1 min-h-screen">
                {/* ── Top header ──────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4 flex items-center justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold text-white">Incidents</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {role === 'ADMIN'
                                ? 'All incidents across campus'
                                : role === 'MAINTENANCE' || role === 'SECURITY'
                                ? 'Incidents assigned to you'
                                : 'Your submitted incidents'}
                        </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {/* Filter toggle */}
                        <button
                            id="toggle-filters-btn"
                            onClick={() => setFiltersOpen((v) => !v)}
                            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-150 ${
                                filtersOpen || hasActiveFilters
                                    ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400'
                                    : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/8'
                            }`}
                        >
                            <Filter size={15} />
                            Filters
                            {hasActiveFilters && (
                                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold">
                                    {[statusFilter, priorityFilter, categoryFilter, searchDebounced].filter(Boolean).length}
                                </span>
                            )}
                            {filtersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>

                        {showReportButton && (
                            <Link
                                to="/incidents/new"
                                id="report-incident-btn"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all duration-150 hover:shadow-lg hover:shadow-indigo-500/25"
                            >
                                <Plus size={15} />
                                Report Incident
                            </Link>
                        )}
                    </div>
                </header>

                {/* ── Collapsible filter bar ──────────────────────────────────── */}
                <div
                    id="filter-bar"
                    className={`overflow-hidden transition-all duration-300 ease-in-out border-b border-white/8 ${
                        filtersOpen ? 'max-h-48 opacity-100' : 'max-h-0 opacity-0'
                    }`}
                >
                    <div className="px-8 py-4 flex flex-wrap items-end gap-4 bg-slate-900/50">
                        <FilterSelect
                            id="filter-status"
                            label="Status"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={STATUS_OPTIONS}
                        />
                        <FilterSelect
                            id="filter-priority"
                            label="Priority"
                            value={priorityFilter}
                            onChange={setPriorityFilter}
                            options={PRIORITY_OPTIONS}
                        />
                        <FilterSelect
                            id="filter-category"
                            label="Category"
                            value={categoryFilter}
                            onChange={setCategoryFilter}
                            options={CATEGORY_OPTIONS}
                        />
                        <SearchInput value={searchInput} onChange={setSearchInput} />

                        {hasActiveFilters && (
                            <button
                                id="clear-filters-btn"
                                onClick={clearFilters}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-slate-400 hover:text-white border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all duration-150 self-end"
                            >
                                <X size={14} />
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Content ─────────────────────────────────────────────────── */}
                <div className="px-8 py-8">
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        {/* Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-white/8">
                                        <th className="text-left text-xs font-semibold text-slate-500 px-6 py-3 uppercase tracking-wide w-28">
                                            Incident #
                                        </th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide">
                                            Title
                                        </th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden md:table-cell w-32">
                                            Category
                                        </th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden sm:table-cell w-28">
                                            Priority
                                        </th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide w-32">
                                            Status
                                        </th>
                                        <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell w-28">
                                            Created
                                        </th>
                                    </tr>
                                </thead>

                                {loading ? (
                                    /* ── Skeleton rows ── */
                                    <tbody className="divide-y divide-white/5">
                                        {Array.from({ length: PAGE_SIZE }).map((_, i) => (
                                            <tr key={i}>
                                                <td className="px-6 py-4">
                                                    <Skeleton className="h-4 w-20" />
                                                </td>
                                                <td className="px-4 py-4">
                                                    <Skeleton className="h-4 w-full max-w-xs" />
                                                </td>
                                                <td className="px-4 py-4 hidden md:table-cell">
                                                    <Skeleton className="h-4 w-20" />
                                                </td>
                                                <td className="px-4 py-4 hidden sm:table-cell">
                                                    <Skeleton className="h-5 w-16" />
                                                </td>
                                                <td className="px-4 py-4">
                                                    <Skeleton className="h-5 w-20" />
                                                </td>
                                                <td className="px-4 py-4 hidden lg:table-cell">
                                                    <Skeleton className="h-4 w-24" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                ) : incidents.length === 0 ? (
                                    /* ── Empty state ── */
                                    <tbody>
                                        <tr>
                                            <td colSpan={6}>
                                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                                                        <FileText size={24} className="text-slate-600" />
                                                    </div>
                                                    <p className="text-slate-400 font-medium">No incidents found</p>
                                                    <p className="text-slate-600 text-sm mt-1">
                                                        {hasActiveFilters
                                                            ? 'Try adjusting your filters.'
                                                            : 'No incidents have been created yet.'}
                                                    </p>
                                                    {hasActiveFilters && (
                                                        <button
                                                            id="empty-clear-filters-btn"
                                                            onClick={clearFilters}
                                                            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white text-sm font-medium transition-all duration-150"
                                                        >
                                                            <X size={14} />
                                                            Clear filters
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                ) : (
                                    /* ── Data rows ── */
                                    <tbody className="divide-y divide-white/5">
                                        {incidents.map((incident) => (
                                            <tr
                                                key={incident.id}
                                                onClick={() => navigate(`/incidents/${incident.id}`)}
                                                className="hover:bg-white/5 cursor-pointer transition-colors group"
                                            >
                                                <td className="px-6 py-4 text-indigo-400 font-mono text-xs whitespace-nowrap">
                                                    #{incident.incidentNumber ?? '—'}
                                                </td>
                                                <td className="px-4 py-4 max-w-[280px]">
                                                    <Link
                                                        to={`/incidents/${incident.id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-white font-medium truncate block hover:text-indigo-300 transition-colors group-hover:text-indigo-300"
                                                    >
                                                        {incident.title}
                                                    </Link>
                                                </td>
                                                <td className="px-4 py-4 text-slate-400 hidden md:table-cell text-xs">
                                                    {incident.category ?? '—'}
                                                </td>
                                                <td className="px-4 py-4 hidden sm:table-cell">
                                                    <PriorityBadge priority={incident.priority} />
                                                </td>
                                                <td className="px-4 py-4">
                                                    <StatusBadge status={incident.status} />
                                                </td>
                                                <td className="px-4 py-4 text-slate-500 text-xs hidden lg:table-cell whitespace-nowrap">
                                                    {formatDate(incident.createdAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                )}
                            </table>
                        </div>

                        {/* ── Pagination footer ─────────────────────────────────── */}
                        {!loading && total > 0 && (
                            <div className="flex items-center justify-between px-6 py-4 border-t border-white/8 gap-4 flex-wrap">
                                <p className="text-sm text-slate-500">
                                    Showing{' '}
                                    <span className="text-slate-300 font-medium">{fromItem}</span>
                                    {' – '}
                                    <span className="text-slate-300 font-medium">{toItem}</span>
                                    {' of '}
                                    <span className="text-slate-300 font-medium">{total}</span>{' '}
                                    incident{total !== 1 ? 's' : ''}
                                </p>

                                <div className="flex items-center gap-2">
                                    <button
                                        id="pagination-prev-btn"
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        disabled={page === 1}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-white/10 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-white/8 enabled:hover:text-white text-slate-400"
                                    >
                                        <ChevronLeft size={15} />
                                        Previous
                                    </button>

                                    <span className="text-xs text-slate-500 px-1">
                                        {page} / {totalPages}
                                    </span>

                                    <button
                                        id="pagination-next-btn"
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        disabled={page >= totalPages}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border border-white/10 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-white/8 enabled:hover:text-white text-slate-400"
                                    >
                                        Next
                                        <ChevronRight size={15} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </main>
        </div>
    )
}
