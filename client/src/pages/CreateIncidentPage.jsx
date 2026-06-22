import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, X, AlertTriangle, ImageIcon, Loader2 } from 'lucide-react'
import { createIncident } from '../api/incidents'

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORIES = ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']

const PRIORITY_COLORS = {
    LOW: 'text-green-400',
    MEDIUM: 'text-yellow-400',
    HIGH: 'text-orange-400',
    CRITICAL: 'text-red-400',
}

// ── Reusable field wrapper ─────────────────────────────────────────────────────
function Field({ label, required, error, children }) {
    return (
        <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-300">
                {label}
                {required && <span className="text-indigo-400 ml-0.5">*</span>}
            </label>
            {children}
            {error && (
                <p className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle size={11} />
                    {error}
                </p>
            )}
        </div>
    )
}

// ── Shared input className builder ─────────────────────────────────────────────
function inputCls(hasError) {
    return [
        'w-full px-4 py-2.5 rounded-lg bg-white/8 border text-white text-sm',
        'placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition',
        hasError ? 'border-red-500/60 bg-red-500/5' : 'border-white/12 hover:border-white/20',
    ].join(' ')
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function CreateIncidentPage() {
    const navigate = useNavigate()

    // ── Form state ─────────────────────────────────────────────────────────────
    const [form, setForm] = useState({
        title: '',
        description: '',
        category: 'MAINTENANCE',
        priority: 'MEDIUM',
        locationBlock: '',
        locationRoom: '',
        departmentId: '',
    })
    const [photos, setPhotos] = useState([''])   // array of URL strings
    const [errors, setErrors] = useState({})     // field-level errors
    const [isSubmitting, setIsSubmitting] = useState(false)

    // ── Derived ────────────────────────────────────────────────────────────────
    const filledPhotos = photos.filter(u => u.trim() !== '')
    const isCritical = form.priority === 'CRITICAL'
    const showPhotoWarn = isCritical && filledPhotos.length === 0

    // ── Field change ───────────────────────────────────────────────────────────
    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    }

    // ── Photo management ───────────────────────────────────────────────────────
    const setPhoto = (idx, value) => {
        setPhotos(prev => prev.map((u, i) => i === idx ? value : u))
    }
    const addPhoto = () => setPhotos(prev => [...prev, ''])
    const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx))

    // ── Client-side validation ─────────────────────────────────────────────────
    function validate() {
        const e = {}
        if (!form.title.trim()) e.title = 'Title is required'
        if (form.title.length > 100) e.title = 'Title must be 100 characters or fewer'
        if (!form.description.trim()) e.description = 'Description is required'
        if (form.description.trim().length < 10) e.description = 'Description must be at least 10 characters'
        if (!form.locationBlock.trim()) e.locationBlock = 'Block is required'
        if (!form.departmentId.trim()) e.departmentId = 'Department ID is required'
        return e
    }

    // ── Submit ─────────────────────────────────────────────────────────────────
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
            await createIncident({
                title: form.title.trim(),
                description: form.description.trim(),
                category: form.category,
                priority: form.priority,
                location: {
                    block: form.locationBlock.trim(),
                    room: form.locationRoom.trim() || undefined,
                },
                departmentId: form.departmentId.trim(),
                evidencePhotos: filledPhotos,
            })

            toast.success('Incident reported successfully!')
            navigate('/dashboard')
        } catch (err) {
            const apiError = err?.response?.data?.error

            // Field-level error from API
            if (apiError?.field) {
                setErrors({ [apiError.field]: apiError.message })
            }

            // Toast with message
            toast.error(apiError?.message ?? err?.message ?? 'Failed to submit incident. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-4 py-10">
            <div className="max-w-2xl mx-auto">

                {/* Back button */}
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium mb-6 transition-colors group"
                >
                    <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    Back
                </button>

                {/* Card */}
                <div className="bg-white/4 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden">

                    {/* Card header */}
                    <div className="px-8 py-6 border-b border-white/8 bg-white/3">
                        <h1 className="text-xl font-bold text-white tracking-tight">Report an Incident</h1>
                        <p className="text-slate-400 text-sm mt-1">
                            Provide as much detail as possible so we can resolve it quickly.
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="px-8 py-7 space-y-6" noValidate>

                        {/* CRITICAL warning banner */}
                        {showPhotoWarn && (
                            <div className="flex items-start gap-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3.5">
                                <AlertTriangle size={16} className="text-yellow-400 mt-0.5 shrink-0" />
                                <p className="text-yellow-300 text-sm">
                                    <span className="font-semibold">Critical incidents</span> require at least one evidence photo.
                                    Please add a Cloudinary URL below.
                                </p>
                            </div>
                        )}

                        {/* Title */}
                        <Field label="Title" required error={errors.title}>
                            <input
                                id="incident-title"
                                type="text"
                                maxLength={100}
                                value={form.title}
                                onChange={set('title')}
                                placeholder="e.g. Broken water pipe in Block A"
                                className={inputCls(!!errors.title)}
                            />
                            <span className="text-xs text-slate-600 text-right">
                                {form.title.length}/100
                            </span>
                        </Field>

                        {/* Description */}
                        <Field label="Description" required error={errors.description}>
                            <textarea
                                id="incident-description"
                                rows={4}
                                value={form.description}
                                onChange={set('description')}
                                placeholder="Describe the incident in detail — what happened, when, severity…"
                                className={`${inputCls(!!errors.description)} resize-none`}
                            />
                        </Field>

                        {/* Category + Priority */}
                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Category" required>
                                <select
                                    id="incident-category"
                                    value={form.category}
                                    onChange={set('category')}
                                    className={inputCls(false) + ' cursor-pointer'}
                                >
                                    {CATEGORIES.map(c => (
                                        <option key={c} value={c} className="bg-slate-800">
                                            {c.charAt(0) + c.slice(1).toLowerCase()}
                                        </option>
                                    ))}
                                </select>
                            </Field>

                            <Field label="Priority" required>
                                <select
                                    id="incident-priority"
                                    value={form.priority}
                                    onChange={set('priority')}
                                    className={`${inputCls(false)} cursor-pointer ${PRIORITY_COLORS[form.priority]}`}
                                >
                                    {PRIORITIES.map(p => (
                                        <option key={p} value={p} className="bg-slate-800 text-white">
                                            {p.charAt(0) + p.slice(1).toLowerCase()}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        </div>

                        {/* Location — two-column */}
                        <div>
                            <p className="text-sm font-medium text-slate-300 mb-2">
                                Location <span className="text-indigo-400">*</span>
                            </p>
                            <div className="grid grid-cols-2 gap-4">
                                <Field label="Block" required error={errors.locationBlock}>
                                    <input
                                        id="incident-location-block"
                                        type="text"
                                        value={form.locationBlock}
                                        onChange={set('locationBlock')}
                                        placeholder="e.g. A, B, C"
                                        className={inputCls(!!errors.locationBlock)}
                                    />
                                </Field>

                                <Field label="Room (optional)">
                                    <input
                                        id="incident-location-room"
                                        type="text"
                                        value={form.locationRoom}
                                        onChange={set('locationRoom')}
                                        placeholder="e.g. A-101"
                                        className={inputCls(false)}
                                    />
                                </Field>
                            </div>
                        </div>

                        {/* Department ID */}
                        <Field label="Department ID" required error={errors.departmentId}>
                            <input
                                id="incident-department"
                                type="text"
                                value={form.departmentId}
                                onChange={set('departmentId')}
                                placeholder="e.g. dept_01jv..."
                                className={inputCls(!!errors.departmentId)}
                            />
                        </Field>

                        {/* Evidence Photos */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                                    <ImageIcon size={14} className="text-slate-500" />
                                    Evidence Photos
                                    <span className="text-xs text-slate-600">(optional — Cloudinary URLs)</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={addPhoto}
                                    className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                                >
                                    <Plus size={13} /> Add URL
                                </button>
                            </div>

                            <div className="space-y-2">
                                {photos.map((url, idx) => (
                                    <div key={idx} className="flex items-center gap-2">
                                        <input
                                            type="url"
                                            value={url}
                                            onChange={(e) => setPhoto(idx, e.target.value)}
                                            placeholder="https://res.cloudinary.com/..."
                                            className={inputCls(false)}
                                        />
                                        {photos.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={() => removePhoto(idx)}
                                                className="shrink-0 w-8 h-8 rounded-lg bg-white/5 hover:bg-red-500/15 hover:text-red-400 text-slate-500 flex items-center justify-center transition-colors"
                                                aria-label="Remove photo"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {filledPhotos.length > 0 && (
                                <p className="text-xs text-slate-600">
                                    {filledPhotos.length} photo{filledPhotos.length > 1 ? 's' : ''} attached
                                </p>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-white/8" />

                        {/* Submit */}
                        <button
                            id="create-incident-submit"
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold transition-all duration-200 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.99]"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 size={17} className="animate-spin" />
                                    Submitting…
                                </>
                            ) : (
                                'Report Incident'
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )
}