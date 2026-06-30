import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Building2, Plus, AlertTriangle, Settings2, Users, RotateCw, Hand, Zap } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { createDepartment } from '../api/departments'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

// ── Strategy options with icons & descriptions ─────────────────────────────────
const STRATEGIES = [
    {
        value: 'LEAST_LOADED',
        label: 'Least Loaded',
        icon: Users,
        desc: 'Assigns to the staff member with fewest active tasks',
        accent: '#34d399',
        recommended: true,
    },
    {
        value: 'ROUND_ROBIN',
        label: 'Round Robin',
        icon: RotateCw,
        desc: 'Distributes assignments evenly in rotation',
        accent: '#818cf8',
    },
    {
        value: 'SHIFT_AWARE',
        label: 'Shift Aware',
        icon: Zap,
        desc: 'Considers staff shift schedules when assigning',
        accent: '#fbbf24',
    },
    {
        value: 'MANUAL',
        label: 'Manual',
        icon: Hand,
        desc: 'Admin manually picks the assignee each time',
        accent: '#f87171',
    },
]

// ── Reusable field wrapper ─────────────────────────────────────────────────────
function Field({ label, required, error, children }) {
    return (
        <div className="flex flex-col gap-2">
            <label
                className="text-xs font-bold uppercase tracking-widest"
                style={{ color: 'var(--color-text-secondary)' }}
            >
                {label}
                {required && <span style={{ color: 'var(--color-danger-400)' }} className="ml-1">*</span>}
            </label>
            {children}
            {error && (
                <p
                    className="text-xs font-medium flex items-center gap-1.5 p-2.5 rounded-lg"
                    style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: 'var(--color-danger-400)',
                    }}
                >
                    <AlertTriangle size={14} />
                    {error}
                </p>
            )}
        </div>
    )
}

