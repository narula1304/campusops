import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    ArrowLeft, MapPin, User, Calendar, Clock, Tag, Building2,
    Image, CheckCircle2, Star, X, Loader2, AlertTriangle,
    ShieldCheck, ClipboardList, ChevronRight, MessageSquare,
    ChevronsLeftRight,
} from 'lucide-react'
import { getIncident, assignIncident, resolveIncident, submitFeedback } from '../api/incidents'
import { useAuth } from '../context/AuthContext'
import SLACountdown from '../components/SLACountdown'
import Sidebar from '../components/Sidebar'
import { Card, CardContent } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

// ── Shared badge components ────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
    const variantMap = {
        CRITICAL: 'danger',
        HIGH: 'warning',
        MEDIUM: 'warning',
        LOW: 'success',
    }
    return <Badge variant={variantMap[priority] || 'neutral'} className="px-2.5 py-1 uppercase tracking-wider">{priority}</Badge>
}

function StatusBadge({ status }) {
    const variantMap = {
        OPEN: 'info',
        IN_PROGRESS: 'primary',
        RESOLVED: 'success',
        CLOSED: 'neutral',
        ESCALATED: 'danger',
        REOPENED: 'warning',
    }
    return <Badge variant={variantMap[status] || 'neutral'} className="px-2.5 py-1 uppercase tracking-wider">{status?.replace('_', ' ')}</Badge>
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
        <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-text-muted flex items-center gap-1.5 uppercase tracking-widest">
                <Icon size={12} />
                {label}
            </span>
            <span className="text-sm font-medium text-text-primary">{children}</span>
        </div>
    )
}

// ── Full-page spinner ──────────────────────────────────────────────────────────
function PageSpinner() {
    return (
        <div className="min-h-screen bg-bg-base flex items-center justify-center">
            <Loader2 size={36} className="animate-spin text-primary-500" />
        </div>
    )
}

