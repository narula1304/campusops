import { useNavigate } from 'react-router-dom'
import { ShieldAlert, ArrowLeft, Home } from 'lucide-react'
import { Button } from '../components/ui/Button'

export default function UnauthorizedPage() {
    const navigate = useNavigate()

    return (
        <div
            className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
            style={{ background: 'var(--color-bg-base)' }}
        >
            {/* Background danger orb */}
            <div className="absolute pointer-events-none" style={{
                top: '-20%', left: '-10%', width: '50%', height: '50%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)',
                animation: 'float 10s ease-in-out infinite',
            }} />
            <div className="absolute pointer-events-none" style={{
                bottom: '-15%', right: '-10%', width: '40%', height: '40%',
                borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(239,68,68,0.07) 0%, transparent 70%)',
                animation: 'float 13s ease-in-out infinite reverse',
            }} />

            <div className="text-center max-w-md relative z-10 animate-zoom-in">
                {/* Icon */}
                <div
                    className="inline-flex items-center justify-center w-24 h-24 rounded-3xl mb-8 mx-auto"
                    style={{
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        boxShadow: '0 16px 48px -8px rgba(239,68,68,0.3)',
                    }}
                >
                    <ShieldAlert size={44} style={{ color: 'var(--color-danger-400)' }} />
                </div>

                {/* Code label */}
                <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5 text-[10px] font-bold uppercase tracking-[0.15em]"
                    style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: 'var(--color-danger-400)',
                    }}
                >
                    403 · Access Denied
                </div>

                <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">
                    Unauthorized
                </h1>
                <p className="text-base leading-relaxed mb-10" style={{ color: 'var(--color-text-secondary)' }}>
                    You don't have permission to view this page. If you believe this is a mistake, please contact your administrator.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Button
                        variant="outline"
                        size="lg"
                        onClick={() => navigate(-1)}
                        icon={ArrowLeft}
                        className="w-full sm:w-auto"
                    >
                        Go Back
                    </Button>
                    <Button
                        variant="primary"
                        size="lg"
                        onClick={() => navigate('/dashboard')}
                        icon={Home}
                        className="w-full sm:w-auto"
                    >
                        Dashboard
                    </Button>
                </div>
            </div>
        </div>
    )
}
