import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    ArrowLeft, MapPin, User, Calendar, Clock, Tag, Building2,
    Image, CheckCircle2, Star, X, Loader2, AlertTriangle,
    ShieldCheck, ClipboardList, ChevronRight,
} from 'lucide-react'
import { getIncident, assignIncident, resolveIncident, submitFeedback } from '../api/incidents'
import { useAuth } from '../context/AuthContext'

// ── Shared badge components ────────────────────────────────────────────────────
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
    CLOSED: 'bg-slate-600/40 text-slate-400 border border-slate-500/30',
    ESCALATED: 'bg-red-500/15 text-red-400 border border-red-500/30',
    REOPENED: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
}

function PriorityBadge({ priority }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${PRIORITY_STYLES[priority] ?? 'bg-slate-700 text-slate-300'}`}>
            {priority}
        </span>
    )
}
function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_STYLES[status] ?? 'bg-slate-700 text-slate-300'}`}>
            {status?.replace('_', ' ')}
        </span>
    )
}

// ── Date formatters ────────────────────────────────────────────────────────────
function formatDateTime(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
    })
}

// ── Detail grid cell ───────────────────────────────────────────────────────────
function DetailCell({ icon: Icon, label, children }) {
    return (
        <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5 uppercase tracking-wide">
                <Icon size={11} />
                {label}
            </span>
            <span className="text-sm text-white">{children}</span>
        </div>
    )
}

// ── Full-page spinner ──────────────────────────────────────────────────────────
function PageSpinner() {
    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
        </div>
    )
}

// ── Star rating component ──────────────────────────────────────────────────────
function StarRating({ value, onChange }) {
    const [hovered, setHovered] = useState(0)
    return (
        <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map(n => (
                <button
                    key={n}
                    type="button"
                    onClick={() => onChange(n)}
                    onMouseEnter={() => setHovered(n)}
                    onMouseLeave={() => setHovered(0)}
                    className="transition-transform hover:scale-110 active:scale-95"
                    aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
                >
                    <Star
                        size={28}
                        className={`transition-colors ${n <= (hovered || value)
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-slate-600'
                            }`}
                    />
                </button>
            ))}
            {value > 0 && (
                <span className="ml-2 text-sm text-slate-400">{value}/5</span>
            )}
        </div>
    )
}