// ── Star rating component ──────────────────────────────────────────────────────
function StarRating({ value, onChange }) {
    const [hovered, setHovered] = useState(0)
    return (
        <div className="flex items-center gap-1.5">
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
                        size={32}
                        className={`transition-colors duration-200 ${n <= (hovered || value)
                            ? 'text-warning-500 fill-warning-500 drop-shadow-sm'
                            : 'text-border-strong hover:text-warning-500/50'
                            }`}
                    />
                </button>
            ))}
            {value > 0 && (
                <span className="ml-3 text-sm font-bold text-text-secondary">{value} / 5</span>
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
            <div className="absolute inset-0 bg-bg-base/80 backdrop-blur-md" onClick={onClose} />
            <div className="relative w-full max-w-md bg-surface border border-border-strong rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between px-6 py-5 border-b border-border-subtle bg-surface-hover/50">
                    <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={20} className="text-success-500" />
                        <h2 className="text-text-primary font-bold">Resolve Incident</h2>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8">
                        <X size={16} />
                    </Button>
                </div>

                <form onSubmit={handleSubmit} className="px-6 py-6 space-y-5">
                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-text-secondary">
                            Resolution Note <span className="text-danger-500">*</span>
                        </label>
                        <textarea
                            rows={4}
                            value={note}
                            onChange={e => { setNote(e.target.value); setError('') }}
                            placeholder="Describe how the incident was resolved…"
                            className="w-full bg-surface border border-border-strong text-text-primary text-sm rounded-xl px-4 py-3 placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/50 hover:border-text-muted transition-all resize-none shadow-sm"
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <label className="text-sm font-bold text-text-secondary">
                            Resolution Photo URL <span className="text-danger-500">*</span>
                        </label>
                        <Input
                            type="url"
                            value={photo}
                            onChange={e => { setPhoto(e.target.value); setError('') }}
                            placeholder="https://res.cloudinary.com/…"
                        />
                    </div>

                    {error && (
                        <p className="text-xs font-medium text-danger-500 flex items-center gap-1.5 p-3 rounded-lg bg-danger-500-alpha border border-danger-500/20">
                            <AlertTriangle size={14} /> {error}
                        </p>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            className="flex-1"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            variant="success"
                            isLoading={isLoading}
                            className="flex-1 bg-success-600 hover:bg-success-500 text-white shadow-sm shadow-success-500/20 border-transparent"
                            icon={CheckCircle2}
                        >
                            {isLoading ? 'Submitting…' : 'Mark Resolved'}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }) {
    return (
        <Card className="overflow-hidden border-border-subtle">
            <div className="flex items-center gap-3 px-6 py-4 border-b border-border-subtle bg-surface-hover/50">
                <Icon size={18} className="text-text-muted" />
                <h2 className="text-base font-bold text-text-primary">{title}</h2>
            </div>
            <div className="px-6 py-6">{children}</div>
        </Card>
    )
}

// ── BeforeAfterSlider ────────────────────────────────────────────────────────
function BeforeAfterSlider({ beforeUrl, afterUrl }) {
    const [sliderPos, setSliderPos] = useState(50) // percentage 0-100
    const containerRef = useRef(null)
    const isDragging = useRef(false)

    const handleMove = (clientX) => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const pos = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100))
        setSliderPos(pos)
    }

    const onMouseDown = () => { isDragging.current = true }
    const onMouseMove = (e) => { if (isDragging.current) handleMove(e.clientX) }
    const onMouseUp = () => { isDragging.current = false }
    const onTouchMove = (e) => { handleMove(e.touches[0].clientX) }

    return (
        <div
            ref={containerRef}
            className="relative w-full aspect-video rounded-xl overflow-hidden border border-border-strong cursor-col-resize select-none shadow-sm"
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchMove={onTouchMove}
        >
            <img src={afterUrl} alt="After" className="absolute inset-0 w-full h-full object-cover" />
            <div
                className="absolute inset-0 overflow-hidden"
                style={{ width: `${sliderPos}%` }}
            >
                <img src={beforeUrl} alt="Before" className="absolute inset-0 w-full h-full object-cover"
                    style={{ width: containerRef.current?.offsetWidth + 'px' }} />
            </div>
            <div
                className="absolute top-0 bottom-0 w-0.5 bg-white shadow-xl cursor-col-resize z-10"
                style={{ left: `${sliderPos}%` }}
                onMouseDown={onMouseDown}
                onTouchStart={onMouseDown}
            >
                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg border border-slate-200 flex items-center justify-center transition-transform hover:scale-110">
                    <ChevronsLeftRight size={16} className="text-slate-700" />
                </div>
            </div>
            <span className="absolute top-3 left-3 text-xs font-bold text-white bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md z-10 shadow-sm">BEFORE</span>
            <span className="absolute top-3 right-3 text-xs font-bold text-white bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md z-10 shadow-sm">AFTER</span>
        </div>
    )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function IncidentDetailPage() {
    const { id } = useParams()
    const navigate = useNavigate()
    const { user, logout } = useAuth()
    const handleLogout = () => { logout(); navigate('/login') }

    const [incident, setIncident] = useState(null)
    const [loading, setLoading] = useState(true)
    const [fetchError, setFetchError] = useState('')
    const [showResolveModal, setShowResolveModal] = useState(false)
    const [actionLoading, setActionLoading] = useState(false)

    // Feedback state
    const [starScore, setStarScore] = useState(0)
    const [comment, setComment] = useState('')
    const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)

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

    // Import Sidebar dynamically at top
    if (loading) {
        return (
            <div className="min-h-screen flex" style={{ background: 'transparent' }}>
                <div className="ml-[17rem] flex-1 flex items-center justify-center">
                    <Loader2 size={36} className="animate-spin" style={{ color: 'var(--color-primary-400)' }} />
                </div>
            </div>
        )
    }

    if (fetchError) {
        return (
            <div className="min-h-screen flex" style={{ background: 'transparent' }}>
                <div className="ml-[17rem] flex-1 flex flex-col items-center justify-center gap-5 text-center p-8">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                        <AlertTriangle size={32} style={{ color: 'var(--color-danger-400)' }} />
                    </div>
                    <div>
                        <p className="text-lg font-bold text-white">Couldn't load incident</p>
                        <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{fetchError}</p>
                    </div>
                    <Button variant="outline" onClick={() => navigate(-1)} icon={ArrowLeft}>Go back</Button>
                </div>
            </div>
        )
    }

    if (!incident) return null

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

    return (
        <>
            <div className="min-h-screen flex" style={{ background: 'transparent' }}>
                <Sidebar user={user} onLogout={handleLogout} />

                <main className="ml-[17rem] flex-1 min-h-screen flex flex-col">
                {/* ── Sticky page header ── */}
                <header
                    className="sticky top-0 z-30 px-8 py-4 flex items-center gap-4"
                    style={{ background: 'rgba(3,7,18,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors group"
                        style={{ color: 'var(--color-text-muted)' }}
                        onMouseEnter={e => e.currentTarget.style.color = 'var(--color-text-primary)'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-muted)'}
                    >
                        <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform" />
                        Back
                    </button>
                    <div className="h-4 w-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
                    <span className="font-mono text-xs font-bold" style={{ color: 'var(--color-primary-400)' }}>
                        {incident.incidentNumber ?? `#${incident.id?.slice(0, 8)}`}
                    </span>
                    <div className="flex-1" />
                    <PriorityBadge priority={incident.priority} />
                    <StatusBadge status={incident.status} />
                </header>

                <div className="px-8 py-8 space-y-8 max-w-5xl">
                    {/* ── Title card ── */}
                    <div
                        className="rounded-2xl p-7"
                        style={{
                            background: 'var(--surface-2)',
                            border: '1px solid rgba(255,255,255,0.05)',
                            boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
                        }}
                    >
                        <h1 className="text-2xl font-bold text-white leading-snug mb-4">{incident.title}</h1>
                        <div className="flex items-center gap-2 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <Calendar size={13} style={{ color: 'var(--color-text-muted)' }} />
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                Reported on {formatDateTime(incident.createdAt)}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* ── Left column ── */}
                        <div className="lg:col-span-2 space-y-8">
                            <Section title="Incident Details" icon={ClipboardList}>
                                <p className="text-base text-text-primary leading-relaxed mb-8 whitespace-pre-wrap">
                                    {incident.description}
                                </p>

                                <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-2">
                                    <DetailCell icon={Tag} label="Category">
                                        {incident.category ?? '—'}
                                    </DetailCell>

                                    <DetailCell icon={Building2} label="Department">
                                        {incident.departmentId ?? '—'}
                                    </DetailCell>

                                    <DetailCell icon={MapPin} label="Location">
                                        {incident.location?.block
                                            ? `Block ${incident.location.block}${incident.location.room ? ` · Room ${incident.location.room}` : ''}`
                                            : '—'}
                                    </DetailCell>

                                    <DetailCell icon={Clock} label="SLA Deadline">
                                        <div className="flex flex-col gap-1.5 mt-0.5">
                                            <span className={isSLABreached ? 'text-danger-500 font-medium text-sm flex items-center gap-1.5' : 'text-text-primary font-medium text-sm flex items-center gap-1.5'}>
                                                {incident.sla?.deadlineAt
                                                    ? formatDateTime(incident.sla.deadlineAt)
                                                    : '—'}
                                                {isSLABreached && <AlertTriangle size={14} />}
                                            </span>
                                            <SLACountdown deadline={incident.sla?.deadlineAt ?? incident.slaDeadlineAt ?? null} />
                                        </div>
                                    </DetailCell>
                                </div>
                            </Section>

                            {/* ── Evidence photos ──────────────────────────────────────── */}
                            {photos.length > 0 && (
                                <Section title="Evidence Photos" icon={Image}>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                        {photos.map((url, i) => (
                                            <a
                                                key={i}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="group block aspect-square sm:aspect-video rounded-xl overflow-hidden border border-border-strong hover:border-primary-500 transition-all bg-surface-hover shadow-sm"
                                            >
                                                <img
                                                    src={url}
                                                    alt={`Evidence ${i + 1}`}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    onError={(e) => {
                                                        e.target.parentElement.classList.add('flex', 'items-center', 'justify-center')
                                                        e.target.replaceWith(
                                                            Object.assign(document.createElement('span'), {
                                                                textContent: '🖼',
                                                                className: 'text-3xl opacity-50',
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
                                <Section title="Resolution Report" icon={CheckCircle2}>
                                    <p className="text-base text-text-primary leading-relaxed whitespace-pre-wrap">
                                        {incident.resolutionNote}
                                    </p>
                                    
                                    <div className="mt-8 pt-6 border-t border-border-subtle">
                                        <p className="text-xs font-bold text-text-muted mb-4 uppercase tracking-widest">
                                            {photos.length > 0 && incident.resolutionPhoto ? 'Before & After Comparison' : 'Resolution Evidence'}
                                        </p>
                                        
                                        {photos.length > 0 && incident.resolutionPhoto ? (
                                            <BeforeAfterSlider
                                                beforeUrl={photos[0]}
                                                afterUrl={incident.resolutionPhoto}
                                            />
                                        ) : incident.resolutionPhoto ? (
                                            <a
                                                href={incident.resolutionPhoto}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block w-full max-w-sm aspect-video rounded-xl overflow-hidden border border-border-strong hover:border-primary-500 transition-all shadow-sm group"
                                            >
                                                <img
                                                    src={incident.resolutionPhoto}
                                                    alt="Resolution photo"
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                />
                                            </a>
                                        ) : (
                                            <p className="text-sm text-text-muted italic">No photo provided.</p>
                                        )}
                                    </div>
                                </Section>
                            )}
                        </div>

                        {/* ── Right column (People & History) ──────────────────────────────────────── */}
                        <div className="space-y-8">
                            {/* People */}
                            <Card>
                                <CardContent className="p-6 space-y-6">
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                                            <User size={14} /> Reporter
                                        </h3>
                                        <div className="flex items-center gap-3 bg-surface-hover p-3 rounded-xl border border-border-subtle">
                                            <div className="w-10 h-10 rounded-full bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shrink-0">
                                                <User size={16} className="text-primary-400" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-bold text-text-primary truncate">{incident.creator?.name ?? incident.creatorId ?? '—'}</p>
                                                {incident.creator?.email && <p className="text-xs text-text-muted truncate mt-0.5">{incident.creator.email}</p>}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="space-y-4 pt-6 border-t border-border-subtle">
                                        <h3 className="text-xs font-bold text-text-muted uppercase tracking-widest flex items-center gap-2">
                                            <ShieldCheck size={14} /> Assignee
                                        </h3>
                                        {incident.assignedToId ? (
                                            <div className="flex items-center gap-3 bg-surface-hover p-3 rounded-xl border border-border-subtle">
                                                <div className="w-10 h-10 rounded-full bg-warning-500-alpha border border-warning-500/30 flex items-center justify-center shrink-0">
                                                    <User size={16} className="text-warning-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-sm font-bold text-text-primary truncate">{incident.assignedTo?.name ?? incident.assignedToId}</p>
                                                    {incident.assignedTo?.email && <p className="text-xs text-text-muted truncate mt-0.5">{incident.assignedTo.email}</p>}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="bg-surface-hover border border-border-subtle border-dashed p-4 rounded-xl text-center">
                                                <p className="text-sm font-medium text-text-secondary">Unassigned</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Actions */}
                            <Card className="border-primary-500/30 shadow-primary-500/5">
                                <CardContent className="p-6 space-y-5 bg-gradient-to-br from-surface to-primary-500/5 rounded-2xl">
                                    <h2 className="text-sm font-bold text-text-primary mb-4 flex items-center gap-2">
                                        <AlertTriangle size={16} className="text-primary-400" /> Actions
                                    </h2>

                                    {/* ADMIN: Assign */}
                                    {canAssign && (
                                        <Button
                                            onClick={handleAssign}
                                            isLoading={actionLoading}
                                            variant="primary"
                                            className="w-full justify-center"
                                            icon={ShieldCheck}
                                        >
                                            {actionLoading ? 'Assigning…' : 'Assign Staff'}
                                        </Button>
                                    )}

                                    {/* MAINTENANCE/SECURITY: Resolve */}
                                    {canResolve && (
                                        <Button
                                            onClick={() => setShowResolveModal(true)}
                                            className="w-full justify-center bg-success-600 hover:bg-success-500 text-white shadow-success-500/20 border-transparent"
                                            icon={CheckCircle2}
                                        >
                                            Resolve Incident
                                        </Button>
                                    )}

                                    {/* STUDENT/FACULTY: Feedback */}
                                    {canFeedback && (
                                        <div className="space-y-4 p-4 rounded-xl bg-surface-hover border border-border-strong">
                                            <p className="text-sm font-bold text-text-primary">
                                                Rate the resolution
                                            </p>
                                            <StarRating value={starScore} onChange={setStarScore} />
                                            <textarea
                                                rows={3}
                                                value={comment}
                                                onChange={e => setComment(e.target.value)}
                                                placeholder="Leave a comment (optional)…"
                                                className="w-full bg-surface border border-border-strong text-text-primary text-sm rounded-xl px-4 py-2.5 placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/50 hover:border-text-muted transition-all resize-none shadow-sm"
                                            />
                                            <Button
                                                onClick={handleFeedback}
                                                disabled={actionLoading || starScore === 0}
                                                isLoading={actionLoading}
                                                className="w-full justify-center bg-warning-500 hover:bg-warning-400 text-slate-900 border-transparent shadow-warning-500/20 font-bold"
                                                icon={Star}
                                            >
                                                Submit Feedback
                                            </Button>
                                        </div>
                                    )}

                                    {/* Feedback already submitted */}
                                    {feedbackSubmitted && (
                                        <div className="flex items-center gap-2 text-sm font-medium p-3 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--color-success-400)' }}>
                                            <CheckCircle2 size={16} />
                                            Feedback submitted — thank you!
                                        </div>
                                    )}

                                    {/* Chat — always visible */}
                                    <Button
                                        id="open-incident-chat-btn"
                                        variant="outline"
                                        onClick={() => navigate(`/incidents/${id}/chat`)}
                                        className="w-full justify-center"
                                        icon={MessageSquare}
                                    >
                                        Open Incident Chat
                                    </Button>
                                </CardContent>
                            </Card>

                            {/* ── Status history ── */}
                            {statusLog.length > 0 && (
                                <Section title="Status History" icon={Clock}>
                                    <ol className="relative ml-2.5 space-y-5" style={{ borderLeft: '1px solid rgba(255,255,255,0.07)' }}>
                                        {statusLog.map((entry, i) => (
                                            <li key={entry.id ?? i} className="ml-6 relative">
                                                <span
                                                    className="absolute -left-[1.625rem] top-0.5 w-3 h-3 rounded-full flex-shrink-0"
                                                    style={{
                                                        background: i === 0 ? 'var(--color-primary-500)' : 'var(--surface-4)',
                                                        border: `2px solid ${i === 0 ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                                        boxShadow: i === 0 ? '0 0 8px rgba(99,102,241,0.5)' : 'none',
                                                    }}
                                                />
                                                <div className="flex flex-col gap-1.5">
                                                    <StatusBadge status={entry.status} />
                                                    {entry.note && (
                                                        <p className="text-xs font-medium p-2.5 rounded-lg mt-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', color: 'var(--color-text-secondary)' }}>
                                                            {entry.note}
                                                        </p>
                                                    )}
                                                    <time className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                                        {formatDateTime(entry.createdAt)}
                                                    </time>
                                                </div>
                                            </li>
                                        ))}
                                    </ol>
                                </Section>
                            )}
                        </div>
                    </div>
                </div>
                </main>
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