import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    ArrowLeft, Plus, X, AlertTriangle, ImageIcon, Loader2, Sparkles,
    ChevronDown, Wrench, Shield, Building2, Leaf, Zap, HelpCircle, MapPin,
} from 'lucide-react'
import { createIncident, aiClassifyIncident } from '../api/incidents'
import { uploadToCloudinary } from '../utils/uploadToCloudinary'
import { getDepartments } from '../api/departments'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORY_META = {
    MAINTENANCE:     { label: 'Maintenance',     icon: Wrench,    color: '#fbbf24', bg: 'rgba(245,158,11,0.12)',   border: 'rgba(245,158,11,0.3)',  priority: 'MEDIUM'   },
    SECURITY:        { label: 'Security',        icon: Shield,    color: '#f87171', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.3)',   priority: 'HIGH'     },
    INFRASTRUCTURE:  { label: 'Infrastructure',  icon: Building2, color: '#818cf8', bg: 'rgba(99,102,241,0.12)',   border: 'rgba(99,102,241,0.3)',  priority: 'HIGH'     },
    CLEANLINESS:     { label: 'Cleanliness',     icon: Leaf,      color: '#34d399', bg: 'rgba(16,185,129,0.12)',   border: 'rgba(16,185,129,0.3)',  priority: 'LOW'      },
    EMERGENCY:       { label: 'Emergency',       icon: Zap,       color: '#f87171', bg: 'rgba(239,68,68,0.15)',    border: 'rgba(239,68,68,0.4)',   priority: 'CRITICAL' },
    OTHER:           { label: 'Other',           icon: HelpCircle,color: '#94a3b8', bg: 'rgba(100,116,139,0.1)',   border: 'rgba(100,116,139,0.25)',priority: 'MEDIUM'   },
}

const PRIORITY_STYLE = {
    CRITICAL: { text: '#f87171', bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)'   },
    HIGH:     { text: '#fbbf24', bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)'  },
    MEDIUM:   { text: '#818cf8', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.3)'  },
    LOW:      { text: '#34d399', bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)'  },
}