// ── Resolve modal ──────────────────────────────────────────────────────────────
function ResolveModal({ onClose, onSubmit, isLoading }) {
    const [note, setNote] = useState('')
    const [photo, setPhoto] = useState('')
    const [error, setError] = useState('')

    const handleSubmit = (e) => {
        e.preventDefault()
        if (note.trim().length < 10) {
            setError('Resolution note must be at least 10 characters')
            return
        }
        if (!photo.trim()) {
            setError('Resolution photo URL is required')
            return
        }
        setError('')
        onSubmit({ resolutionNote: note.trim(), resolutionPhoto: photo.trim() })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="relative w-full max-w-md bg-slate-900 border border-white/12 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/8">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={18} className="text-green-400" />
                        <h2 className="text-white font-semibold">Resolve Incident</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                    >
                        <X size={15} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-slate-300">
                            Resolution Note <span className="text-indigo-400">*</span>
                        </label>
                        <textarea
                            rows={4}
                            value={note}
                            onChange={e => { setNote(e.target.value); setError('') }}
                            placeholder="Describe how the incident was resolved…"
                            className="w-full px-4 py-2.5 rounded-lg bg-white/8 border border-white/12 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-medium text-slate-300">
                            Resolution Photo URL <span className="text-indigo-400">*</span>
                        </label>
                        <input
                            type="url"
                            value={photo}
                            onChange={e => { setPhoto(e.target.value); setError('') }}
                            placeholder="https://res.cloudinary.com/…"
                            className="w-full px-4 py-2.5 rounded-lg bg-white/8 border border-white/12 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5">
                            <AlertTriangle size={12} /> {error}
                        </p>
                    )}

                    <div className="flex gap-3 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-xl border border-white/12 text-slate-400 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
                        >
                            {isLoading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                            {isLoading ? 'Submitting…' : 'Mark Resolved'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
    return (
        <div className="bg-white/4 border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/8 bg-white/3">
                <Icon size={15} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-white">{title}</h2>
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function IncidentDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user } = useAuth()

    const [incident, setIncident] = useState(null)
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState('')
    const [showResolveModal, setShowResolveModal] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)

    // Feedback state
    const [starScore, setStarScore] = useState(0)
    const [comment, setComment] = useState('')
    const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

    // Fetch / refetch incident
    const fetchIncident = useCallback(async () => {
        setLoading(true)
        setFetchError('')
        try {
            const data = await getIncident(id)
            setIncident(data)
        } catch (err) {
            setFetchError(err?.response?.data?.error?.message ?? err?.message ?? 'Failed to load incident')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => { fetchIncident() }, [fetchIncident])

    // ── Action handlers ────────────────────────────────────────────────────────
    const handleAssign = async () => {
        setActionLoading(true)
        try {
            await assignIncident(id)
            toast.success('Staff assigned successfully')
            await fetchIncident()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to assign incident')
        } finally {
            setActionLoading(false)
        }
    }

    const handleResolve = async (payload) => {
        setActionLoading(true)
        try {
            await resolveIncident(id, payload)
            toast.success('Incident marked as resolved')
            setShowResolveModal(false)
            await fetchIncident()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to resolve incident')
        } finally {
            setActionLoading(false)
        }
    }

    const handleFeedback = async () => {
        if (starScore === 0) { toast.error('Please select a star rating'); return }
        setActionLoading(true)
        try {
            await submitFeedback(id, { score: starScore, comment: comment.trim() || undefined })
            toast.success('Thank you for your feedback!')
            setFeedbackSubmitted(true)
            await fetchIncident()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to submit feedback')
        } finally {
            setActionLoading(false)
        }
    }

    // ── Loading / error states ─────────────────────────────────────────────────
    if (loading) return <PageSpinner />

    if (fetchError) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 text-center p-8">
                <AlertTriangle size={40} className="text-red-400" />
                <p className="text-white font-semibold text-lg">Couldn't load incident</p>
                <p className="text-slate-400 text-sm max-w-sm">{fetchError}</p>
                <button onClick={() => navigate(-1)} className="mt-2 text-indigo-400 hover:text-indigo-300 text-sm flex items-center gap-1">
                    <ArrowLeft size={14} /> Go back
                </button>
            </div>
        )
    }

    if (!incident) return null

    // ── Role-based action visibility ───────────────────────────────────────────
    const role = user?.role
    const userId = user?.id
    const status = incident.status

    const canAssign = role === 'ADMIN' && (status === 'OPEN' || status === 'ESCALATED')
    const canResolve = (role === 'MAINTENANCE' || role === 'SECURITY')
        && status === 'IN_PROGRESS'
        && incident.assignedToId === userId
    const canFeedback = (role === 'STUDENT' || role === 'FACULTY')
        && status === 'RESOLVED'
        && incident.creatorId === userId
        && !feedbackSubmitted

    const isSLABreached = incident.sla?.deadlineAt && new Date(incident.sla.deadlineAt) < new Date()
    const hasResolution = status === 'RESOLVED' || status === 'REOPENED' || status === 'CLOSED'
    const photos = incident.evidencePhotos ?? []
    const statusLog = incident.statusLogEntries ?? []

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <>
            <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
                <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">

                    {/* ── Page header ─────────────────────────────────────────── */}
                    <div>
                        <button
                            onClick={() => navigate(-1)}
                            className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium mb-5 transition-colors group"
                        >
                            <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                            Back
                        </button>

                        <div className="bg-white/4 border border-white/10 rounded-2xl px-7 py-6">
                            {/* Incident number */}
                            <p className="text-xs font-mono text-indigo-400 mb-2 tracking-wide">
                                {incident.incidentNumber ?? `#${incident.id?.slice(0, 8)}`}
                            </p>

                            {/* Title + badges */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <h1 className="text-xl font-bold text-white leading-snug">
                                    {incident.title}
                                </h1>
                                <div className="flex items-center gap-2 shrink-0">
                                    <PriorityBadge priority={incident.priority} />
                                    <StatusBadge status={incident.status} />
                                </div>
                            </div>

                            {/* Created date */}
                            <p className="text-xs text-slate-500 mt-3 flex items-center gap-1.5">
                                <Calendar size={11} />
                                {formatDateTime(incident.createdAt)}
                            </p>
                        </div>
                    </div>

                    {/* ── Details grid ────────────────────────────────────────── */}
                    <Section title="Incident Details" icon={ClipboardList}>
                        {/* Description */}
                        <p className="text-sm text-slate-300 leading-relaxed mb-6">
                            {incident.description}
                        </p>

                        <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
                            <DetailCell icon={Tag} label="Category">
                                {incident.category ?? '—'}
                            </DetailCell>

                            <DetailCell icon={Building2} label="Department">
                                {incident.departmentId ?? '—'}
                            </DetailCell>

                            <DetailCell icon={MapPin} label="Location">
                                {incident.location?.block
                                    ? `Block ${incident.location.block}${incident.location.room ? ` · ${incident.location.room}` : ''}`
                                    : '—'}
                            </DetailCell>

                            <DetailCell icon={User} label="Reporter">
                                {incident.creator?.name ?? incident.creatorId ?? '—'}
                            </DetailCell>

                            <DetailCell icon={User} label="Assigned To">
                                {incident.assignedTo?.name ?? (incident.assignedToId ? incident.assignedToId : 'Unassigned')}
                            </DetailCell>

                            <DetailCell icon={Clock} label="SLA Deadline">
                                <span className={isSLABreached ? 'text-red-400 font-semibold' : ''}>
                                    {incident.sla?.deadlineAt ? formatDateTime(incident.sla.deadlineAt) : '—'}
                                    {isSLABreached && ' ⚠ Breached'}
                                </span>
                            </DetailCell>

                            <DetailCell icon={Calendar} label="Created At">
                                {formatDateTime(incident.createdAt)}
                            </DetailCell>

                            <DetailCell icon={CheckCircle2} label="Resolved At">
                                {incident.resolvedAt ? formatDateTime(incident.resolvedAt) : '—'}
                            </DetailCell>
                        </div>
                    </Section>

                    {/* ── Evidence photos ──────────────────────────────────────── */}
                    {photos.length > 0 && (
                        <Section title="Evidence Photos" icon={Image}>
                            <div className="grid grid-cols-3 gap-3">
                                {photos.map((url, i) => (
                                    <a
                                        key={i}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group block aspect-video rounded-xl overflow-hidden border border-white/10 hover:border-indigo-500/50 transition-colors bg-slate-800"
                                    >
                                        <img
                                            src={url}
                                            alt={`Evidence ${i + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e) => {
                                                e.target.parentElement.classList.add('flex', 'items-center', 'justify-center')
                                                e.target.replaceWith(
                                                    Object.assign(document.createElement('span'), {
                                                        textContent: '🖼',
                                                        className: 'text-2xl',
                                                    })
                                                )
                                            }}
                                        />
                                    </a>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* ── Resolution section ───────────────────────────────────── */}
                    {hasResolution && incident.resolutionNote && (
                        <Section title="Resolution" icon={CheckCircle2}>
                            <p className="text-sm text-slate-300 leading-relaxed">
                                {incident.resolutionNote}
                            </p>
                            {incident.resolutionPhoto && (
                                <a
                                    href={incident.resolutionPhoto}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-4 block w-48 aspect-video rounded-xl overflow-hidden border border-white/10 hover:border-indigo-500/50 transition-colors"
                                >
                                    <img
                                        src={incident.resolutionPhoto}
                                        alt="Resolution photo"
                                        className="w-full h-full object-cover"
                                    />
                                </a>
                            )}
                        </Section>
                    )}

                    {/* ── Status history ───────────────────────────────────────── */}
                    {statusLog.length > 0 && (
                        <Section title="Status History" icon={ChevronRight}>
                            <ol className="relative border-l border-white/10 ml-2 space-y-6">
                                {statusLog.map((entry, i) => (
                                    <li key={entry.id ?? i} className="ml-5">
                                        <span className="absolute -left-1.5 w-3 h-3 rounded-full bg-indigo-600 border-2 border-slate-900" />
                                        <div className="flex flex-col gap-0.5">
                                            <StatusBadge status={entry.status} />
                                            {entry.note && (
                                                <p className="text-xs text-slate-400 mt-1">{entry.note}</p>
                                            )}
                                            <time className="text-xs text-slate-600">
                                                {formatDateTime(entry.createdAt)}
                                            </time>
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        </Section>
                    )}

                    {/* ── Action buttons ───────────────────────────────────────── */}
                    {(canAssign || canResolve || canFeedback) && (
                        <div className="bg-white/4 border border-white/10 rounded-2xl px-7 py-6 space-y-5">
                            <h2 className="text-sm font-semibold text-white">Actions</h2>

                            {/* ADMIN: Assign */}
                            {canAssign && (
                                <button
                                    onClick={handleAssign}
                                    disabled={actionLoading}
                                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.99]"
                                >
                                    {actionLoading
                                        ? <><Loader2 size={16} className="animate-spin" /> Assigning…</>
                                        : <><ShieldCheck size={16} /> Assign Staff</>
                                    }
                                </button>
                            )}

                            {/* MAINTENANCE/SECURITY: Resolve */}
                            {canResolve && (
                                <button
                                    onClick={() => setShowResolveModal(true)}
                                    className="w-full py-3 rounded-xl bg-green-600 hover:bg-green-500 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:shadow-lg hover:shadow-green-500/20 active:scale-[0.99]"
                                >
                                    <CheckCircle2 size={16} /> Resolve Incident
                                </button>
                            )}

                            {/* STUDENT/FACULTY: Feedback */}
                            {canFeedback && (
                                <div className="space-y-4">
                                    <p className="text-sm text-slate-300">
                                        How satisfied are you with the resolution?
                                    </p>
                                    <StarRating value={starScore} onChange={setStarScore} />
                                    <textarea
                                        rows={3}
                                        value={comment}
                                        onChange={e => setComment(e.target.value)}
                                        placeholder="Optional comment…"
                                        className="w-full px-4 py-2.5 rounded-lg bg-white/8 border border-white/12 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
                                    />
                                    <button
                                        onClick={handleFeedback}
                                        disabled={actionLoading || starScore === 0}
                                        className="w-full py-3 rounded-xl bg-yellow-500 hover:bg-yellow-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                                    >
                                        {actionLoading
                                            ? <><Loader2 size={16} className="animate-spin" /> Submitting…</>
                                            : <><Star size={15} className="fill-slate-900" /> Submit Feedback</>
                                        }
                                    </button>
                                </div>
                            )}

                            {/* Feedback already submitted */}
                            {feedbackSubmitted && (
                                <div className="flex items-center gap-2 text-green-400 text-sm">
                                    <CheckCircle2 size={16} />
                                    Feedback submitted — thank you!
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Resolve modal ──────────────────────────────────────────────── */}
            {showResolveModal && (
                <ResolveModal
                    onClose={() => setShowResolveModal(false)}
                    onSubmit={handleResolve}
                    isLoading={actionLoading}
                />
            )}
        </>
    )
}