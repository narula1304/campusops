import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Users, ChevronDown, Loader2, AlertTriangle, Plus, X } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { listUsers, updateStaffState } from '../api/users'
import { register } from '../api/auth'
import { getDepartments, updateStrategy } from '../api/departments'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

// ── Staff state badge (inline) ────────────────────────────────────────────────
const STATE_COLORS = {
    AVAILABLE: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', text: '#34d399' },
    ACTIVE: { bg: 'rgba(16,185,129,0.1)', border: 'rgba(16,185,129,0.2)', text: '#34d399' },
    BUSY: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
    UNDER_REVIEW: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
    SUSPENDED: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.2)', text: '#f87171' },
}

function StateBadge({ state }) {
    const s = STATE_COLORS[state] || { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' }
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider"
            style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {state?.replace('_', ' ') ?? 'UNKNOWN'}
        </span>
    )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'rgba(255,255,255,0.04)' }} />
}

// ── Role gradient avatar ───────────────────────────────────────────────────────
const ROLE_AVATAR = {
    MAINTENANCE: { from: '#fbbf24', to: '#f59e0b' },
    SECURITY: { from: '#f87171', to: '#ef4444' },
    ADMIN: { from: '#818cf8', to: '#6366f1' },
}

function RoleAvatar({ name, role }) {
    const grad = ROLE_AVATAR[role] ?? { from: '#818cf8', to: '#6366f1' }
    return (
        <div
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
            style={{
                background: `linear-gradient(135deg, ${grad.from}, ${grad.to})`,
                boxShadow: `0 4px 12px -4px ${grad.from}60`,
            }}
        >
            {(name ?? '?')[0].toUpperCase()}
        </div>
    )
}

// ── Action dropdown ────────────────────────────────────────────────────────────
const STATE_ACTIONS = [
    { label: 'Set Active', value: 'ACTIVE', color: '#34d399', bg: 'rgba(16,185,129,0.08)' },
    { label: 'Set Under Review', value: 'UNDER_REVIEW', color: '#fbbf24', bg: 'rgba(245,158,11,0.08)' },
    { label: 'Suspend', value: 'SUSPENDED', color: '#f87171', bg: 'rgba(239,68,68,0.08)' },
]

