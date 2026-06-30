import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    Bell,
    Send,
    AlertTriangle,
    Loader2,
    RefreshCw,
    X,
    CheckCircle2,
    RotateCcw,
    ChevronDown,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { broadcastAlert, listAlerts, retractAlert } from '../api/alerts'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

// ── Constants ──────────────────────────────────────────────────────────────────
const ALERT_TYPES = ['EMERGENCY', 'ANNOUNCEMENT', 'MAINTENANCE_SHUTDOWN']
const SEVERITIES = ['CRITICAL', 'WARNING', 'INFO']
const SCOPES = ['CAMPUS', 'DEPARTMENT', 'ROLE']
const SCOPE_ROLES = ['STUDENT', 'FACULTY', 'MAINTENANCE', 'SECURITY', 'ADMIN']
const CHANNELS = ['REALTIME', 'EMAIL']

const DEFAULT_FORM = {
    title: '',
    message: '',
    type: 'ANNOUNCEMENT',
    severity: 'INFO',
    scope: 'CAMPUS',
    scopeDepartmentId: '',
    scopeRole: 'STUDENT',
    deliveryChannels: ['REALTIME'],
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function Field({ label, required, error, hint, children }) {
    return (
        <div className="flex flex-col gap-2">
            <label className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-secondary)' }}>
                {label}
                {required && <span style={{ color: 'var(--color-danger-400)' }} className="ml-1">*</span>}
            </label>
            {children}
            {hint && <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>{hint}</p>}
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

const inputStyle = (hasError = false) => ({
    background: 'rgba(255,255,255,0.03)',
    border: `1px solid ${hasError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
    color: 'var(--color-text-primary)',
    transition: 'border-color 200ms, box-shadow 200ms',
})

const inputFocus = (e) => {
    e.target.style.borderColor = 'rgba(99,102,241,0.4)'
    e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
}
const inputBlur = (e) => {
    e.target.style.borderColor = 'rgba(255,255,255,0.08)'
    e.target.style.boxShadow = ''
}

// ── Type badge ─────────────────────────────────────────────────────────────────
const TYPE_STYLE = {
    EMERGENCY:            { bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.2)',  text: '#f87171', pulse: true },
    ANNOUNCEMENT:         { bg: 'rgba(14,165,233,0.1)', border: 'rgba(14,165,233,0.2)', text: '#38bdf8' },
    MAINTENANCE_SHUTDOWN: { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', text: '#fbbf24' },
}

function TypeBadge({ type }) {
    const s = TYPE_STYLE[type] || { bg: 'rgba(100,116,139,0.1)', border: 'rgba(100,116,139,0.2)', text: '#94a3b8' }
    return (
        <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider ${s.pulse ? 'animate-pulse' : ''}`}
            style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.text }}
        >
            <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
            {type?.replace('_', ' ')}
        </span>
    )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg ${className}`} style={{ background: 'rgba(255,255,255,0.04)' }} />
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BroadcastAlertPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [form, setForm] = useState(DEFAULT_FORM)
    const [errors, setErrors] = useState({})
    const [submitting, setSubmitting] = useState(false)

    const [alerts, setAlerts] = useState([])
    const [alertsLoading, setAlertsLoading] = useState(true)
    const [retractingId, setRetractingId] = useState(null)

    const fetchAlerts = useCallback(async () => {
        setAlertsLoading(true)
        try {
            const res = await listAlerts({ limit: 10, sort: 'createdAt:desc' })
            setAlerts(res?.data ?? [])
        } catch {
            setAlerts([])
        } finally {
            setAlertsLoading(false)
        }
    }, [])

    useEffect(() => { fetchAlerts() }, [fetchAlerts])

    const handleLogout = () => { logout(); navigate('/login') }

    const set = (field) => (e) => {
        setForm((prev) => ({ ...prev, [field]: e.target.value }))
        if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }))
    }

    const toggleChannel = (ch) => {
        setForm((prev) => ({
            ...prev,
            deliveryChannels: prev.deliveryChannels.includes(ch)
                ? prev.deliveryChannels.filter((c) => c !== ch)
                : [...prev.deliveryChannels, ch],
        }))
    }

    function validate() {
        const e = {}
        if (!form.title.trim()) e.title = 'Title is required'
        if (!form.message.trim()) e.message = 'Message is required'
        if (form.deliveryChannels.length === 0) e.channels = 'Select at least one delivery channel'
        if (form.scope === 'DEPARTMENT' && !form.scopeDepartmentId.trim())
            e.scopeDepartmentId = 'Department ID is required for Department scope'
        return e
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }

        const payload = {
            title: form.title.trim(),
            message: form.message.trim(),
            type: form.type,
            severity: form.severity,
            scopeTarget: form.scope,
            deliveryChannels: form.deliveryChannels,
        }
        if (form.scope === 'DEPARTMENT') payload.scopeDepartmentId = form.scopeDepartmentId.trim()
        if (form.scope === 'ROLE') payload.scopeRole = form.scopeRole

        setSubmitting(true)
        try {
            await broadcastAlert(payload)
            toast.success('Alert broadcasted successfully!')
            setForm(DEFAULT_FORM)
            setErrors({})
            fetchAlerts()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to broadcast alert')
        } finally {
            setSubmitting(false)
        }
    }

    const handleRetract = async (id) => {
        setRetractingId(id)
        try {
            await retractAlert(id)
            toast.success('Alert retracted')
            fetchAlerts()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to retract alert')
        } finally {
            setRetractingId(null)
        }
    }

    const formatDate = (iso) => {
        if (!iso) return '—'
        return new Date(iso).toLocaleString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: true,
        })
    }

    const scopeLabel = (a) => {
        if (a.scope === 'CAMPUS') return 'All Campus'
        if (a.scope === 'DEPARTMENT') return `Dept: ${a.scopeDepartmentId ?? '—'}`
        if (a.scope === 'ROLE') return `Role: ${a.scopeRole ?? '—'}`
        return a.scope ?? '—'
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
                            background: 'rgba(239,68,68,0.1)',
                            border: '1px solid rgba(239,68,68,0.2)',
                        }}
                    >
                        <Bell size={20} style={{ color: '#f87171' }} />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-tight">Broadcast Alert</h1>
                        <p className="text-xs mt-0.5 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            Send campus-wide notifications and emergency alerts
                        </p>
                    </div>
                </header>

                <div className="px-8 py-8">
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_450px] gap-8 items-start">
                        {/* ── Left: Compose form ── */}
                        <div
                            className="rounded-2xl overflow-hidden"
                            style={{
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            <div
                                className="px-8 py-5 flex items-center gap-2"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
                            >
                                <Send size={14} style={{ color: '#818cf8' }} />
                                <h2 className="text-base font-bold text-white">Compose Alert</h2>
                            </div>

                            <form onSubmit={handleSubmit} className="px-8 py-8 space-y-8" noValidate>
                                {/* Title */}
                                <Field label="Title" required error={errors.title}>
                                    <div className="relative">
                                        <input
                                            id="alert-title"
                                            type="text"
                                            value={form.title}
                                            onChange={set('title')}
                                            placeholder="Alert headline…"
                                            maxLength={120}
                                            className="w-full text-sm font-medium rounded-xl px-4 py-3 outline-none placeholder:text-zinc-600"
                                            style={inputStyle(!!errors.title)}
                                            onFocus={inputFocus}
                                            onBlur={inputBlur}
                                        />
                                        <span
                                            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-medium px-1"
                                            style={{ color: 'var(--color-text-muted)' }}
                                        >
                                            {form.title.length}/120
                                        </span>
                                    </div>
                                </Field>

                                {/* Message */}
                                <Field label="Message" required error={errors.message}>
                                    <textarea
                                        id="alert-message"
                                        rows={5}
                                        value={form.message}
                                        onChange={set('message')}
                                        placeholder="Describe the alert in detail…"
                                        className="w-full text-sm font-medium rounded-xl px-4 py-3 outline-none resize-none placeholder:text-zinc-600"
                                        style={inputStyle(!!errors.message)}
                                        onFocus={inputFocus}
                                        onBlur={inputBlur}
                                    />
                                </Field>

                                {/* Type + Severity */}
                                <div className="grid grid-cols-2 gap-5">
                                    <Field label="Type" required>
                                        <div className="relative">
                                            <select
                                                id="alert-type"
                                                value={form.type}
                                                onChange={set('type')}
                                                className="w-full text-sm font-medium rounded-xl px-4 py-3 appearance-none cursor-pointer outline-none pr-10 text-white"
                                                style={inputStyle()}
                                                onFocus={inputFocus}
                                                onBlur={inputBlur}
                                            >
                                                {ALERT_TYPES.map((t) => (
                                                    <option key={t} value={t}>{t.replace('_', ' ')}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                                        </div>
                                    </Field>

                                    <Field label="Severity" required>
                                        <div className="relative">
                                            <select
                                                id="alert-severity"
                                                value={form.severity}
                                                onChange={set('severity')}
                                                className="w-full text-sm font-medium rounded-xl px-4 py-3 appearance-none cursor-pointer outline-none pr-10 text-white"
                                                style={inputStyle()}
                                                onFocus={inputFocus}
                                                onBlur={inputBlur}
                                            >
                                                {SEVERITIES.map((s) => (
                                                    <option key={s} value={s}>{s}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                                        </div>
                                    </Field>
                                </div>

                                {/* Scope */}
                                <Field label="Scope Target" required>
                                    <div className="flex gap-3" role="radiogroup" aria-label="Scope Target">
                                        {SCOPES.map((s) => {
                                            const selected = form.scope === s
                                            return (
                                                <label
                                                    key={s}
                                                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold cursor-pointer transition-all"
                                                    style={{
                                                        background: selected ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                                                        border: `1px solid ${selected ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                                        color: selected ? '#818cf8' : 'var(--color-text-secondary)',
                                                        boxShadow: selected ? '0 4px 16px -6px rgba(99,102,241,0.3)' : 'none',
                                                    }}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="alert-scope"
                                                        value={s}
                                                        checked={selected}
                                                        onChange={() => setForm((prev) => ({ ...prev, scope: s }))}
                                                        className="sr-only"
                                                    />
                                                    {s}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </Field>

                                {/* Conditional scope fields */}
                                {form.scope === 'DEPARTMENT' && (
                                    <Field label="Department ID" required error={errors.scopeDepartmentId} hint="Enter the specific department ID to target.">
                                        <Input
                                            id="alert-dept-id"
                                            type="text"
                                            value={form.scopeDepartmentId}
                                            onChange={set('scopeDepartmentId')}
                                            placeholder="e.g. dept_01jv…"
                                            hasError={!!errors.scopeDepartmentId}
                                        />
                                    </Field>
                                )}

                                {form.scope === 'ROLE' && (
                                    <Field label="Target Role" required>
                                        <div className="relative">
                                            <select
                                                id="alert-scope-role"
                                                value={form.scopeRole}
                                                onChange={set('scopeRole')}
                                                className="w-full text-sm font-medium rounded-xl px-4 py-3 appearance-none cursor-pointer outline-none pr-10 text-white"
                                                style={inputStyle()}
                                                onFocus={inputFocus}
                                                onBlur={inputBlur}
                                            >
                                                {SCOPE_ROLES.map((r) => (
                                                    <option key={r} value={r}>{r}</option>
                                                ))}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                                        </div>
                                    </Field>
                                )}

                                {/* Delivery channels */}
                                <Field label="Delivery Channels" required error={errors.channels}>
                                    <div className="flex gap-3">
                                        {CHANNELS.map((ch) => {
                                            const checked = form.deliveryChannels.includes(ch)
                                            return (
                                                <label
                                                    key={ch}
                                                    className="flex-1 flex items-center gap-3 py-3 px-5 rounded-xl text-sm font-bold cursor-pointer transition-all"
                                                    style={{
                                                        background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                                                        border: `1px solid ${checked ? 'rgba(99,102,241,0.35)' : 'rgba(255,255,255,0.08)'}`,
                                                        color: checked ? '#818cf8' : 'var(--color-text-secondary)',
                                                        boxShadow: checked ? '0 4px 16px -6px rgba(99,102,241,0.3)' : 'none',
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        id={`channel-${ch}`}
                                                        checked={checked}
                                                        onChange={() => toggleChannel(ch)}
                                                        className="sr-only"
                                                    />
                                                    <span
                                                        className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-all"
                                                        style={{
                                                            background: checked ? '#6366f1' : 'rgba(255,255,255,0.04)',
                                                            border: `1px solid ${checked ? '#6366f1' : 'rgba(255,255,255,0.12)'}`,
                                                        }}
                                                    >
                                                        {checked && <CheckCircle2 size={12} className="text-white" />}
                                                    </span>
                                                    {ch}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </Field>

                                {/* Submit */}
                                <div className="pt-6 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <Button
                                        id="broadcast-submit-btn"
                                        type="submit"
                                        variant="danger"
                                        disabled={submitting}
                                        isLoading={submitting}
                                        icon={submitting ? null : Bell}
                                        className="w-full justify-center py-3.5 text-base"
                                        style={{ boxShadow: '0 4px 20px -6px rgba(239,68,68,0.4)' }}
                                    >
                                        {submitting ? 'Broadcasting…' : 'Broadcast Alert'}
                                    </Button>
                                </div>
                            </form>
                        </div>

                        {/* ── Right: Recent alerts ── */}
                        <div
                            className="rounded-2xl overflow-hidden"
                            style={{
                                background: 'var(--surface-2)',
                                border: '1px solid rgba(255,255,255,0.05)',
                                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                            }}
                        >
                            <div
                                className="flex items-center justify-between px-6 py-5"
                                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
                            >
                                <h2 className="text-base font-bold text-white flex items-center gap-2">
                                    <Bell size={14} style={{ color: 'var(--color-text-muted)' }} />
                                    Recent Alerts
                                </h2>
                                <button
                                    id="refresh-alerts-btn"
                                    onClick={fetchAlerts}
                                    disabled={alertsLoading}
                                    className="h-8 w-8 rounded-lg flex items-center justify-center transition-colors"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(99,102,241,0.1)'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                                >
                                    <RefreshCw size={14} className={alertsLoading ? 'animate-spin' : ''} style={{ color: 'var(--color-text-muted)' }} />
                                </button>
                            </div>

                            <div className="max-h-[800px] overflow-y-auto">
                                {alertsLoading ? (
                                    <div>
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <div key={i} className="px-6 py-5 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                <div className="flex items-center gap-3">
                                                    <Skeleton className="h-6 w-24 rounded-full" />
                                                    <Skeleton className="h-5 w-32 flex-1" />
                                                </div>
                                                <Skeleton className="h-4 w-40" />
                                            </div>
                                        ))}
                                    </div>
                                ) : alerts.length === 0 ? (
                                    <div className="py-16 text-center text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                        No alerts broadcasted yet.
                                    </div>
                                ) : (
                                    <div>
                                        {alerts.map((alert) => (
                                            <div
                                                key={alert.id}
                                                className="px-6 py-5 transition-colors"
                                                style={{
                                                    borderBottom: '1px solid rgba(255,255,255,0.03)',
                                                    opacity: alert.isRetracted ? 0.5 : 1,
                                                }}
                                                onMouseEnter={e => { if (!alert.isRetracted) e.currentTarget.style.background = 'rgba(99,102,241,0.03)' }}
                                                onMouseLeave={e => e.currentTarget.style.background = ''}
                                            >
                                                <div className="flex items-start gap-3 mb-2">
                                                    <TypeBadge type={alert.type} />
                                                    <p
                                                        className="text-sm font-bold leading-snug flex-1 break-words"
                                                        style={{
                                                            color: 'var(--color-text-primary)',
                                                            textDecoration: alert.isRetracted ? 'line-through' : 'none',
                                                        }}
                                                    >
                                                        {alert.title}
                                                    </p>
                                                    {alert.isRetracted && (
                                                        <span
                                                            className="shrink-0 text-[10px] font-bold flex items-center gap-1 px-2 py-1 rounded-md uppercase tracking-wider"
                                                            style={{
                                                                background: 'rgba(255,255,255,0.04)',
                                                                border: '1px solid rgba(255,255,255,0.08)',
                                                                color: 'var(--color-text-muted)',
                                                            }}
                                                        >
                                                            <X size={10} />
                                                            Retracted
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-4 gap-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                                                            {scopeLabel(alert)}
                                                        </span>
                                                        <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                                            {formatDate(alert.createdAt)}
                                                        </span>
                                                    </div>

                                                    {!alert.isRetracted && (
                                                        <Button
                                                            id={`retract-alert-${alert.id}`}
                                                            onClick={() => handleRetract(alert.id)}
                                                            disabled={retractingId === alert.id}
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full sm:w-auto shrink-0"
                                                        >
                                                            {retractingId === alert.id ? (
                                                                <Loader2 size={14} className="animate-spin" />
                                                            ) : (
                                                                <RotateCcw size={14} className="mr-1.5" />
                                                            )}
                                                            Retract
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}
