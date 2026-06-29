import { useEffect, useState } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'

function computeRemaining(deadline) {
    if (!deadline) return null
    return new Date(deadline).getTime() - Date.now()
}

/**
 * Live SLA countdown timer. Updates every second.
 * Green → orange (< 2 h) → red (< 30 min) → "SLA Breached"
 *
 * @param {{ deadline: string|null }} props
 */
export default function SLACountdown({ deadline }) {
    const [remaining, setRemaining] = useState(() => computeRemaining(deadline))

    useEffect(() => {
        if (!deadline) return
        const id = setInterval(() => {
            setRemaining(computeRemaining(deadline))
        }, 1000)
        return () => clearInterval(id)
    }, [deadline])

    if (remaining === null) {
        return <span className="text-slate-500 text-xs">No SLA set</span>
    }

    if (remaining <= 0) {
        return (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-400">
                <AlertTriangle size={11} />
                SLA Breached
            </span>
        )
    }

    const totalSec = Math.floor(remaining / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60

    const formatted = h > 0
        ? `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
        : `${m}m ${String(s).padStart(2, '0')}s`

    const underHalf = remaining < 30 * 60 * 1000       // < 30 min
    const underTwo  = remaining < 2 * 60 * 60 * 1000   // < 2 h

    const colorCls = underHalf
        ? 'text-red-400 font-bold'
        : underTwo
        ? 'text-orange-400 font-semibold'
        : 'text-emerald-400 font-medium'

    return (
        <span className={`text-xs tabular-nums ${colorCls} flex items-center gap-1`}>
            <Clock size={11} className="shrink-0" />
            {formatted} remaining
        </span>
    )
}
