import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { ArrowLeft, Plus, X, AlertTriangle, ImageIcon, Loader2, Sparkles } from 'lucide-react'
import { createIncident, aiClassifyIncident } from '../api/incidents'
import { uploadToCloudinary } from '../utils/uploadToCloudinary'

// ── Constants ──────────────────────────────────────────────────────────────────
const CATEGORIES = ['MAINTENANCE', 'SECURITY', 'INFRASTRUCTURE', 'CLEANLINESS', 'EMERGENCY', 'OTHER']
const CATEGORY_PRIORITY_MAP = {
    EMERGENCY: 'CRITICAL',
    SECURITY: 'HIGH',
    INFRASTRUCTURE: 'HIGH',
    MAINTENANCE: 'MEDIUM',
    CLEANLINESS: 'LOW',
    OTHER: 'MEDIUM',
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
        locationBlock: '',
        locationRoom: '',
        departmentId: '',
    })
    const [errors, setErrors] = useState({})     // field-level errors
    const [isSubmitting, setIsSubmitting] = useState(false)

    // ── AI Suggestion ──────────────────────────────────────────────────────────
    const [aiSuggestion, setAiSuggestion] = useState(null)
    const [aiLoading, setAiLoading] = useState(false)
    const aiDebounceRef = useRef(null)

    useEffect(() => {
        clearTimeout(aiDebounceRef.current)
        const text = `${form.title} ${form.description}`.trim()
        if (text.length < 20) {
            setAiSuggestion(null)
            return
        }
        aiDebounceRef.current = setTimeout(async () => {
            setAiLoading(true)
            try {
                const result = await aiClassifyIncident(form.title, form.description)
                if (result?.category && result.confidence > 0.5) {
                    setAiSuggestion(result)
                } else {
                    setAiSuggestion(null)
                }
            } catch {
                setAiSuggestion(null)
            } finally {
                setAiLoading(false)
            }
        }, 800)
        return () => clearTimeout(aiDebounceRef.current)
    }, [form.title, form.description])

    // ── Derived ────────────────────────────────────────────────────────────────
    const filledPhotos = photoUrls.length > 0
    const isCritical = CATEGORY_PRIORITY_MAP[form.category] === 'CRITICAL'
    const showPhotoWarn = isCritical && !filledPhotos

    // ── Field change ───────────────────────────────────────────────────────────
    const set = (field) => (e) => {
        setForm(prev => ({ ...prev, [field]: e.target.value }))
        if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    }

    // ── Photo management ───────────────────────────────────────────────────────
    const [photoFiles, setPhotoFiles] = useState([])   // File objects
    const [photoUrls, setPhotoUrls] = useState([])   // uploaded secure_urls
    const [uploadProgress, setUploadProgress] = useState({}) // { index: percent }
    const [uploading, setUploading] = useState(false)

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
                priority: CATEGORY_PRIORITY_MAP[form.category],
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
                        <Field
                            label={
                                <>
                                    Description
                                    {aiLoading && <Loader2 size={12} className="inline ml-2 animate-spin text-indigo-400" />}
                                </>
                            }
                            required
                            error={errors.description}
                        >
                            <textarea
                                id="incident-description"
                                rows={4}
                                value={form.description}
                                onChange={set('description')}
                                placeholder="Describe the incident in detail — what happened, when, severity…"
                                className={`${inputCls(!!errors.description)} resize-none`}
                            />
                        </Field>

                        {/* AI Suggestion Banner */}
                        {aiSuggestion && (
                            <div className="flex items-center gap-3 bg-indigo-600/10 border border-indigo-500/30 rounded-xl px-4 py-3">
                                <Sparkles size={16} className="text-indigo-400 shrink-0" />
                                <div className="flex-1">
                                    <p className="text-sm text-indigo-300 font-medium">
                                        AI suggests: <strong>{aiSuggestion.category}</strong>
                                        <span className="text-xs text-indigo-400 ml-2">
                                            ({Math.round(aiSuggestion.confidence * 100)}% confident)
                                        </span>
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5">{aiSuggestion.reasoning}</p>
                                </div>
                                <button type="button" onClick={() => { setForm(p => ({ ...p, category: aiSuggestion.category })); setAiSuggestion(null) }}
                                    className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors">
                                    Apply
                                </button>
                                <button type="button" onClick={() => setAiSuggestion(null)}
                                    className="text-slate-500 hover:text-slate-300 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                        )}

                        {/* Category */}
                        <Field label="Category" required>
                            <select
                                id="incident-category"
                                value={form.category}
                                onChange={set('category')}
                                className={inputCls(false) + ' cursor-pointer'}
                            >
                                {CATEGORIES.map(c => (
                                    <option key={c} value={c} className="bg-slate-800">
                                        {c.charAt(0) + c.slice(1).toLowerCase()} — {CATEGORY_PRIORITY_MAP[c]}
                                    </option>
                                ))}
                            </select>
                        </Field>

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
                                    {form.category === 'EMERGENCY' && (
                                        <span className="text-xs text-yellow-400">(required for Emergency)</span>
                                    )}
                                </label>
                            </div>

                            {/* File picker */}
                            <label className="flex items-center justify-center gap-3 w-full py-8 border-2 border-dashed border-white/15 rounded-xl cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group">
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={async (e) => {
                                        const files = Array.from(e.target.files)
                                        if (!files.length) return

                                        setUploading(true)
                                        setPhotoFiles(prev => [...prev, ...files])

                                        const startIdx = photoUrls.length

                                        try {
                                            const uploaded = await Promise.all(
                                                files.map((file, i) =>
                                                    uploadToCloudinary(file, (pct) => {
                                                        setUploadProgress(prev => ({
                                                            ...prev,
                                                            [startIdx + i]: pct
                                                        }))
                                                    })
                                                )
                                            )
                                            setPhotoUrls(prev => [...prev, ...uploaded])
                                        } catch (err) {
                                            toast.error('Photo upload failed: ' + err.message)
                                        } finally {
                                            setUploading(false)
                                            setUploadProgress({})
                                            // Reset file input so same file can be re-selected
                                            e.target.value = ''
                                        }
                                    }}
                                />
                                <div className="flex flex-col items-center gap-1 text-center">
                                    <ImageIcon size={22} className="text-slate-500 group-hover:text-indigo-400 transition-colors" />
                                    <span className="text-sm text-slate-400 group-hover:text-slate-300 transition-colors">
                                        {uploading ? 'Uploading…' : 'Click to upload photos'}
                                    </span>
                                    <span className="text-xs text-slate-600">PNG, JPG, WEBP up to 10MB each</span>
                                </div>
                            </label>

                            {/* Upload progress bars */}
                            {Object.keys(uploadProgress).length > 0 && (
                                <div className="space-y-2">
                                    {Object.entries(uploadProgress).map(([idx, pct]) => (
                                        <div key={idx} className="flex items-center gap-3">
                                            <div className="flex-1 bg-white/10 rounded-full h-1.5 overflow-hidden">
                                                <div
                                                    className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-slate-500 w-8 text-right">{pct}%</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Uploaded photo thumbnails */}
                            {photoUrls.length > 0 && (
                                <div className="grid grid-cols-4 gap-2 mt-1">
                                    {photoUrls.map((url, i) => (
                                        <div key={i} className="relative group aspect-square">
                                            <img
                                                src={url}
                                                alt={`Photo ${i + 1}`}
                                                className="w-full h-full object-cover rounded-lg border border-white/10"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setPhotoUrls(prev => prev.filter((_, idx) => idx !== i))
                                                    setPhotoFiles(prev => prev.filter((_, idx) => idx !== i))
                                                }}
                                                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 hover:bg-red-600 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <X size={10} className="text-white" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {photoUrls.length > 0 && (
                                <p className="text-xs text-slate-600">
                                    {photoUrls.length} photo{photoUrls.length > 1 ? 's' : ''} uploaded
                                </p>
                            )}
                        </div>

                        {/* Divider */}
                        <div className="border-t border-white/8" />

                        {/* Submit */}
                        <button
                            id="create-incident-submit"
                            type="submit"
                            disabled={isSubmitting || uploading}
                            className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold transition-all duration-200 flex items-center justify-center gap-2 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.99]"
                        >
                            {isSubmitting ? (
                                <><Loader2 size={17} className="animate-spin" /> Submitting…</>
                            ) : uploading ? (
                                <><Loader2 size={17} className="animate-spin" /> Uploading photos…</>
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