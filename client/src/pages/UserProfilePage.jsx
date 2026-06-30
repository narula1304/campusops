import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { User, Phone, Bell, Lock, Save, BellRing, BellOff, Mail, MessageSquare, CheckCircle2 } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { updateMe } from '../api/users'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'

// ── Role styling ────────────────────────────────────────────────────────────────
const ROLE_META = {
    ADMIN:       { label: 'Admin',       grad: 'from-violet-500 to-purple-600',  bg: 'rgba(168,85,247,0.12)',  border: 'rgba(168,85,247,0.3)',  text: '#c084fc' },
    FACULTY:     { label: 'Faculty',     grad: 'from-sky-500 to-blue-600',       bg: 'rgba(14,165,233,0.12)',  border: 'rgba(14,165,233,0.3)',  text: '#38bdf8' },
    STUDENT:     { label: 'Student',     grad: 'from-emerald-500 to-teal-600',   bg: 'rgba(16,185,129,0.12)',  border: 'rgba(16,185,129,0.3)',  text: '#34d399' },
    MAINTENANCE: { label: 'Maintenance', grad: 'from-amber-500 to-orange-600',   bg: 'rgba(245,158,11,0.12)',  border: 'rgba(245,158,11,0.3)',  text: '#fbbf24' },
    SECURITY:    { label: 'Security',    grad: 'from-orange-500 to-red-600',     bg: 'rgba(239,68,68,0.12)',   border: 'rgba(239,68,68,0.3)',   text: '#f87171' },
}

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ id, label, description, value, onChange, icon: Icon }) {
    return (
        <label
            htmlFor={id}
            className="flex items-center justify-between gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200 group"
            style={{
                background: value ? 'rgba(99,102,241,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${value ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)'}`,
            }}
        >
            <div className="flex items-center gap-3">
                <div
                    className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200"
                    style={{
                        background: value ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${value ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.07)'}`,
                    }}
                >
                    <Icon size={15} style={{ color: value ? 'var(--color-primary-400)' : 'var(--color-text-muted)' }} />
                </div>
                <div>
                    <p className="text-sm font-semibold" style={{ color: value ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{label}</p>
                    {description && <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{description}</p>}
                </div>
            </div>

            {/* Toggle pill */}
            <div className="relative flex-shrink-0">
                <input id={id} type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
                <div
                    className="w-11 h-6 rounded-full transition-all duration-300 relative"
                    style={{ background: value ? 'var(--color-primary-500)' : 'rgba(255,255,255,0.1)' }}
                >
                    <div
                        className="absolute top-0.5 w-5 h-5 rounded-full shadow-md transition-all duration-300"
                        style={{
                            left: value ? '22px' : '2px',
                            background: '#fff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                    />
                </div>
            </div>
        </label>
    )
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children }) {
    return (
        <div
            className="overflow-hidden rounded-2xl"
            style={{
                background: 'var(--surface-2)',
                border: '1px solid rgba(255,255,255,0.05)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            }}
        >
            <div
                className="px-6 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.015)' }}
            >
                <h2 className="text-sm font-semibold text-white">{title}</h2>
            </div>
            <div className="px-6 py-6">{children}</div>
        </div>
    )
}

// ── InfoRow ────────────────────────────────────────────────────────────────────
function InfoRow({ label, value }) {
    return (
        <div className="flex flex-col gap-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
            <p className="text-sm font-medium text-white">{value ?? '—'}</p>
        </div>
    )
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function UserProfilePage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const [name,         setName]         = useState(user?.name ?? '')
    const [phone,        setPhone]        = useState(user?.phone ?? '')
    const [prefRealtime, setPrefRealtime] = useState(user?.prefRealtime ?? true)
    const [prefEmail,    setPrefEmail]    = useState(user?.prefEmail ?? false)
    const [prefSms,      setPrefSms]      = useState(user?.prefSms ?? false)
    const [saving,       setSaving]       = useState(false)

    const [oldPwd,     setOldPwd]     = useState('')
    const [newPwd,     setNewPwd]     = useState('')
    const [confirmPwd, setConfirmPwd] = useState('')

    const handleLogout = () => { logout(); navigate('/login') }

    const role   = user?.role
    const roleMeta = ROLE_META[role] ?? ROLE_META.STUDENT
    const initials = (user?.name ?? '?')[0].toUpperCase()
    const isStaff = ['MAINTENANCE', 'SECURITY', 'FACULTY', 'ADMIN'].includes(role)

    const handleSave = async (e) => {
        e.preventDefault()
        if (!name.trim()) { toast.error('Name cannot be empty'); return }
        setSaving(true)
        try {
            await updateMe({ name: name.trim(), phone: phone.trim() || undefined, prefRealtime, prefEmail, prefSms })
            const stored = localStorage.getItem('campusops_user')
            if (stored) {
                try {
                    const parsed = JSON.parse(stored)
                    localStorage.setItem('campusops_user', JSON.stringify({ ...parsed, name: name.trim(), phone: phone.trim() || parsed.phone, prefRealtime, prefEmail, prefSms }))
                } catch { /* ignore */ }
            }
            toast.success('Profile updated!')
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to update profile')
        } finally {
            setSaving(false)
        }
    }

    const handlePasswordChange = (e) => {
        e.preventDefault()
        toast('Password change coming soon', { icon: '🔐' })
    }

    return (
        <div className="min-h-screen flex" style={{ background: 'transparent' }}>
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 min-h-screen flex flex-col">

                {/* ── Hero Profile Header ── */}
                <div className="relative overflow-hidden" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {/* Gradient backdrop */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background: `linear-gradient(135deg, ${roleMeta.bg.replace('0.12', '0.15')} 0%, transparent 70%)`,
                        }}
                    />
                    <div className="absolute inset-0 pointer-events-none" style={{
                        background: 'radial-gradient(ellipse 60% 80% at 0% 0%, rgba(99,102,241,0.08), transparent)',
                    }} />

                    <div className="relative px-10 py-10 flex items-end gap-8">
                        {/* Avatar ring */}
                        <div className="relative flex-shrink-0">
                            <div
                                className={`w-24 h-24 rounded-3xl flex items-center justify-center text-4xl font-black text-white bg-gradient-to-br ${roleMeta.grad}`}
                                style={{ boxShadow: `0 8px 32px -8px ${roleMeta.text}60, inset 0 1px 0 rgba(255,255,255,0.15)` }}
                            >
                                {initials}
                            </div>
                            {/* Online dot */}
                            <span className="absolute bottom-1 right-1 flex h-4 w-4">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50" style={{ background: roleMeta.text }} />
                                <span className="relative inline-flex rounded-full h-4 w-4 border-2 border-[#060d1a]" style={{ background: roleMeta.text }} />
                            </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                                <h1 className="text-3xl font-bold text-white tracking-tight leading-none">{user?.name}</h1>
                                <span
                                    className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border"
                                    style={{ background: roleMeta.bg, borderColor: roleMeta.border, color: roleMeta.text }}
                                >
                                    {roleMeta.label}
                                </span>
                            </div>
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{user?.email}</p>

                            {/* Meta chips */}
                            <div className="flex flex-wrap gap-2 mt-3">
                                {user?.rollNo && (
                                    <span className="chip">Roll No: {user.rollNo}</span>
                                )}
                                {isStaff && user?.employeeId && (
                                    <span className="chip">EMP: {user.employeeId}</span>
                                )}
                                {user?.staffState && (
                                    <span className="chip">{user.staffState}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="px-10 py-8 space-y-6 max-w-3xl">

                    {/* ── Edit Profile ── */}
                    <Section title="Edit Profile">
                        <form onSubmit={handleSave} className="space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                                        Full Name *
                                    </label>
                                    <Input
                                        id="profile-name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Your full name"
                                        icon={User}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>
                                        Phone (optional)
                                    </label>
                                    <Input
                                        id="profile-phone"
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        placeholder="+91 98765 43210"
                                        icon={Phone}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <Button
                                    id="profile-save-btn"
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    disabled={saving}
                                    isLoading={saving}
                                    icon={saving ? null : Save}
                                >
                                    {saving ? 'Saving…' : 'Save Changes'}
                                </Button>
                            </div>
                        </form>
                    </Section>

                    {/* ── Notification Preferences ── */}
                    <Section title="Notification Preferences">
                        <div className="space-y-2.5">
                            <Toggle
                                id="pref-realtime"
                                label="Real-time notifications"
                                description="Instant alerts via the app"
                                value={prefRealtime}
                                onChange={setPrefRealtime}
                                icon={BellRing}
                            />
                            <Toggle
                                id="pref-email"
                                label="Email notifications"
                                description="Updates sent to your inbox"
                                value={prefEmail}
                                onChange={setPrefEmail}
                                icon={Mail}
                            />
                            <Toggle
                                id="pref-sms"
                                label="SMS notifications"
                                description="Text messages to your phone"
                                value={prefSms}
                                onChange={setPrefSms}
                                icon={MessageSquare}
                            />
                        </div>
                    </Section>

                    {/* ── Change Password ── */}
                    <Section title="Security">
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Current Password</label>
                                <Input id="pwd-old" type="password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} placeholder="••••••••" icon={Lock} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>New Password</label>
                                    <Input id="pwd-new" type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} placeholder="••••••••" icon={Lock} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>Confirm New</label>
                                    <Input id="pwd-confirm" type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} placeholder="••••••••" icon={Lock} />
                                </div>
                            </div>
                            <div className="flex justify-start pt-1">
                                <Button id="change-password-btn" type="submit" variant="outline" size="sm" icon={Lock}>
                                    Change Password
                                </Button>
                            </div>
                        </form>
                    </Section>
                </div>
            </main>
        </div>
    )
}