function StateDropdown({ member, onStateChange, loadingId }) {
    const [open, setOpen] = useState(false)
    const dropdownRef = useRef(null)

    const handleAction = (newState) => {
        setOpen(false)
        onStateChange(member.id, newState)
    }

    useEffect(() => {
        function handleClickOutside(event) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setOpen(false)
            }
        }
        if (open) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [open])

    return (
        <div className="relative inline-block" ref={dropdownRef}>
            <Button
                id={`staff-actions-${member.id}`}
                variant="outline"
                size="sm"
                onClick={() => setOpen((v) => !v)}
                disabled={loadingId === member.id}
                className="py-1.5 px-3 h-auto"
            >
                {loadingId === member.id ? (
                    <Loader2 size={14} className="animate-spin" />
                ) : (
                    <>Actions <ChevronDown size={14} className="ml-1" /></>
                )}
            </Button>

            {open && (
                <div
                    className="absolute right-0 mt-1 w-44 rounded-xl overflow-hidden py-1 z-[9999]"
                    style={{
                        background: 'var(--surface-2)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
                    }}
                >
                    {STATE_ACTIONS.map(({ label, value, color, bg }) => (
                        <button
                            key={value}
                            onClick={() => handleAction(value)}
                            className="w-full text-left px-4 py-2.5 text-xs font-bold transition-colors"
                            style={{ color }}
                            onMouseEnter={e => e.currentTarget.style.background = bg}
                            onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StaffManagementPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [staff, setStaff] = useState([])
    const [departments, setDepartments] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    const [loadingId, setLoadingId] = useState(null)

    // Add Staff State
    const [showAddStaff, setShowAddStaff] = useState(false)
    const [addForm, setAddForm] = useState({ name: '', email: '', password: '', role: 'MAINTENANCE', departmentId: '', employeeId: '' })
    const [addLoading, setAddLoading] = useState(false)

    const fetchData = useCallback(async () => {
        setLoading(true)
        setError('')
        try {
            const [maint, sec, admins, depts] = await Promise.all([
                listUsers({ role: 'MAINTENANCE', limit: 50 }),
                listUsers({ role: 'SECURITY', limit: 50 }),
                listUsers({ role: 'ADMIN', limit: 50 }),
                getDepartments()
            ])
            setStaff([...(maint?.data ?? []), ...(sec?.data ?? []), ...(admins?.data ?? [])])
            setDepartments(depts ?? [])
        } catch (e) {
            setError(e?.response?.data?.error?.message ?? 'Failed to load data')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { fetchData() }, [fetchData])

    const handleLogout = () => { logout(); navigate('/login') }

    const handleStateChange = async (userId, newState) => {
        setStaff((prev) => prev.map((m) => m.id === userId ? { ...m, _prevState: m.staffState, staffState: newState } : m))
        setLoadingId(userId)
        try {
            await updateStaffState(userId, newState)
            toast.success(`Staff state updated to ${newState.replace('_', ' ')}`)
        } catch (err) {
            setStaff((prev) => prev.map((m) => m.id === userId ? { ...m, staffState: m._prevState } : m))
            toast.error(err?.response?.data?.error?.message ?? 'Failed to update state')
            fetchData()
        } finally {
            setLoadingId(null)
        }
    }

    const handleStrategyChange = async (deptId, strategy) => {
        try {
            setDepartments(prev => prev.map(d => d.id === deptId ? { ...d, assignmentStrategy: strategy } : d))
            await updateStrategy(deptId, strategy)
            toast.success('Assignment strategy updated')
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to update strategy')
            fetchData()
        }
    }

    const handleAddStaff = async (e) => {
        e.preventDefault()
        setAddLoading(true)
        try {
            await register(addForm)
            toast.success('Staff member added successfully')
            setShowAddStaff(false)
            setAddForm({ name: '', email: '', password: '', role: 'MAINTENANCE', departmentId: '', employeeId: '', designation: '' })
            fetchData()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to add staff')
        } finally {
            setAddLoading(false)
        }
    }

    const maintenance = staff.filter((m) => m.role === 'MAINTENANCE')
    const security = staff.filter((m) => m.role === 'SECURITY')
    const admins = staff.filter((m) => m.role === 'ADMIN')

    return (
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen relative flex flex-col">
                {/* ── Header ── */}
                <header
                    className="sticky top-0 z-30 px-8 py-4 flex items-center justify-between"
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
                                background: 'rgba(99,102,241,0.1)',
                                border: '1px solid rgba(99,102,241,0.2)',
                            }}
                        >
                            <Users size={20} style={{ color: '#818cf8' }} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-white tracking-tight">Staff Management</h1>
                            <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                {loading ? 'Loading…' : `${staff.length} staff member${staff.length !== 1 ? 's' : ''}`}
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => setShowAddStaff(true)}
                        variant="primary"
                        icon={Plus}
                        style={{ boxShadow: '0 4px 16px -4px rgba(99,102,241,0.4)' }}
                    >
                        Add Staff
                    </Button>
                </header>

                <div className="px-8 py-8 space-y-10 flex-1">
                    {error && (
                        <div
                            className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
                            style={{
                                background: 'rgba(239,68,68,0.08)',
                                border: '1px solid rgba(239,68,68,0.2)',
                                color: 'var(--color-danger-400)',
                            }}
                        >
                            <AlertTriangle size={18} className="shrink-0" />
                            {error}
                        </div>
                    )}

                    {/* Strategy Configuration */}
                    {!loading && departments.length > 0 && (
                        <section>
                            <h2 className="text-[10px] font-bold uppercase tracking-[0.12em] mb-4" style={{ color: 'var(--color-text-muted)' }}>
                                Department Strategies
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                                {departments.map(dept => (
                                    <div
                                        key={dept.id}
                                        className="rounded-2xl p-5 flex flex-col gap-3 transition-all duration-200"
                                        style={{
                                            background: 'var(--surface-2)',
                                            border: '1px solid rgba(255,255,255,0.05)',
                                            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-bold text-white">{dept.name}</span>
                                            <span
                                                className="font-mono text-xs px-2 py-0.5 rounded-lg"
                                                style={{
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    color: 'var(--color-text-muted)',
                                                }}
                                            >
                                                {dept.code}
                                            </span>
                                        </div>
                                        <div className="relative">
                                            <select
                                                value={dept.assignmentStrategy}
                                                onChange={(e) => handleStrategyChange(dept.id, e.target.value)}
                                                className="w-full text-sm font-medium rounded-xl px-4 py-2.5 appearance-none outline-none pr-10 cursor-pointer text-white"
                                                style={{
                                                    background: 'rgba(255,255,255,0.04)',
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    transition: 'border-color 200ms',
                                                }}
                                                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.4)'}
                                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                                            >
                                                <option value="LEAST_LOADED">Least Loaded</option>
                                                <option value="ROUND_ROBIN">Round Robin</option>
                                                <option value="SHIFT_AWARE">Shift Aware</option>
                                                <option value="MANUAL">Manual</option>
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {[
                        { label: 'Maintenance', members: maintenance },
                        { label: 'Security', members: security },
                        { label: 'Administrators', members: admins },
                    ].map(({ label, members }) => (
                        <section key={label}>
                            <div className="flex items-center gap-2 mb-4">
                                <h2 className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-muted)' }}>
                                    {label}
                                </h2>
                                {!loading && (
                                    <span
                                        className="text-[10px] font-bold px-2 py-0.5 rounded-lg"
                                        style={{
                                            background: 'rgba(255,255,255,0.04)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            color: 'var(--color-text-muted)',
                                        }}
                                    >
                                        {members.length}
                                    </span>
                                )}
                            </div>

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
                                        {Array.from({ length: 4 }).map((_, i) => (
                                            <div key={i} className="flex items-center gap-4 px-6 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <Skeleton className="w-9 h-9 rounded-full" />
                                                <div className="flex-1 space-y-2">
                                                    <Skeleton className="h-4 w-32" />
                                                    <Skeleton className="h-3 w-44" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : members.length === 0 ? (
                                    <div className="py-12 text-center text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                        No {label.toLowerCase()} staff found.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto overflow-y-visible">
                                        <table className="w-full text-sm text-left">
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    {['Name', 'Email', 'State', 'Active Tasks', 'Penalties', 'Actions'].map((h, i) => (
                                                        <th
                                                            key={h}
                                                            className={`px-6 py-4 text-[10px] font-bold uppercase tracking-[0.1em] ${i === 1 ? 'hidden md:table-cell' : ''} ${i === 3 || i === 4 ? 'hidden lg:table-cell' : ''} ${i === 5 ? 'text-right' : ''}`}
                                                            style={{ color: 'var(--color-text-muted)' }}
                                                        >
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {members.map((member) => (
                                                    <tr
                                                        key={member.id}
                                                        className="group transition-all duration-150"
                                                        style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                                                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.03)'}
                                                        onMouseLeave={e => e.currentTarget.style.background = ''}
                                                    >
                                                        <td className="px-6 py-4">
                                                            <div className="flex items-center gap-3">
                                                                <RoleAvatar name={member.name} role={member.role} />
                                                                <div>
                                                                    <p className="text-sm font-bold text-white">{member.name}</p>
                                                                    {member.employeeId && (
                                                                        <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                                                            ID: {member.employeeId}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 font-medium hidden md:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                                                            {member.email}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <StateBadge state={member.staffState} />
                                                        </td>
                                                        <td className="px-6 py-4 font-medium hidden lg:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
                                                            {member.activeTasks ?? member._count?.assignedIncidents ?? '—'}
                                                        </td>
                                                        <td className="px-6 py-4 font-medium hidden lg:table-cell" style={{ color: 'var(--color-text-secondary)' }}>
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
                                    </div>
                                )}
                            </div>
                        </section>
                    ))}
                </div>
            </main>

            {/* Add Staff Modal */}
            {showAddStaff && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0"
                        style={{ background: 'rgba(3,7,18,0.8)', backdropFilter: 'blur(8px)' }}
                        onClick={() => !addLoading && setShowAddStaff(false)}
                    />
                    <div
                        className="relative w-full max-w-lg rounded-2xl overflow-hidden"
                        style={{
                            background: 'var(--surface-2)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            boxShadow: '0 32px 100px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
                            animation: 'fadeDown 200ms cubic-bezier(.16,1,.3,1)',
                        }}
                    >
                        {/* Accent line */}
                        <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)' }} />

                        <div className="p-8">
                            <div className="flex justify-between items-center mb-8 pb-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <div>
                                    <h2 className="text-xl font-bold text-white tracking-tight">Add New Staff</h2>
                                    <p className="text-sm font-medium mt-1" style={{ color: 'var(--color-text-secondary)' }}>
                                        Create a new staff member account.
                                    </p>
                                </div>
                                <button
                                    onClick={() => !addLoading && setShowAddStaff(false)}
                                    className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                >
                                    <X size={16} style={{ color: 'var(--color-text-muted)' }} />
                                </button>
                            </div>

                            <form onSubmit={handleAddStaff} className="space-y-5">
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Full Name</label>
                                    <Input
                                        required
                                        type="text"
                                        value={addForm.name}
                                        onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                                        placeholder="e.g. John Doe"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Email</label>
                                    <Input
                                        required
                                        type="email"
                                        value={addForm.email}
                                        onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                                        placeholder="john@campus.edu"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Password</label>
                                    <Input
                                        required
                                        type="password"
                                        value={addForm.password}
                                        onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-5">
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Role</label>
                                        <div className="relative">
                                            <select
                                                value={addForm.role}
                                                onChange={e => setAddForm({ ...addForm, role: e.target.value })}
                                                className="w-full text-sm font-medium rounded-xl px-4 py-3 appearance-none outline-none pr-10 cursor-pointer text-white"
                                                style={{
                                                    background: 'rgba(255,255,255,0.04)',
                                                }}
                                            >
                                                <option value="MAINTENANCE">Maintenance</option>
                                                <option value="SECURITY">Security</option>
                                                <option value="ADMIN">Admin</option>
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Employee ID</label>
                                        <Input
                                            required
                                            type="text"
                                            value={addForm.employeeId}
                                            onChange={e => setAddForm({ ...addForm, employeeId: e.target.value })}
                                            placeholder="EMP-001"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Designation</label>
                                    <div className="relative">
                                        <select
                                            value={addForm.designation}
                                            onChange={e => setAddForm({ ...addForm, designation: e.target.value })}
                                            className="w-full text-sm font-medium rounded-xl px-4 py-3 appearance-none outline-none pr-10 cursor-pointer text-white"
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <option value="">Select Designation...</option>
                                            <option value="System Administrator">System Administrator</option>
                                            <option value="IT Support Specialist">IT Support Specialist</option>

                                            <option value="Electrician">Electrician</option>
                                            <option value="Plumber">Plumber</option>
                                            <option value="Janitor">Janitor</option>
                                            <option value="Security Officer">Security Officer</option>
                                            <option value="Housekeeper">Housekeeper</option>
                                            <option value="Other">Other</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>Department (Optional)</label>
                                    <div className="relative">
                                        <select
                                            value={addForm.departmentId}
                                            onChange={e => setAddForm({ ...addForm, departmentId: e.target.value })}
                                            className="w-full text-sm font-medium rounded-xl px-4 py-3 appearance-none outline-none pr-10 cursor-pointer text-white"
                                            style={{
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}
                                        >
                                            <option value="">None</option>
                                            {departments.map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <Button
                                        type="submit"
                                        variant="primary"
                                        disabled={addLoading}
                                        isLoading={addLoading}
                                        icon={addLoading ? null : Plus}
                                        className="w-full justify-center py-3.5"
                                        style={{ boxShadow: '0 4px 20px -6px rgba(99,102,241,0.5)' }}
                                    >
                                        {addLoading ? 'Creating...' : 'Create Staff Member'}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
