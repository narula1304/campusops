import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    User,
    Mail,
    Phone,
    Bell,
    Lock,
    Save,
    ShieldCheck,
    Wrench,
    Loader2,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'
import { updateMe } from '../api/users'

const ROLE_STYLES = {
    ADMIN: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
    FACULTY: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    STUDENT: 'bg-green-500/15 text-green-400 border border-green-500/30',
    MAINTENANCE: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    SECURITY: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
}

function RoleBadge({ role }) {
    return (
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${ROLE_STYLES[role] ?? 'bg-slate-700 text-slate-300'}`}>
            {role}
        </span>
    )
}

function inputCls() {
    return 'w-full px-4 py-2.5 rounded-lg bg-white/8 border border-white/12 hover:border-white/20 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition'
}

function SectionCard({ title, icon: Icon, children }) {
    return (
        <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2.5 px-6 py-4 border-b border-white/8 bg-white/3">
                <Icon size={15} className="text-slate-400" />
                <h2 className="text-sm font-semibold text-white">{title}</h2>
            </div>
            <div className="px-6 py-5">{children}</div>
        </div>
    )
}

export default function UserProfilePage() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    // Profile edit state, seeded from auth context
    const [name, setName] = useState(user?.name ?? '')
    const [phone, setPhone] = useState(user?.phone ?? '')
    const [prefRealtime, setPrefRealtime] = useState(user?.prefRealtime ?? true)
    const [prefEmail, setPrefEmail] = useState(user?.prefEmail ?? false)
    const [prefSms, setPrefSms] = useState(user?.prefSms ?? false)
    const [saving, setSaving] = useState(false)

    // Password fields (visual only)
    const [oldPwd, setOldPwd] = useState('')
    const [newPwd, setNewPwd] = useState('')
    const [confirmPwd, setConfirmPwd] = useState('')

    const handleLogout = () => { logout(); navigate('/login') }

    const handleSave = async (e) => {
        e.preventDefault()
        if (!name.trim()) { toast.error('Name cannot be empty'); return }
        setSaving(true)
        try {
            await updateMe({
                name: name.trim(),
                phone: phone.trim() || undefined,
                prefRealtime,
                prefEmail,
                prefSms,
            })
            // Update localStorage cached user
            const stored = localStorage.getItem('campusops_user')
            if (stored) {
                try {
                    const parsed = JSON.parse(stored)
                    localStorage.setItem('campusops_user', JSON.stringify({
                        ...parsed,
                        name: name.trim(),
                        phone: phone.trim() || parsed.phone,
                        prefRealtime,
                        prefEmail,
                        prefSms,
                    }))
                } catch { /* ignore */ }
            }
            toast.success('Profile updated successfully!')
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

    const isStaff = ['MAINTENANCE', 'SECURITY', 'FACULTY', 'ADMIN'].includes(user?.role)

    return (
        <div className="min-h-screen bg-slate-900 flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-64 flex-1 min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-8 py-4">
                    <h1 className="text-xl font-semibold text-white">My Profile</h1>
                    <p className="text-sm text-slate-500 mt-0.5">Manage your account settings and preferences</p>
                </header>

                <div className="px-8 py-8 max-w-2xl space-y-6">

                    {/* ── Profile Card ─────────────────────────────────────────── */}
                    <SectionCard title="Account Info" icon={User}>
                        <div className="flex items-center gap-5 mb-6">
                            <div className="w-16 h-16 rounded-full bg-indigo-600/30 border-2 border-indigo-500/30 flex items-center justify-center shrink-0">
                                <span className="text-2xl font-bold text-indigo-300">
                                    {(user?.name ?? '?')[0].toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <p className="text-lg font-semibold text-white">{user?.name}</p>
                                <p className="text-sm text-slate-400">{user?.email}</p>
                                <div className="flex items-center gap-2 mt-2">
                                    <RoleBadge role={user?.role} />
                                    {user?.departmentId && (
                                        <span className="text-xs text-slate-500">Dept: {user.departmentId}</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-white/8 pt-4">
                            {user?.role === 'STUDENT' && user?.rollNo && (
                                <InfoRow label="Roll No" value={user.rollNo} />
                            )}
                            {isStaff && user?.employeeId && (
                                <InfoRow label="Employee ID" value={user.employeeId} />
                            )}
                            {user?.staffState && (
                                <InfoRow label="Staff State" value={user.staffState} />
                            )}
                        </div>
                    </SectionCard>

                    {/* ── Edit section ─────────────────────────────────────────── */}
                    <SectionCard title="Edit Profile" icon={Save}>
                        <form onSubmit={handleSave} className="space-y-4">
                            {/* Name */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                                    <User size={13} className="text-slate-500" /> Name
                                    <span className="text-indigo-400">*</span>
                                </label>
                                <input
                                    id="profile-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className={inputCls()}
                                    placeholder="Your full name"
                                />
                            </div>

                            {/* Phone */}
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                                    <Phone size={13} className="text-slate-500" /> Phone
                                    <span className="text-xs text-slate-600 ml-1">(optional)</span>
                                </label>
                                <input
                                    id="profile-phone"
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(e.target.value)}
                                    className={inputCls()}
                                    placeholder="+91 98765 43210"
                                />
                            </div>

                            {/* Notification preferences */}
                            <div className="flex flex-col gap-2.5">
                                <label className="text-sm font-medium text-slate-300 flex items-center gap-1.5">
                                    <Bell size={13} className="text-slate-500" /> Notification Preferences
                                </label>
                                <div className="space-y-2.5 pl-1">
                                    {[
                                        { id: 'pref-realtime', label: 'Real-time notifications', value: prefRealtime, set: setPrefRealtime },
                                        { id: 'pref-email', label: 'Email notifications', value: prefEmail, set: setPrefEmail },
                                        { id: 'pref-sms', label: 'SMS notifications', value: prefSms, set: setPrefSms },
                                    ].map(({ id, label, value, set }) => (
                                        <label key={id} htmlFor={id} className="flex items-center gap-3 cursor-pointer group">
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${value ? 'bg-indigo-600 border-indigo-500' : 'border-white/20 bg-white/5'}`}>
                                                {value && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                            <input id={id} type="checkbox" checked={value} onChange={(e) => set(e.target.checked)} className="sr-only" />
                                            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">{label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-2 border-t border-white/8">
                                <button
                                    id="profile-save-btn"
                                    type="submit"
                                    disabled={saving}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.99]"
                                >
                                    {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                                    {saving ? 'Saving…' : 'Save Changes'}
                                </button>
                            </div>
                        </form>
                    </SectionCard>

                    {/* ── Password Change ───────────────────────────────────────── */}
                    <SectionCard title="Change Password" icon={Lock}>
                        <form onSubmit={handlePasswordChange} className="space-y-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-medium text-slate-300">Current Password</label>
                                <input
                                    id="pwd-old"
                                    type="password"
                                    value={oldPwd}
                                    onChange={(e) => setOldPwd(e.target.value)}
                                    className={inputCls()}
                                    placeholder="••••••••"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-slate-300">New Password</label>
                                    <input
                                        id="pwd-new"
                                        type="password"
                                        value={newPwd}
                                        onChange={(e) => setNewPwd(e.target.value)}
                                        className={inputCls()}
                                        placeholder="••••••••"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5">
                                    <label className="text-sm font-medium text-slate-300">Confirm New</label>
                                    <input
                                        id="pwd-confirm"
                                        type="password"
                                        value={confirmPwd}
                                        onChange={(e) => setConfirmPwd(e.target.value)}
                                        className={inputCls()}
                                        placeholder="••••••••"
                                    />
                                </div>
                            </div>
                            <div className="pt-2 border-t border-white/8">
                                <button
                                    id="change-password-btn"
                                    type="submit"
                                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 hover:text-white text-sm font-medium transition-all"
                                >
                                    <Lock size={14} />
                                    Change Password
                                </button>
                            </div>
                        </form>
                    </SectionCard>
                </div>
            </main>
        </div>
    )
}

function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm text-slate-300 font-medium">{value ?? '—'}</p>
        </div>
    )
}
