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
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { broadcastAlert, listAlerts, retractAlert } from '../api/alerts'

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
function inputCls(hasError = false) {
    return [
        'w-full px-4 py-2.5 rounded-lg bg-white/8 border text-white text-sm',
        'placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition',
        hasError ? 'border-red-500/60 bg-red-500/5' : 'border-white/12 hover:border-white/20',
    ].join(' ')
}

function Field({ label, required, error, hint, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-300">
                {label}
                {required && <span className="text-indigo-400 ml-0.5">*</span>}
            </label>
            {children}
            {hint && <p className="text-xs text-slate-600">{hint}</p>}
            {error && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle size={11} />
                    {error}
                </p>
            )}
        </div>
    )
}

// ── Type badge ─────────────────────────────────────────────────────────────────
const TYPE_STYLES = {
    EMERGENCY: 'bg-red-500/15 text-red-400 border border-red-500/30',
    ANNOUNCEMENT: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    MAINTENANCE_SHUTDOWN: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
}

function TypeBadge({ type }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TYPE_STYLES[type] ?? 'bg-slate-700 text-slate-300'}`}>
            {type?.replace('_', ' ')}
        </span>
    )
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BroadcastAlertPage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    // ── Form state ─────────────────────────────────────────────────────────────
    const [form, setForm] = useState(DEFAULT_FORM)
    const [errors, setErrors] = useState({})
    const [submitting, setSubmitting] = useState(false)

    // ── Alert list state ───────────────────────────────────────────────────────
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

    // ── Field helpers ──────────────────────────────────────────────────────────
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

    // ── Validation ─────────────────────────────────────────────────────────────
    function validate() {
        const e = {}
        if (!form.title.trim()) e.title = 'Title is required'
        if (!form.message.trim()) e.message = 'Message is required'
        if (form.deliveryChannels.length === 0) e.channels = 'Select at least one delivery channel'
        if (form.scope === 'DEPARTMENT' && !form.scopeDepartmentId.trim())
            e.scopeDepartmentId = 'Department ID is required for Department scope'
        return e
    }

    // ── Submit ─────────────────────────────────────────────────────────────────
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

    // ── Retract ────────────────────────────────────────────────────────────────
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
        <div className="min-h-screen bg-slate-900 flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-64 flex-1 min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-red-600/20 flex items-center justify-center">
                        <Bell size={18} className="text-red-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-semibold text-white">Broadcast Alert</h1>
                        <p className="text-sm text-slate-500 mt-0.5">Send campus-wide notifications and emergency alerts</p>
                    </div>
                </header>

                <div className="px-8 py-8">
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-8 items-start">

                        {/* ── Left: Compose form ──────────────────────────────── */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            <div className="px-6 py-4 border-b border-white/8 bg-white/3">
                                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Send size={14} className="text-indigo-400" />
                                    Compose Alert
                                </h2>
                            </div>

                            <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5" noValidate>

                                {/* Title */}
                                <Field label="Title" required error={errors.title}>
                                    <input
                                        id="alert-title"
                                        type="text"
                                        value={form.title}
                                        onChange={set('title')}
                                        placeholder="Alert headline…"
                                        maxLength={120}
                                        className={inputCls(!!errors.title)}
                                    />
                                </Field>

                                {/* Message */}
                                <Field label="Message" required error={errors.message}>
                                    <textarea
                                        id="alert-message"
                                        rows={4}
                                        value={form.message}
                                        onChange={set('message')}
                                        placeholder="Describe the alert in detail…"
                                        className={`${inputCls(!!errors.message)} resize-none`}
                                    />
                                </Field>

                                {/* Type + Severity */}
                                <div className="grid grid-cols-2 gap-4">
                                    <Field label="Type" required>
                                        <select
                                            id="alert-type"
                                            value={form.type}
                                            onChange={set('type')}
                                            className={`${inputCls()} cursor-pointer`}
                                        >
                                            {ALERT_TYPES.map((t) => (
                                                <option key={t} value={t} className="bg-slate-800">
                                                    {t.replace('_', ' ')}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>

                                    <Field label="Severity" required>
                                        <select
                                            id="alert-severity"
                                            value={form.severity}
                                            onChange={set('severity')}
                                            className={`${inputCls()} cursor-pointer`}
                                        >
                                            {SEVERITIES.map((s) => (
                                                <option key={s} value={s} className="bg-slate-800">
                                                    {s}
                                                </option>
                                            ))}
                                        </select>
                                    </Field>
                                </div>

                                {/* Scope */}
                                <Field label="Scope Target" required>
                                    <div className="flex gap-3" role="radiogroup" aria-label="Scope Target">
                                        {SCOPES.map((s) => (
                                            <label
                                                key={s}
                                                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                                                    form.scope === s
                                                        ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                                                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                                                }`}
                                            >
                                                <input
                                                    type="radio"
                                                    name="alert-scope"
                                                    value={s}
                                                    checked={form.scope === s}
                                                    onChange={() => setForm((prev) => ({ ...prev, scope: s }))}
                                                    className="sr-only"
                                                />
                                                {s}
                                            </label>
                                        ))}
                                    </div>
                                </Field>

                                {/* Conditional scope fields */}
                                {form.scope === 'DEPARTMENT' && (
                                    <Field label="Department ID" required error={errors.scopeDepartmentId}>
                                        <input
                                            id="alert-dept-id"
                                            type="text"
                                            value={form.scopeDepartmentId}
                                            onChange={set('scopeDepartmentId')}
                                            placeholder="e.g. dept_01jv…"
                                            className={inputCls(!!errors.scopeDepartmentId)}
                                        />
                                    </Field>
                                )}

                                {form.scope === 'ROLE' && (
                                    <Field label="Target Role" required>
                                        <select
                                            id="alert-scope-role"
                                            value={form.scopeRole}
                                            onChange={set('scopeRole')}
                                            className={`${inputCls()} cursor-pointer`}
                                        >
                                            {SCOPE_ROLES.map((r) => (
                                                <option key={r} value={r} className="bg-slate-800">
                                                    {r}
                                                </option>
                                            ))}
                                        </select>
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
                                                    className={`flex-1 flex items-center gap-2 py-2.5 px-4 rounded-xl border text-sm font-medium cursor-pointer transition-all ${
                                                        checked
                                                            ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-300'
                                                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                                                    }`}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        id={`channel-${ch}`}
                                                        checked={checked}
                                                        onChange={() => toggleChannel(ch)}
                                                        className="sr-only"
                                                    />
                                                    <span className={`w-4 h-4 rounded flex items-center justify-center border text-xs transition-all ${
                                                        checked ? 'bg-indigo-600 border-indigo-500' : 'border-white/20'
                                                    }`}>
                                                        {checked && <CheckCircle2 size={10} className="text-white" />}
                                                    </span>
                                                    {ch}
                                                </label>
                                            )
                                        })}
                                    </div>
                                </Field>

                                {/* Submit */}
                                <div className="pt-2 border-t border-white/8">
                                    <button
                                        id="broadcast-submit-btn"
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all duration-200 hover:shadow-lg hover:shadow-red-500/20 active:scale-[0.99]"
                                    >
                                        {submitting ? (
                                            <><Loader2 size={16} className="animate-spin" /> Broadcasting…</>
                                        ) : (
                                            <><Bell size={15} /> Broadcast Alert</>
                                        )}
                                    </button>
                                </div>
                            </form>
                        </div>

                        {/* ── Right: Recent alerts ────────────────────────────── */}
                        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                            <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-white/3">
                                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                                    <Bell size={14} className="text-slate-400" />
                                    Recent Alerts
                                </h2>
                                <button
                                    id="refresh-alerts-btn"
                                    onClick={fetchAlerts}
                                    disabled={alertsLoading}
                                    className="p-1.5 rounded-lg hover:bg-white/8 text-slate-500 hover:text-white transition-colors disabled:opacity-40"
                                    title="Refresh"
                                >
                                    <RefreshCw size={13} className={alertsLoading ? 'animate-spin' : ''} />
                                </button>
                            </div>

                            <div>
                                {alertsLoading ? (
                                    <div className="divide-y divide-white/5">
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <div key={i} className="px-5 py-4 space-y-2">
                                                <div className="flex items-center gap-2">
                                                    <Skeleton className="h-5 w-24" />
                                                    <Skeleton className="h-4 w-32 flex-1" />
                                                </div>
                                                <Skeleton className="h-3 w-40" />
                                            </div>
                                        ))}
                                    </div>
                                ) : alerts.length === 0 ? (
                                    <div className="py-12 text-center text-slate-500 text-sm">
                                        No alerts broadcasted yet.
                                    </div>
                                ) : (
                                    <div className="divide-y divide-white/5">
                                        {alerts.map((alert) => (
                                            <div key={alert.id} className="px-5 py-4">
                                                <div className="flex items-start gap-2 mb-1">
                                                    <TypeBadge type={alert.type} />
                                                    <p className="text-sm font-medium text-white leading-snug truncate flex-1">
                                                        {alert.title}
                                                    </p>
                                                    {alert.isRetracted && (
                                                        <span className="shrink-0 text-xs text-slate-500 flex items-center gap-0.5">
                                                            <X size={10} />
                                                            Retracted
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between mt-2">
                                                    <div className="text-xs text-slate-500 space-y-0.5">
                                                        <p>{scopeLabel(alert)}</p>
                                                        <p>{formatDate(alert.createdAt)}</p>
                                                    </div>

                                                    {!alert.isRetracted && (
                                                        <button
                                                            id={`retract-alert-${alert.id}`}
                                                            onClick={() => handleRetract(alert.id)}
                                                            disabled={retractingId === alert.id}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 text-slate-400 hover:text-red-400 text-xs font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                                                        >
                                                            {retractingId === alert.id ? (
                                                                <Loader2 size={11} className="animate-spin" />
                                                            ) : (
                                                                <RotateCcw size={11} />
                                                            )}
                                                            Retract
                                                        </button>
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
