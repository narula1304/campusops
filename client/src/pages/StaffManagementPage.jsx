import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Users, ChevronDown, Loader2, AlertTriangle } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { listUsers, updateStaffState } from '../api/users'

// ── Staff state badge ─────────────────────────────────────────────────────────
const STAFF_STATE_STYLES = {
    AVAILABLE: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    BUSY: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    ACTIVE: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    UNDER_REVIEW: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    SUSPENDED: 'bg-red-500/15 text-red-400 border border-red-500/30',
}

function StateBadge({ state }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STAFF_STATE_STYLES[state] ?? 'bg-slate-700 text-slate-300'}`}>
            {state?.replace('_', ' ') ?? 'UNKNOWN'}
        </span>
    )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

// ── Action dropdown ────────────────────────────────────────────────────────────
const STATE_ACTIONS = [
    { label: 'Set Active', value: 'ACTIVE', color: 'text-emerald-400 hover:bg-emerald-500/10' },
    { label: 'Set Under Review', value: 'UNDER_REVIEW', color: 'text-yellow-400 hover:bg-yellow-500/10' },
    { label: 'Suspend', value: 'SUSPENDED', color: 'text-red-400 hover:bg-red-500/10' },
]

function StateDropdown({ member, onStateChange, loadingId }) {
    const [open, setOpen] = useState(false)

    const handleAction = (newState) => {
        setOpen(false)
        onStateChange(member.id, newState)
    }

    return (
        <div className="relative">
            <button
                id={`staff-actions-${member.id}`}
                onClick={() => setOpen((v) => !v)}
                disabled={loadingId === member.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-slate-300 hover:text-white text-xs font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
            >
                {loadingId === member.id ? (
                    <Loader2 size={12} className="animate-spin" />
                ) : (
                    <>Actions <ChevronDown size={12} /></>
                )}
            </button>

            {open && (
                <>
                    {/* Click-away overlay */}
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 mt-1 w-44 bg-slate-800 border border-white/12 rounded-xl shadow-xl overflow-hidden z-20">
                        {STATE_ACTIONS.map(({ label, value, color }) => (
                            <button
                                key={value}
                                onClick={() => handleAction(value)}
                                className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors ${color}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffManagementPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [staff, setStaff] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [loadingId, setLoadingId] = useState(null)

    const fetchStaff = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const [maint, sec] = await Promise.all([
                listUsers({ role: 'MAINTENANCE', limit: 50 }),
                listUsers({ role: 'SECURITY', limit: 50 }),
            ])
            setStaff([...(maint?.data ?? []), ...(sec?.data ?? [])])
        } catch (e) {
            setError(e?.response?.data?.error?.message ?? 'Failed to load staff')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchStaff() }, [fetchStaff])

    const handleLogout = () => { logout(); navigate('/login') }

    const handleStateChange = async (userId, newState) => {
        // Optimistic update
        setStaff((prev) =>
            prev.map((m) => m.id === userId ? { ...m, staffState: newState } : m)
        )
        setLoadingId(userId)
        try {
            await updateStaffState(userId, newState)
            toast.success(`Staff state updated to ${newState.replace('_', ' ')}`)
        } catch (err) {
            // Revert
            setStaff((prev) =>
                prev.map((m) => m.id === userId ? { ...m, staffState: m._prevState } : m)
            )
            toast.error(err?.response?.data?.error?.message ?? 'Failed to update state')
            // Refetch to get real state
            fetchStaff()
        } finally {
            setLoadingId(null)
        }
    }

    const maintenance = staff.filter((m) => m.role === 'MAINTENANCE')
    const security = staff.filter((m) => m.role === 'SECURITY')

    return (
        <div className="min-h-screen bg-slate-900 flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-64 flex-1 min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-600/20 flex items-center justify-center">
                        <Users size={18} className="text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white">Staff Management</h1>
                        <p className="text-sm text-slate-500 mt-0.5">
                            {loading ? 'Loading…' : `${staff.length} staff member${staff.length !== 1 ? 's' : ''}`}
                        </p>
                    </div>
                </header>

                <div className="px-8 py-8 space-y-8">
                    {error && (
                        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm">
                            <AlertTriangle size={16} />
                            {error}
                        </div>
                    )}

                    {[
                        { label: 'Maintenance', members: maintenance },
                        { label: 'Security', members: security },
                    ].map(({ label, members }) => (
                        <section key={label}>
                            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">
                                {label}
                                {!loading && (
                                    <span className="ml-2 normal-case font-normal text-slate-600">({members.length})</span>
                                )}
                            </h2>

                            <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                                {loading ? (
                                    <div className="divide-y divide-white/5">
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <div key={i} className="flex items-center gap-4 px-6 py-4">
                                                <Skeleton className="w-9 h-9 rounded-full" />
                                                <div className="flex-1 space-y-1.5">
                                                    <Skeleton className="h-4 w-32" />
                                                    <Skeleton className="h-3 w-44" />
                                                </div>
                                                <Skeleton className="h-5 w-20" />
                                                <Skeleton className="h-4 w-12" />
                                                <Skeleton className="h-4 w-12" />
                                                <Skeleton className="h-8 w-24" />
                                            </div>
                                        ))}
                                    </div>
                                ) : members.length === 0 ? (
                                    <div className="py-10 text-center text-slate-500 text-sm">
                                        No {label.toLowerCase()} staff found.
                                    </div>
                                ) : (
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-white/8">
                                                <th className="text-left text-xs font-semibold text-slate-500 px-6 py-3 uppercase tracking-wide">Name</th>
                                                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden md:table-cell">Email</th>
                                                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide">State</th>
                                                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">Active Tasks</th>
                                                <th className="text-left text-xs font-semibold text-slate-500 px-4 py-3 uppercase tracking-wide hidden lg:table-cell">Penalties</th>
                                                <th className="text-right text-xs font-semibold text-slate-500 px-6 py-3 uppercase tracking-wide">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {members.map((member) => (
                                                <tr key={member.id} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-indigo-600/20 border border-indigo-500/20 flex items-center justify-center shrink-0">
                                                                <span className="text-xs font-bold text-indigo-400">
                                                                    {(member.name ?? '?')[0].toUpperCase()}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-white">{member.name}</p>
                                                                {member.employeeId && (
                                                                    <p className="text-xs text-slate-500">ID: {member.employeeId}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-4 text-slate-400 text-xs hidden md:table-cell">
                                                        {member.email}
                                                    </td>
                                                    <td className="px-4 py-4">
                                                        <StateBadge state={member.staffState} />
                                                    </td>
                                                    <td className="px-4 py-4 text-slate-400 text-xs hidden lg:table-cell">
                                                        {member.activeTasks ?? member._count?.assignedIncidents ?? '—'}
                                                    </td>
                                                    <td className="px-4 py-4 text-slate-400 text-xs hidden lg:table-cell">
                                                        {member.penaltyCount ?? '0'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <StateDropdown
                                                            member={member}
                                                            onStateChange={handleStateChange}
                                                            loadingId={loadingId}
                                                        />
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </section>
                    ))}
                </div>
            </main>
        </div>
    )
}
