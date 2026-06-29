import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Siren, X, AlertTriangle, Loader2 } from 'lucide-react'
import { triggerPanic } from '../api/panic'

const COOLDOWN_SECONDS = 30

// ── Confirmation Modal ────────────────────────────────────────────────────────
function ConfirmModal({ onConfirm, onCancel, loading }) {
    // Close on Escape key
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onCancel() }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onCancel])

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                onClick={onCancel}
            />

            {/* Dialog */}
            <div className="relative w-full max-w-sm bg-slate-900 border border-red-500/30 rounded-2xl shadow-2xl shadow-red-900/30 overflow-hidden animate-[fadeInScale_0.15s_ease-out]">
                {/* Red accent bar */}
                <div className="h-1 bg-gradient-to-r from-red-600 to-orange-500" />

                <div className="px-6 py-5">
                    {/* Icon + title */}
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-red-600/20 border border-red-500/30 flex items-center justify-center shrink-0">
                            <Siren size={18} className="text-red-400" />
                        </div>
                        <h2 className="text-base font-bold text-white">Trigger Emergency Alert?</h2>
                    </div>

                    <p className="text-sm text-slate-400 leading-relaxed mb-6">
                        This will immediately notify all security personnel and create an emergency incident.{' '}
                        <span className="text-red-400 font-medium">Only use in genuine emergencies.</span>
                    </p>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            id="panic-modal-cancel"
                            type="button"
                            onClick={onCancel}
                            disabled={loading}
                            className="flex-1 py-2.5 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 hover:text-white text-sm font-medium transition-all disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        <button
                            id="panic-modal-confirm"
                            type="button"
                            onClick={onConfirm}
                            disabled={loading}
                            className="flex-1 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-bold transition-all hover:shadow-lg hover:shadow-red-500/30 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <><Loader2 size={14} className="animate-spin" /> Sending…</>
                            ) : (
                                <><Siren size={14} /> Send Emergency Alert</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ── Panic Button ──────────────────────────────────────────────────────────────
export default function PanicButton({ role }) {
    const [showModal, setShowModal] = useState(false)
    const [loading, setLoading] = useState(false)
    const [cooldown, setCooldown] = useState(0)   // seconds remaining
    const timerRef = useRef(null)

    // Only STUDENT and FACULTY can trigger panic
    if (role !== 'STUDENT' && role !== 'FACULTY') return null

    const isDisabled = cooldown > 0 || loading

    // ── Start cooldown ─────────────────────────────────────────────────────────
    const startCooldown = () => {
        setCooldown(COOLDOWN_SECONDS)
        timerRef.current = setInterval(() => {
            setCooldown((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current)
                    return 0
                }
                return prev - 1
            })
        }, 1000)
    }

    // Cleanup on unmount
    useEffect(() => () => clearInterval(timerRef.current), [])

    // ── Get geolocation ────────────────────────────────────────────────────────
    const getCoords = () =>
        new Promise((resolve) => {
            if (!navigator.geolocation) {
                resolve({ lat: 0, lng: 0 })
                return
            }
            navigator.geolocation.getCurrentPosition(
                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => resolve({ lat: 0, lng: 0 }),
                { timeout: 5000 }
            )
        })

    // ── Handle confirm ─────────────────────────────────────────────────────────
    const handleConfirm = async () => {
        setLoading(true)
        try {
            const { lat, lng } = await getCoords()
            await triggerPanic(lat, lng, 'Panic button triggered')
            setShowModal(false)
            toast.success('Emergency alert sent! Help is on the way.', {
                duration: 6000,
                icon: '🚨',
            })
            startCooldown()
        } catch (err) {
            toast.error(
                err?.response?.data?.error?.message ?? 'Failed to send emergency alert. Try again.',
                { duration: 5000 }
            )
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            {/* ── Floating button ─────────────────────────────────────────── */}
            <div className="fixed bottom-24 right-8 z-50 group">
                {/* Pulsing ring — only when idle */}
                {!isDisabled && (
                    <span className="absolute inset-0 rounded-full bg-red-500 opacity-40 animate-ping" />
                )}

                <button
                    id="panic-button"
                    type="button"
                    onClick={() => !isDisabled && setShowModal(true)}
                    disabled={isDisabled}
                    aria-label="Trigger emergency panic alert"
                    className={`
                        relative w-14 h-14 rounded-full flex flex-col items-center justify-center
                        shadow-lg shadow-red-900/40 transition-all duration-200
                        focus:outline-none focus:ring-4 focus:ring-red-500/40
                        ${isDisabled
                            ? 'bg-slate-700 cursor-not-allowed opacity-70 shadow-none'
                            : 'bg-red-600 hover:bg-red-500 hover:scale-110 hover:shadow-xl hover:shadow-red-500/40 active:scale-95 cursor-pointer'
                        }
                    `}
                >
                    {cooldown > 0 ? (
                        <span className="text-white text-[10px] font-bold tabular-nums leading-none text-center">
                            <span className="block text-[8px] opacity-70">Cool</span>
                            {cooldown}s
                        </span>
                    ) : (
                        <Siren size={22} className="text-white" />
                    )}
                </button>

                {/* Tooltip label on hover */}
                {!isDisabled && (
                    <div className="absolute right-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                        <div className="bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
                            PANIC
                            {/* Arrow */}
                            <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-red-700" />
                        </div>
                    </div>
                )}
            </div>

            {/* ── Confirmation modal ───────────────────────────────────────── */}
            {showModal && (
                <ConfirmModal
                    onConfirm={handleConfirm}
                    onCancel={() => !loading && setShowModal(false)}
                    loading={loading}
                />
            )}
        </>
    )
}
