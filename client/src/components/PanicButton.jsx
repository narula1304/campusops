import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { Siren } from 'lucide-react'
import { triggerPanic } from '../api/panic'

const COOLDOWN_SECONDS = 30
const HOLD_DURATION_MS = 2000
const SIZE = 56
const R = SIZE / 2 - 4
const CIRCUMFERENCE = 2 * Math.PI * R

export default function PanicButton({ role }) {
    const [loading,      setLoading]      = useState(false)
    const [cooldown,     setCooldown]     = useState(0)
    const [isHolding,    setIsHolding]    = useState(false)
    const [holdProgress, setHoldProgress] = useState(0)

    const timerRef        = useRef(null)
    const holdIntervalRef = useRef(null)
    const holdStartRef    = useRef(0)

    if (role !== 'STUDENT' && role !== 'FACULTY') return null

    const isDisabled = cooldown > 0 || loading

    const startCooldown = () => {
        setCooldown(COOLDOWN_SECONDS)
        timerRef.current = setInterval(() => {
            setCooldown(prev => {
                if (prev <= 1) { clearInterval(timerRef.current); return 0 }
                return prev - 1
            })
        }, 1000)
    }

    useEffect(() => () => clearInterval(timerRef.current), [])

    const getCoords = () =>
        new Promise(resolve => {
            if (!navigator.geolocation) { resolve({ lat: 0, lng: 0 }); return }
            navigator.geolocation.getCurrentPosition(
                pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                ()  => resolve({ lat: 0, lng: 0 }),
                { timeout: 5000 }
            )
        })

    const handleTrigger = async () => {
        if (loading || cooldown > 0) return
        setLoading(true); setIsHolding(false); setHoldProgress(0)
        try {
            const { lat, lng } = await getCoords()
            await triggerPanic(lat, lng, 'Panic button triggered via hold')
            toast.success('Emergency alert sent! Help is on the way.', { duration: 6000, icon: '🚨' })
            startCooldown()
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to send alert. Try again.', { duration: 5000 })
        } finally {
            setLoading(false)
        }
    }

    const startHold = () => {
        if (isDisabled) return
        setIsHolding(true); setHoldProgress(0)
        holdStartRef.current = Date.now()
        holdIntervalRef.current = setInterval(() => {
            const elapsed  = Date.now() - holdStartRef.current
            const progress = Math.min(100, (elapsed / HOLD_DURATION_MS) * 100)
            setHoldProgress(progress)
            if (progress >= 100) { clearInterval(holdIntervalRef.current); handleTrigger() }
        }, 30)
    }

    const cancelHold = () => {
        if (holdProgress >= 100 || loading) return
        clearInterval(holdIntervalRef.current)
        setIsHolding(false); setHoldProgress(0)
    }

    useEffect(() => {
        const up = () => cancelHold()
        window.addEventListener('mouseup', up)
        window.addEventListener('touchend', up)
        return () => { window.removeEventListener('mouseup', up); window.removeEventListener('touchend', up); clearInterval(holdIntervalRef.current) }
    }, [holdProgress, loading])

    // SVG ring progress
    const strokeDash = CIRCUMFERENCE - (holdProgress / 100) * CIRCUMFERENCE

    // Cooldown ring
    const cooldownDash = CIRCUMFERENCE - ((COOLDOWN_SECONDS - cooldown) / COOLDOWN_SECONDS) * CIRCUMFERENCE

    return (
        <div className="fixed bottom-24 right-8 z-50 group" style={{ width: SIZE + 8, height: SIZE + 8 }}>
            {/* Idle pulse rings */}
            {!isDisabled && !isHolding && (
                <>
                    <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(239,68,68,0.25)', animationDuration: '2s' }} />
                    <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(239,68,68,0.15)', animationDuration: '2s', animationDelay: '0.5s' }} />
                </>
            )}

            {/* SVG ring overlay */}
            <svg
                width={SIZE + 8}
                height={SIZE + 8}
                viewBox={`0 0 ${SIZE + 8} ${SIZE + 8}`}
                className="absolute inset-0 pointer-events-none -rotate-90"
            >
                {/* Track */}
                <circle
                    cx={(SIZE + 8) / 2}
                    cy={(SIZE + 8) / 2}
                    r={R}
                    fill="none"
                    stroke="rgba(255,255,255,0.07)"
                    strokeWidth="3"
                />
                {/* Hold progress */}
                {isHolding && (
                    <circle
                        cx={(SIZE + 8) / 2}
                        cy={(SIZE + 8) / 2}
                        r={R}
                        fill="none"
                        stroke="#f87171"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={strokeDash}
                        style={{ transition: 'stroke-dashoffset 30ms linear', filter: 'drop-shadow(0 0 6px rgba(248,113,113,0.8))' }}
                    />
                )}
                {/* Cooldown progress */}
                {cooldown > 0 && (
                    <circle
                        cx={(SIZE + 8) / 2}
                        cy={(SIZE + 8) / 2}
                        r={R}
                        fill="none"
                        stroke="#64748b"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeDasharray={CIRCUMFERENCE}
                        strokeDashoffset={cooldownDash}
                        style={{ transition: 'stroke-dashoffset 1000ms linear' }}
                    />
                )}
            </svg>

            {/* Button */}
            <button
                id="panic-button"
                type="button"
                onMouseDown={startHold}
                onTouchStart={startHold}
                disabled={isDisabled}
                aria-label="Hold for emergency panic alert"
                className="absolute inset-1 rounded-full flex flex-col items-center justify-center focus:outline-none transition-all duration-200 overflow-hidden"
                style={{
                    background: isDisabled
                        ? 'radial-gradient(circle, #374151, #1f2937)'
                        : isHolding
                            ? 'radial-gradient(circle, #ef4444, #991b1b)'
                            : 'radial-gradient(circle, #dc2626, #7f1d1d)',
                    boxShadow: isDisabled
                        ? 'none'
                        : isHolding
                            ? '0 0 0 0 rgba(239,68,68,0.5), 0 8px 32px -8px rgba(239,68,68,0.7)'
                            : '0 8px 24px -4px rgba(220,38,38,0.6), inset 0 1px 0 rgba(255,255,255,0.15)',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    transform: isHolding ? 'scale(0.95)' : 'scale(1)',
                }}
            >
                {/* Inner fill on hold */}
                {isHolding && (
                    <div
                        className="absolute inset-0 rounded-full"
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            clipPath: `inset(${100 - holdProgress}% 0 0 0)`,
                            transition: 'clip-path 30ms linear',
                        }}
                    />
                )}

                {cooldown > 0 ? (
                    <div className="relative z-10 text-center">
                        <p className="text-[8px] font-bold uppercase tracking-wider text-zinc-400 leading-none mb-0.5">Wait</p>
                        <p className="text-sm font-black text-white tabular-nums leading-none">{cooldown}s</p>
                    </div>
                ) : (
                    <Siren
                        size={22}
                        className="relative z-10 text-white"
                        style={{
                            filter: isHolding ? 'drop-shadow(0 0 8px rgba(255,200,200,0.9))' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
                            animation: isHolding ? 'livePulse 0.4s ease-in-out infinite' : 'none',
                        }}
                    />
                )}
            </button>

            {/* Tooltip */}
            {!isDisabled && !isHolding && (
                <div className="absolute right-[calc(100%+10px)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none">
                    <div
                        className="text-white text-[10px] font-bold px-3 py-2 rounded-xl whitespace-nowrap"
                        style={{
                            background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                            boxShadow: '0 4px 16px -4px rgba(239,68,68,0.5)',
                        }}
                    >
                        HOLD 2s · EMERGENCY
                        <span className="absolute left-full top-1/2 -translate-y-1/2 border-4 border-transparent border-l-red-600" />
                    </div>
                </div>
            )}
        </div>
    )
}