export default function CreateDepartmentPage() {
    const navigate = useNavigate()
    const { user, logout } = useAuth()

    const [form, setForm] = useState({
        name: '',
        code: '',
        assignmentStrategy: 'LEAST_LOADED',
    })
    const [errors, setErrors] = useState({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleLogout = () => { logout(); navigate('/login') }

    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    }

    function validate() {
        const e = {}
        if (!form.name.trim()) e.name = 'Department Name is required'
        if (!form.code.trim()) e.code = 'Department Code is required'
        return e
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        const validationErrors = validate()
        if (Object.keys(validationErrors).length > 0) {
            setErrors(validationErrors)
            return
        }

        setIsSubmitting(true)
        setErrors({})

        try {
            await createDepartment({
                name: form.name.trim(),
                code: form.code.trim().toUpperCase(),
                assignmentStrategy: form.assignmentStrategy,
            })

            toast.success('Department created successfully!')
            navigate('/dashboard')
        } catch (err) {
            const apiError = err?.response?.data?.error
            toast.error(apiError?.message ?? err?.message ?? 'Failed to create department.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen flex flex-col">
                {/* ── Sticky header ── */}
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
                        <Building2 size={20} style={{ color: 'var(--color-primary-400)' }} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Create Department</h1>
                        <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            Add a new department and configure its assignment strategy
                        </p>
                    </div>
                </header>

                {/* ── Content ── */}
                <div className="px-8 py-8 max-w-2xl">
                    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
                        {/* ── Name & Code ── */}
                        <div
                            className="rounded-2xl p-7 space-y-6"
                            style={{
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Settings2 size={14} style={{ color: 'var(--color-primary-400)' }} />
                                <span
                                    className="text-[10px] font-bold uppercase tracking-[0.14em]"
                                    style={{ color: 'var(--color-text-muted)' }}
                                >
                                    Basic Information
                                </span>
                            </div>

                            <Field label="Department Name" required error={errors.name}>
                                <Input
                                    type="text"
                                    value={form.name}
                                    onChange={set('name')}
                                    placeholder="e.g. Facilities Management"
                                    hasError={!!errors.name}
                                />
                            </Field>

                            <Field label="Department Code" required error={errors.code}>
                                <Input
                                    type="text"
                                    value={form.code}
                                    onChange={set('code')}
                                    placeholder="e.g. FAC"
                                    hasError={!!errors.code}
                                    style={{ textTransform: 'uppercase' }}
                                />
                            </Field>
                        </div>

                        {/* ── Strategy picker tiles ── */}
                        <div
                            className="rounded-2xl p-7"
                            style={{
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            <div className="flex items-center gap-2 mb-5">
                                <Zap size={14} style={{ color: 'var(--color-primary-400)' }} />
                                <span
                                    className="text-[10px] font-bold uppercase tracking-[0.14em]"
                                    style={{ color: 'var(--color-text-muted)' }}
                                >
                                    Assignment Strategy
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {STRATEGIES.map(({ value, label, icon: Icon, desc, accent, recommended }) => {
                                    const selected = form.assignmentStrategy === value
                                    return (
                                        <label
                                            key={value}
                                            className="relative flex items-start gap-3.5 p-4 rounded-xl cursor-pointer transition-all duration-200"
                                            style={{
                                                background: selected ? `${accent}10` : 'rgba(255,255,255,0.02)',
                                                border: `1px solid ${selected ? `${accent}40` : 'rgba(255,255,255,0.06)'}`,
                                                boxShadow: selected ? `0 4px 20px -6px ${accent}30` : 'none',
                                            }}
                                            onMouseEnter={e => {
                                                if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
                                            }}
                                            onMouseLeave={e => {
                                                if (!selected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                                            }}
                                        >
                                            <input
                                                type="radio"
                                                name="assignmentStrategy"
                                                value={value}
                                                checked={selected}
                                                onChange={() => setForm(prev => ({ ...prev, assignmentStrategy: value }))}
                                                className="sr-only"
                                            />
                                            {/* Icon */}
                                            <div
                                                className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                                                style={{
                                                    background: selected ? `${accent}20` : 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${selected ? `${accent}30` : 'rgba(255,255,255,0.07)'}`,
                                                }}
                                            >
                                                <Icon size={16} style={{ color: selected ? accent : 'var(--color-text-muted)' }} />
                                            </div>
                                            {/* Text */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p
                                                        className="text-sm font-bold"
                                                        style={{ color: selected ? accent : 'var(--color-text-primary)' }}
                                                    >
                                                        {label}
                                                    </p>
                                                    {recommended && (
                                                        <span
                                                            className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                                                            style={{
                                                                background: `${accent}20`,
                                                                color: accent,
                                                            }}
                                                        >
                                                            Recommended
                                                        </span>
                                                    )}
                                                </div>
                                                <p
                                                    className="text-xs mt-1 leading-relaxed"
                                                    style={{ color: 'var(--color-text-muted)' }}
                                                >
                                                    {desc}
                                                </p>
                                            </div>
                                            {/* Radio dot */}
                                            <div
                                                className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-1"
                                                style={{
                                                    border: `2px solid ${selected ? accent : 'rgba(255,255,255,0.15)'}`,
                                                    transition: 'border-color 200ms',
                                                }}
                                            >
                                                {selected && (
                                                    <div
                                                        className="w-2 h-2 rounded-full"
                                                        style={{ background: accent }}
                                                    />
                                                )}
                                            </div>
                                        </label>
                                    )
                                })}
                            </div>
                        </div>

                        {/* ── Submit ── */}
                        <Button
                            type="submit"
                            variant="primary"
                            disabled={isSubmitting}
                            isLoading={isSubmitting}
                            icon={isSubmitting ? null : Plus}
                            className="w-full justify-center py-3.5 text-base"
                            style={{ boxShadow: '0 4px 20px -6px rgba(99,102,241,0.5)' }}
                        >
                            {isSubmitting ? 'Creating…' : 'Create Department'}
                        </Button>
                    </form>
                </div>
            </main>
        </div>
    )
}
