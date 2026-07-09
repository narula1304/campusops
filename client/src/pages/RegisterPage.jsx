import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Zap, Loader2, AlertTriangle, UserPlus, Bell, Shield, Map } from 'lucide-react'
import { Input } from '../components/ui/Input'
import { Button } from '../components/ui/Button'

const FEATURES = [
    { icon: Bell,   text: 'Real-time incident alerts' },
    { icon: Shield, text: 'Priority-based response tracking' },
    { icon: Map,    text: 'Live campus heatmap' },
]

export default function RegisterPage() {
    const { registerUser } = useAuth()
    const navigate = useNavigate()

    const [form, setForm] = useState({
        name:     '',
        email:    '',
        password: '',
        role:     'STUDENT',
        rollNo:   '',
        year:     '',
        batch:    '',
        employeeId: '',
        designation: ''
    })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error,        setError]        = useState('')

    const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError('')
        setIsSubmitting(true)
        try {
            await registerUser(form)
            navigate('/dashboard')
        } catch (err) {
            setError(
                err?.response?.data?.error?.message ||
                err?.message ||
                'Registration failed. Please try again.'
            )
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div
            className="min-h-screen flex items-center justify-center p-5 relative overflow-hidden"
            style={{ background: 'var(--color-bg-base)' }}
        >
            {/* Background orbs */}
            <div className="absolute pointer-events-none" style={{ top: '-10%', left: '-10%', width: '45%', height: '45%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', animation: 'float 9s ease-in-out infinite' }} />
            <div className="absolute pointer-events-none" style={{ bottom: '-15%', right: '-10%', width: '50%', height: '50%', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', animation: 'float 11s ease-in-out infinite reverse' }} />

            <div className="w-full max-w-4xl relative z-10 animate-fade-up">
                <div
                    className="overflow-hidden rounded-3xl flex flex-col md:flex-row"
                    style={{
                        background: 'var(--surface-2)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        boxShadow: '0 32px 100px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
                    }}
                >
                    {/* ── Left branding panel ── */}
                    <div
                        className="md:w-5/12 p-10 flex flex-col justify-center relative overflow-hidden"
                        style={{
                            background: 'linear-gradient(145deg, #3730a3 0%, #4f46e5 40%, #6d28d9 100%)',
                        }}
                    >
                        {/* Mesh gradient overlay */}
                        <div className="absolute inset-0 pointer-events-none" style={{
                            background: 'radial-gradient(ellipse at 0% 0%, rgba(255,255,255,0.12) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(0,0,0,0.3) 0%, transparent 60%)',
                        }} />

                        {/* Dot grid texture */}
                        <div className="absolute inset-0 opacity-[0.06]" style={{
                            backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.9) 1px, transparent 1px)',
                            backgroundSize: '20px 20px',
                        }} />

                        <div className="relative z-10 text-center">
                            {/* Logo */}
                            <div
                                className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-8 mx-auto"
                                style={{
                                    background: 'rgba(255,255,255,0.15)',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    backdropFilter: 'blur(8px)',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
                                }}
                            >
                                <UserPlus size={30} className="text-white" />
                            </div>

                            <h1 className="text-3xl font-bold text-white tracking-tight mb-3">
                                Join CampusOps
                            </h1>
                            <p className="text-indigo-200 text-sm font-medium leading-relaxed max-w-xs mx-auto mb-10">
                                Sign up to report issues, track incidents, and keep your campus running smoothly.
                            </p>

                            {/* Feature list */}
                            <div className="space-y-3 text-left max-w-xs mx-auto">
                                {FEATURES.map(({ icon: Icon, text }) => (
                                    <div key={text} className="flex items-center gap-3">
                                        <div
                                            className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                            style={{ background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)' }}
                                        >
                                            <Icon size={14} className="text-indigo-200" />
                                        </div>
                                        <span className="text-sm text-indigo-100 font-medium">{text}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Right form panel ── */}
                    <div className="md:w-7/12 p-10 flex flex-col justify-center">
                        {/* Top accent line */}
                        <div className="h-px mb-8" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.4), transparent)' }} />

                        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                            Create your account
                        </h2>
                        <p className="text-sm mb-7" style={{ color: 'var(--color-text-secondary)' }}>
                            Fill in your details to get started.
                        </p>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid grid-cols-1 gap-4">
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                                        Role
                                    </label>
                                    <select
                                        name="role"
                                        value={form.role}
                                        onChange={handleChange}
                                        className="w-full px-4 py-2.5 rounded-xl text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary-500/20"
                                        style={{
                                            background: 'rgba(0,0,0,0.2)',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            color: 'var(--color-text-primary)'
                                        }}
                                    >
                                        <option value="STUDENT" style={{background: '#1e1b4b'}}>Student</option>
                                        <option value="FACULTY" style={{background: '#1e1b4b'}}>Faculty</option>
                                    </select>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                                        Full Name
                                    </label>
                                    <Input
                                        name="name"
                                        type="text"
                                        required
                                        value={form.name}
                                        onChange={handleChange}
                                        placeholder="Jane Doe"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                                        Email Address
                                    </label>
                                    <Input
                                        name="email"
                                        type="email"
                                        required
                                        value={form.email}
                                        onChange={handleChange}
                                        placeholder="jane@campus.edu"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="block text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                                        Password
                                    </label>
                                    <Input
                                        name="password"
                                        type="password"
                                        required
                                        value={form.password}
                                        onChange={handleChange}
                                        placeholder="Min. 8 characters"
                                    />
                                </div>
                            </div>

                            {/* Optional / Role-specific section */}
                            <div
                                className="pt-5 mt-2"
                                style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                            >
                                <div className="flex items-center gap-2 mb-4">
                                    <Zap size={12} className="text-primary-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--color-text-muted)' }}>
                                        {form.role === 'STUDENT' ? 'Optional Student Details' : 'Optional Staff Details'}
                                    </span>
                                </div>
                                {form.role === 'STUDENT' ? (
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input
                                            name="rollNo"
                                            type="text"
                                            value={form.rollNo}
                                            onChange={handleChange}
                                            placeholder="Roll No."
                                            size="sm"
                                        />
                                        <Input
                                            name="batch"
                                            type="text"
                                            value={form.batch}
                                            onChange={handleChange}
                                            placeholder="Batch (e.g. A)"
                                            size="sm"
                                        />
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-2 gap-3">
                                        <Input
                                            name="employeeId"
                                            type="text"
                                            value={form.employeeId}
                                            onChange={handleChange}
                                            placeholder="Employee ID"
                                            size="sm"
                                        />
                                        <Input
                                            name="designation"
                                            type="text"
                                            value={form.designation}
                                            onChange={handleChange}
                                            placeholder="Designation"
                                            size="sm"
                                        />
                                    </div>
                                )}
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
                                type="submit"
                                variant="primary"
                                size="lg"
                                disabled={isSubmitting}
                                isLoading={isSubmitting}
                                className="w-full justify-center mt-2"
                                icon={isSubmitting ? null : UserPlus}
                            >
                                {isSubmitting ? 'Creating Account…' : 'Create Account'}
                            </Button>
                        </form>

                        <p className="mt-6 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Already have an account?{' '}
                            <Link
                                to="/login"
                                className="font-semibold transition-colors"
                                style={{ color: 'var(--color-primary-400)' }}
                                onMouseEnter={e => e.target.style.color = 'var(--color-primary-300)'}
                                onMouseLeave={e => e.target.style.color = 'var(--color-primary-400)'}
                            >
                                Sign in →
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
