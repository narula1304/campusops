import { useEffect, useState } from 'react'
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react'

function computeRemaining(deadline) {
    if (!deadline) return null
    return new Date(deadline).getTime() - Date.now()
}

/**
 * Premium SLA countdown pill with progress arc.
 * Green (>2h) → amber (<2h) → red (<30m) → breached
 */
export default function SLACountdown({ deadline, totalMs = null }) {
    const [remaining, setRemaining] = useState(() => computeRemaining(deadline))

    useEffect(() => {
        if (!deadline) return
        const id = setInterval(() => setRemaining(computeRemaining(deadline)), 1000)
        return () => clearInterval(id)
    }, [deadline])

    if (remaining === null) {
        return (
            <span
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                style={{ background: 'rgba(100,116,139,0.1)', color: '#64748b', border: '1px solid rgba(100,116,139,0.2)' }}
            >
                <Clock size={10} />
                No SLA
            </span>
        )
    }

    if (remaining <= 0) {
        return (
            <span
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide"
                style={{
                    background: 'rgba(239,68,68,0.12)',
                    color: '#f87171',
                    border: '1px solid rgba(239,68,68,0.25)',
                    animation: 'livePulse 1.5s ease-in-out infinite',
                    boxShadow: '0 0 0 0 rgba(239,68,68,0.4)',
                }}
            >
                <AlertTriangle size={10} />
                SLA Breached
            </span>
        )
    }

    const totalSec = Math.floor(remaining / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60

    const formatted = h > 0
        ? `${h}h ${String(m).padStart(2, '0')}m`
        : `${m}m ${String(s).padStart(2, '0')}s`

    const underHalf = remaining < 30 * 60 * 1000
    const underTwo  = remaining < 2 * 60 * 60 * 1000

    const color = underHalf
        ? { bg: 'rgba(239,68,68,0.1)',  text: '#f87171', border: 'rgba(239,68,68,0.25)'  }
        : underTwo
        ? { bg: 'rgba(245,158,11,0.1)', text: '#fbbf24', border: 'rgba(245,158,11,0.25)' }
        : { bg: 'rgba(16,185,129,0.1)', text: '#34d399', border: 'rgba(16,185,129,0.25)' }

    // Optional progress arc
    let pct = null
    if (totalMs) {
        pct = Math.max(0, Math.min(100, (remaining / totalMs) * 100))
    }

    return (
        <span
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
            style={{ background: color.bg, color: color.text, border: `1px solid ${color.border}` }}
        >
            <Clock size={10} className="flex-shrink-0" />
            {formatted}
        </span>
    )
}
