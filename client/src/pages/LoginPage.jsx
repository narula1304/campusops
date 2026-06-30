import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Card, CardContent } from '../components/ui/Card'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'
import { Zap, LogIn, AlertTriangle, Lock, Mail } from 'lucide-react'

export default function LoginPage() {
    const { login } = useAuth()
    const navigate  = useNavigate()

    const [email,       setEmail]       = useState('')
    const [password,    setPassword]    = useState('')
    const [isSubmitting,setIsSubmitting]= useState(false)
    const [error,       setError]       = useState('')

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setIsSubmitting(true)
        try {
            await login(email, password)
            navigate('/dashboard')
        } catch (err) {
            setError(
                err?.response?.data?.error?.message ||
                err?.message ||
                'Login failed. Please try again.'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden"
            style={{ background: 'var(--color-bg-base)' }}
        >
            {/* ── Animated background orbs ── */}
            <div
                className="absolute pointer-events-none"
                style={{
                    top: '-15%', left: '-15%',
                    width: '50%', height: '50%',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
                    animation: 'float 8s ease-in-out infinite',
                }}
            />
            <div
                className="absolute pointer-events-none"
                style={{
                    bottom: '-20%', right: '-15%',
                    width: '55%', height: '55%',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
                    animation: 'float 10s ease-in-out infinite reverse',
                }}
            />
            <div
                className="absolute pointer-events-none"
                style={{
                    top: '40%', right: '20%',
                    width: '30%', height: '30%',
                    borderRadius: '50%',
                    background: 'radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)',
                    animation: 'float 12s ease-in-out infinite',
                    animationDelay: '2s',
                }}
            />

            <div className="w-full max-w-sm relative z-10 animate-fade-up">
                {/* ── Brand header ── */}
                <div className="mb-8 text-center flex flex-col items-center">
                    {/* System tag */}
                    <div
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-6 text-[10px] font-bold uppercase tracking-[0.15em]"
                        style={{
                            background: 'rgba(99,102,241,0.1)',
                            border: '1px solid rgba(99,102,241,0.25)',
                            color: 'var(--color-primary-300)',
                        }}
                    >
                        <span className="dot-live" />
                        Campus Operations System
                    </div>

                    {/* Logo icon */}
                    <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
                        style={{
                            background: 'linear-gradient(135deg, #6366f1, #4338ca)',
                            boxShadow: '0 8px 32px -8px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.2)',
                            border: '1px solid rgba(255,255,255,0.1)',
                        }}
                    >
                        <Zap size={28} className="text-white drop-shadow-sm" />
                    </div>

                    <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>
                        Welcome back
                    </h1>
                    <p className="text-sm mt-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Sign in to manage your campus
                    </p>
                </div>

                {/* ── Card ── */}
                <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.02) 100%)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        boxShadow: '0 24px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.07)',
                    }}
                >
                    {/* Top gradient line */}
                    <div
                        className="h-[1px] w-full"
                        style={{ background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)' }}
                    />

                    <div className="p-7">
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="space-y-1.5">
                                <label htmlFor="email" className="block text-xs font-semibold tracking-wide"
                                    style={{ color: 'var(--color-text-secondary)' }}>
                                    Email Address
                                </label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@campus.edu"
                                    icon={Mail}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label htmlFor="password" className="block text-xs font-semibold tracking-wide"
                                    style={{ color: 'var(--color-text-secondary)' }}>
                                    Password
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    icon={Lock}
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div
                                    className="flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium"
                                    style={{
                                        background: 'rgba(239,68,68,0.08)',
                                        border: '1px solid rgba(239,68,68,0.2)',
                                        color: 'var(--color-danger-400)',
                                        animation: 'fadeDown 200ms cubic-bezier(.16,1,.3,1)',
                                    }}
                                >
                                    <AlertTriangle size={15} className="flex-shrink-0" />
                                    {error}
                                </div>
                            )}

                            <Button
                                id="login-submit-btn"
                                type="submit"
                                variant="primary"
                                size="lg"
                                className="w-full justify-center mt-1"
                                disabled={isSubmitting}
                                isLoading={isSubmitting}
                                icon={isSubmitting ? null : LogIn}
                            >
                                {isSubmitting ? 'Signing in…' : 'Sign in'}
                            </Button>
                        </form>

                        {/* Divider */}
                        <div className="my-6 flex items-center gap-3">
                            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                New to CampusOps?
                            </span>
                            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
                        </div>

                        <p className="text-center text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                            <Link
                                to="/register"
                                className="font-semibold transition-colors"
                                style={{ color: 'var(--color-primary-400)' }}
                                onMouseEnter={e => e.target.style.color = 'var(--color-primary-300)'}
                                onMouseLeave={e => e.target.style.color = 'var(--color-primary-400)'}
                            >
                                Create an account →
                            </Link>
                        </p>
                    </div>
                </div>

                {/* Footer note */}
                <p className="text-center text-xs mt-6" style={{ color: 'var(--color-text-muted)' }}>
                    Secure sign-in · CampusOps v2.0
                </p>
            </div>
        </div>
    )
}