export default function CreateIncidentPage() {
    const navigate = useNavigate()
    const { user, logout } = useAuth()

    const [form, setForm] = useState({
        title: '', description: '', category: 'MAINTENANCE',
        locationBlock: '', locationRoom: '', departmentId: '',
    })
    const [errors, setErrors]       = useState({})
    const [isSubmitting, setIsSubmitting] = useState(false)

    const [departments,   setDepartments]   = useState([])
    const [fetchingDepts, setFetchingDepts] = useState(true)

    useEffect(() => {
        getDepartments()
            .then(data => {
                setDepartments(data || [])
                if (data?.length > 0 && !form.departmentId)
                    setForm(p => ({ ...p, departmentId: data[0].id }))
            })
            .catch(() => toast.error('Failed to load departments'))
            .finally(() => setFetchingDepts(false))
    }, [])

    const [aiSuggestion, setAiSuggestion] = useState(null)
    const [aiLoading,    setAiLoading]    = useState(false)
    const aiDebounceRef = useRef(null)

    useEffect(() => {
        clearTimeout(aiDebounceRef.current)
        const text = `${form.title} ${form.description}`.trim()
        if (text.length < 20) { setAiSuggestion(null); return }
        aiDebounceRef.current = setTimeout(async () => {
            setAiLoading(true)
            try {
                const result = await aiClassifyIncident(form.title, form.description)
                if (result?.category && result.confidence > 0.5) setAiSuggestion(result)
                else setAiSuggestion(null)
            } catch { setAiSuggestion(null) }
            finally  { setAiLoading(false) }
        }, 800)
        return () => clearTimeout(aiDebounceRef.current)
    }, [form.title, form.description])

    const [photoUrls,       setPhotoUrls]       = useState([])
    const [uploadProgress,  setUploadProgress]  = useState({})
    const [uploading,       setUploading]        = useState(false)

    const meta     = CATEGORY_META[form.category]
    const priority = meta?.priority ?? 'MEDIUM'
    const pStyle   = PRIORITY_STYLE[priority]

    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    }

    function validate() {
        const e = {}
        if (!form.title.trim()) e.title = 'Title is required'
        if (form.title.length > 100) e.title = 'Max 100 characters'
        if (!form.description.trim()) e.description = 'Description is required'
        if (form.description.trim().length < 10) e.description = 'At least 10 characters'
        if (!form.locationBlock.trim()) e.locationBlock = 'Block is required'
        if (!form.departmentId.trim()) e.departmentId = 'Department is required'
        return e
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const ve = validate()
        if (Object.keys(ve).length > 0) { setErrors(ve); return }
        setIsSubmitting(true); setErrors({})
        try {
            await createIncident({
                title: form.title.trim(), description: form.description.trim(),
                category: form.category, priority,
                location: { block: form.locationBlock.trim(), room: form.locationRoom.trim() || undefined },
                departmentId: form.departmentId.trim(),
                evidencePhotos: photoUrls,
            })
            toast.success('Incident reported successfully!')
            navigate('/dashboard')
        } catch (err) {
            const apiError = err?.response?.data?.error
            if (apiError?.field) setErrors({ [apiError.field]: apiError.message })
            toast.error(apiError?.message ?? err?.message ?? 'Failed to submit')
        } finally { setIsSubmitting(false) }
    }

    const handleLogout = () => { logout(); navigate('/login') }

    const inputStyle = (hasError) => ({
        background: hasError ? 'rgba(239,68,68,0.05)' : 'rgba(255,255,255,0.025)',
        border: `1px solid ${hasError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: '0.875rem',
        color: 'var(--color-text-primary)',
        fontSize: '0.875rem',
        width: '100%',
        padding: '0.65rem 1rem',
        outline: 'none',
        transition: 'all 150ms',
    })

    return (
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen flex flex-col">
                {/* ── Sticky Header ── */}
                <header
                    className="sticky top-0 z-30 px-8 py-4 flex items-center gap-4"
                    style={{ background: 'rgba(3,7,18,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                >
                    <button
                        type="button"
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
                    <h1 className="text-base font-semibold text-white">Report an Incident</h1>
                </header>

                {/* ── Main form area ── */}
                <div className="px-8 py-8 max-w-2xl">
                    <form onSubmit={handleSubmit} noValidate className="space-y-7">

                        {/* ── Category picker ── */}
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.1em] mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                Category <span style={{ color: 'var(--color-danger-400)' }}>*</span>
                            </p>
                            <div className="grid grid-cols-3 gap-2.5">
                                {Object.entries(CATEGORY_META).map(([key, m]) => {
                                    const isActive = form.category === key
                                    const Icon = m.icon
                                    return (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => setForm(p => ({ ...p, category: key }))}
                                            className="relative flex flex-col items-center gap-2 py-3.5 px-2 rounded-xl transition-all duration-200 group"
                                            style={{
                                                background: isActive ? m.bg : 'rgba(255,255,255,0.025)',
                                                border: `1px solid ${isActive ? m.border : 'rgba(255,255,255,0.06)'}`,
                                                boxShadow: isActive ? `0 4px 16px -4px ${m.color}40` : 'none',
                                                transform: isActive ? 'scale(1.02)' : 'scale(1)',
                                            }}
                                        >
                                            <Icon size={18} style={{ color: isActive ? m.color : 'var(--color-text-muted)' }} />
                                            <span className="text-[11px] font-bold" style={{ color: isActive ? m.color : 'var(--color-text-secondary)' }}>
                                                {m.label}
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>

                            {/* Priority indicator */}
                            <div className="mt-3 flex items-center gap-2">
                                <span className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>Auto priority:</span>
                                <span
                                    className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                                    style={{ background: pStyle.bg, borderColor: pStyle.border, color: pStyle.text }}
                                >
                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                    {priority}
                                </span>
                            </div>
                        </div>

                        {/* ── Title ── */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                Title <span style={{ color: 'var(--color-danger-400)' }}>*</span>
                            </label>
                            <div className="relative">
                                <input
                                    id="incident-title"
                                    type="text"
                                    maxLength={100}
                                    value={form.title}
                                    onChange={set('title')}
                                    placeholder="e.g. Broken water pipe in Block A corridor"
                                    style={inputStyle(!!errors.title)}
                                    onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
                                    onBlur={e => { e.target.style.borderColor = errors.title ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = '' }}
                                />
                                <span
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums"
                                    style={{ color: form.title.length > 80 ? 'var(--color-warning-400)' : 'var(--color-text-faint)' }}
                                >
                                    {form.title.length}/100
                                </span>
                            </div>
                            {errors.title && <p className="mt-1.5 text-xs flex items-center gap-1.5" style={{ color: 'var(--color-danger-400)' }}><AlertTriangle size={11} />{errors.title}</p>}
                        </div>

                        {/* ── Description ── */}
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                Description <span style={{ color: 'var(--color-danger-400)' }}>*</span>
                                {aiLoading && <Loader2 size={12} className="animate-spin" style={{ color: 'var(--color-primary-400)' }} />}
                            </label>
                            <textarea
                                id="incident-description"
                                rows={5}
                                value={form.description}
                                onChange={set('description')}
                                placeholder="Describe the incident in detail — what happened, when, and the severity…"
                                style={{ ...inputStyle(!!errors.description), resize: 'none', lineHeight: '1.6' }}
                                onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
                                onBlur={e => { e.target.style.borderColor = errors.description ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = '' }}
                            />
                            {errors.description && <p className="mt-1.5 text-xs flex items-center gap-1.5" style={{ color: 'var(--color-danger-400)' }}><AlertTriangle size={11} />{errors.description}</p>}
                        </div>

                        {/* ── AI Suggestion Banner ── */}
                        {aiSuggestion && (
                            <div
                                className="flex items-center gap-4 rounded-xl px-5 py-4"
                                style={{
                                    background: 'rgba(99,102,241,0.08)',
                                    border: '1px solid rgba(99,102,241,0.22)',
                                    animation: 'fadeDown 250ms cubic-bezier(.16,1,.3,1)',
                                }}
                            >
                                <div
                                    className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)' }}
                                >
                                    <Sparkles size={16} style={{ color: 'var(--color-primary-400)' }} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white">
                                        AI suggests{' '}
                                        <span style={{ color: 'var(--color-primary-300)' }}>{aiSuggestion.category}</span>
                                        <span className="text-xs font-normal ml-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                            ({Math.round(aiSuggestion.confidence * 100)}% confident)
                                        </span>
                                    </p>
                                    <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--color-text-secondary)' }}>{aiSuggestion.reasoning}</p>
                                </div>
                                <Button type="button" variant="primary" size="xs"
                                    onClick={() => { setForm(p => ({ ...p, category: aiSuggestion.category })); setAiSuggestion(null) }}>
                                    Apply
                                </Button>
                                <button type="button" onClick={() => setAiSuggestion(null)}
                                    className="text-zinc-500 hover:text-white transition-colors flex-shrink-0">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {/* ── Location ── */}
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                <MapPin size={11} />
                                Location <span style={{ color: 'var(--color-danger-400)' }}>*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <input
                                        id="incident-location-block"
                                        type="text"
                                        value={form.locationBlock}
                                        onChange={set('locationBlock')}
                                        placeholder="Block (e.g. A, B)"
                                        style={inputStyle(!!errors.locationBlock)}
                                        onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
                                        onBlur={e => { e.target.style.borderColor = errors.locationBlock ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = '' }}
                                    />
                                    {errors.locationBlock && <p className="mt-1 text-[11px]" style={{ color: 'var(--color-danger-400)' }}>{errors.locationBlock}</p>}
                                </div>
                                <input
                                    id="incident-location-room"
                                    type="text"
                                    value={form.locationRoom}
                                    onChange={set('locationRoom')}
                                    placeholder="Room (optional, e.g. A-101)"
                                    style={inputStyle(false)}
                                    onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
                                    onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = '' }}
                                />
                            </div>
                        </div>

                        {/* ── Department ── */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                Department <span style={{ color: 'var(--color-danger-400)' }}>*</span>
                            </label>
                            <div className="relative">
                                <select
                                    id="incident-department"
                                    value={form.departmentId}
                                    onChange={set('departmentId')}
                                    disabled={fetchingDepts}
                                    style={{ ...inputStyle(!!errors.departmentId), appearance: 'none', paddingRight: '2.5rem', cursor: 'pointer' }}
                                    onFocus={e => { e.target.style.borderColor = 'rgba(99,102,241,0.5)'; e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.15)' }}
                                    onBlur={e => { e.target.style.borderColor = errors.departmentId ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.1)'; e.target.style.boxShadow = '' }}
                                >
                                    <option value="" disabled>
                                        {fetchingDepts ? 'Loading departments…' : 'Select a department'}
                                    </option>
                                    {departments.map(d => (
                                        <option key={d.id} value={d.id}>{d.name} ({d.code})</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-muted)' }} />
                            </div>
                            {errors.departmentId && <p className="mt-1.5 text-xs" style={{ color: 'var(--color-danger-400)' }}>{errors.departmentId}</p>}
                        </div>

                        {/* ── Photo Upload Zone ── */}
                        <div>
                            <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.1em] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                                <ImageIcon size={11} />
                                Evidence Photos
                                {form.category === 'EMERGENCY' && (
                                    <span className="text-[10px] font-bold normal-case" style={{ color: 'var(--color-warning-400)' }}>Required for Emergency</span>
                                )}
                            </label>

                            <label
                                className="flex flex-col items-center justify-center gap-3 w-full py-10 rounded-2xl cursor-pointer transition-all duration-200 group"
                                style={{
                                    border: '2px dashed rgba(255,255,255,0.08)',
                                    background: 'rgba(255,255,255,0.015)',
                                }}
                                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'; e.currentTarget.style.background = 'rgba(99,102,241,0.04)' }}
                                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.background = 'rgba(255,255,255,0.015)' }}
                            >
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={async (e) => {
                                        const files = Array.from(e.target.files)
                                        if (!files.length) return
                                        setUploading(true)
                                        const startIdx = photoUrls.length
                                        try {
                                            const uploaded = await Promise.all(
                                                files.map((file, i) =>
                                                    uploadToCloudinary(file, (pct) =>
                                                        setUploadProgress(prev => ({ ...prev, [startIdx + i]: pct }))
                                                    )
                                                )
                                            )
                                            setPhotoUrls(prev => [...prev, ...uploaded])
                                        } catch (err) {
                                            toast.error('Photo upload failed: ' + err.message)
                                        } finally {
                                            setUploading(false)
                                            setUploadProgress({})
                                            e.target.value = ''
                                        }
                                    }}
                                />
                                <div
                                    className="h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-200"
                                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                                >
                                    {uploading
                                        ? <Loader2 size={20} className="animate-spin" style={{ color: 'var(--color-primary-400)' }} />
                                        : <ImageIcon size={20} style={{ color: 'var(--color-text-muted)' }} />
                                    }
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-white mb-0.5">
                                        {uploading ? 'Uploading…' : 'Click to upload photos'}
                                    </p>
                                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>PNG, JPG, WEBP · up to 10 MB each</p>
                                </div>
                            </label>

                            {/* Upload progress bars */}
                            {Object.keys(uploadProgress).length > 0 && (
                                <div className="mt-3 space-y-2">
                                    {Object.entries(uploadProgress).map(([idx, pct]) => (
                                        <div key={idx} className="flex items-center gap-3">
                                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #6366f1, #818cf8)' }}
                                                />
                                            </div>
                                            <span className="text-[10px] font-bold tabular-nums w-8 text-right" style={{ color: 'var(--color-text-muted)' }}>{pct}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Photo grid */}
                            {photoUrls.length > 0 && (
                                <div className="grid grid-cols-4 gap-2.5 mt-3">
                                    {photoUrls.map((url, i) => (
                                        <div key={i} className="relative group aspect-square">
                                            <img
                                                src={url}
                                                alt={`Photo ${i + 1}`}
                                                className="w-full h-full object-cover rounded-xl"
                                                style={{ border: '1px solid rgba(255,255,255,0.07)' }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))}
                                                className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                                style={{ background: 'rgba(239,68,68,0.9)', backdropFilter: 'blur(4px)' }}
                                            >
                                                <X size={11} className="text-white" />
                                            </button>
                                            {/* Overlay */}
                                            <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
                                                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.3), transparent)' }} />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* ── Submit ── */}
                        <div
                            className="pt-6"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
                        >
                            <Button
                                id="create-incident-submit"
                                type="submit"
                                variant="primary"
                                size="lg"
                                disabled={isSubmitting || uploading}
                                isLoading={isSubmitting || uploading}
                                className="w-full justify-center"
                                icon={isSubmitting || uploading ? null : Plus}
                            >
                                {isSubmitting ? 'Submitting…' : uploading ? 'Uploading photos…' : 'Submit Report'}
                            </Button>
                            <p className="text-center text-xs mt-3" style={{ color: 'var(--color-text-faint)' }}>
                                Your report will be reviewed within the SLA for the selected priority.
                            </p>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    )
}