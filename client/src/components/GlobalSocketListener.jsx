import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Siren, CheckCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { acknowledgePanic } from '../api/panic'
import { useNavigate } from 'react-router-dom'

export default function GlobalSocketListener() {
    const { user, isAuthenticated, on } = useAuth()
    const navigate = useNavigate()
    const [panicAlert, setPanicAlert] = useState(null)
    const [ackLoading, setAckLoading] = useState(false)

    useEffect(() => {
        if (!isAuthenticated || !user) return

        // Global incident created toast (for ADMIN/MAINTENANCE/SECURITY)
        const unsub1 = on('incident_created', (data) => {
            if (user.role === 'ADMIN' || user.role === 'MAINTENANCE' || user.role === 'SECURITY') {
                // If they are on the incident list or dashboard, it updates, but a toast is nice
                toast(`New incident reported: ${data.category}`, {
                    icon: '🚨',
                    duration: 4000,
                })
            }
        })

        // Global incident resolved / feedback request toast
        const unsub2 = on('incident_resolved', (data) => {
            if (data.creatorId === user.id) {
                toast((t) => (
                    <div className="flex flex-col gap-2">
                        <span className="font-medium">Incident {data.incidentNumber} resolved!</span>
                        <span className="text-xs text-slate-400">Please provide feedback.</span>
                        <button
                            onClick={() => {
                                toast.dismiss(t.id)
                                navigate(`/incidents/${data.id}`)
                            }}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1 px-3 rounded mt-1 transition-colors"
                        >
                            View Incident
                        </button>
                    </div>
                ), { duration: 10000, icon: '✅' })
            }
        })

        // Global Panic Alert Takeover
        const unsub3 = on('panic_alert', (data) => {
            if (['ADMIN', 'MAINTENANCE', 'SECURITY'].includes(user.role)) {
                setPanicAlert(data)
                // Also play a sound or vibration if possible
                if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 500])
            }
        })

        // Dismiss panic if acknowledged globally
        const unsub4 = on('panic_acknowledged_global', (data) => {
            setPanicAlert((prev) => {
                if (prev && prev.incidentId === data.incidentId) {
                    toast.success(`Panic handled by ${data.officerName}`, { icon: '🛡️' })
                    return null
                }
                return prev
            })
        })

        return () => {
            unsub1()
            unsub2()
            unsub3()
            unsub4()
        }
    }, [isAuthenticated, user, on, navigate])

    const handleAcknowledge = async () => {
        if (!panicAlert) return
        setAckLoading(true)
        try {
            await acknowledgePanic(panicAlert.incidentId)
            // Backend will emit panic_acknowledged_global which clears the state
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to acknowledge')
            setAckLoading(false)
        }
    }

    if (!panicAlert) return null

    return (
        <div className="fixed inset-0 z-[99999] bg-red-950 flex flex-col items-center justify-center p-6 overflow-hidden animate-[fadeInScale_0.2s_ease-out]">
            {/* Background pulsating red light effect */}
            <div className="absolute inset-0 bg-red-600/20 animate-pulse pointer-events-none" />
            
            <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
                <div className="w-24 h-24 rounded-full bg-red-600/30 border-4 border-red-500 flex items-center justify-center mb-6 animate-bounce">
                    <Siren size={48} className="text-white" />
                </div>
                
                <h1 className="text-5xl font-black text-white uppercase tracking-wider mb-2 drop-shadow-lg">
                    EMERGENCY ALERT
                </h1>
                
                <p className="text-xl text-red-200 font-medium mb-8">
                    {panicAlert.reporterName} triggered a panic alert.
                </p>

                <div className="bg-red-900/50 border border-red-500/50 rounded-2xl p-6 w-full mb-8 text-left shadow-2xl">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <p className="text-xs text-red-300 uppercase tracking-wide font-bold">Location</p>
                            <p className="text-white font-medium mt-1">
                                Lat: {panicAlert.lat.toFixed(6)}<br/>
                                Lng: {panicAlert.lng.toFixed(6)}
                            </p>
                        </div>
                        <div>
                            <p className="text-xs text-red-300 uppercase tracking-wide font-bold">Time</p>
                            <p className="text-white font-medium mt-1">
                                {new Date(panicAlert.triggeredAt).toLocaleTimeString()}
                            </p>
                        </div>
                        <div className="col-span-2 mt-2">
                            <p className="text-xs text-red-300 uppercase tracking-wide font-bold">Message</p>
                            <p className="text-white font-medium mt-1">
                                {panicAlert.message || 'No additional message'}
                            </p>
                        </div>
                    </div>
                </div>

                {user.role === 'SECURITY' ? (
                    <button
                        onClick={handleAcknowledge}
                        disabled={ackLoading}
                        className="bg-white text-red-700 text-xl font-bold uppercase tracking-widest py-4 px-12 rounded-full hover:bg-red-100 transition-colors shadow-2xl shadow-red-500/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
                    >
                        {ackLoading ? 'Acknowledging...' : (
                            <>
                                <CheckCircle size={28} />
                                Acknowledge & Respond
                            </>
                        )}
                    </button>
                ) : (
                    <p className="text-red-300 font-medium animate-pulse">
                        Waiting for Security personnel to acknowledge...
                    </p>
                )}
            </div>
        </div>
    )
}
