import { Link, useNavigate } from 'react-router-dom'
import {
    Home,
    FileText,
    Plus,
    LogOut,
    User,
    ShieldCheck,
    Wrench,
    Bell,
    ClipboardList,
    Users,
    AlertTriangle,
} from 'lucide-react'

// ── Role-specific nav items ───────────────────────────────────────────────────
export function buildNavItems(role) {
    const base = [
        { label: 'Dashboard', to: '/dashboard', icon: Home },
        { label: 'My Incidents', to: '/incidents', icon: FileText },
    ]

    if (role === 'STUDENT' || role === 'FACULTY') {
        base.push({ label: 'Report Incident', to: '/incidents/new', icon: Plus })
    }

    if (role === 'MAINTENANCE' || role === 'SECURITY') {
        base.push({ label: 'Assigned to Me', to: '/incidents?assignedToMe=true', icon: ClipboardList })
    }

    if (role === 'ADMIN') {
        base.push(
            { label: 'All Incidents', to: '/incidents', icon: ClipboardList },
            { label: 'Assign Incidents', to: '/incidents?tab=assign', icon: Users },
            { label: 'Broadcast Alert', to: '/alerts/new', icon: Bell },
        )
    }

    return base
}

// ── Role icon ─────────────────────────────────────────────────────────────────
export function RoleIcon({ role }) {
    const map = {
        ADMIN: { icon: ShieldCheck, color: 'text-indigo-400' },
        FACULTY: { icon: User, color: 'text-blue-400' },
        STUDENT: { icon: User, color: 'text-green-400' },
        MAINTENANCE: { icon: Wrench, color: 'text-orange-400' },
        SECURITY: { icon: ShieldCheck, color: 'text-yellow-400' },
    }
    const { icon: Icon, color } = map[role] ?? { icon: User, color: 'text-slate-400' }
    return <Icon size={16} className={color} />
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
export default function Sidebar({ user, onLogout }) {
    const navItems = buildNavItems(user?.role)
    const navigate = useNavigate()

    return (
        <aside className="fixed top-0 left-0 h-screen w-64 bg-slate-900 border-r border-white/8 flex flex-col z-40">
            {/* Logo */}
            <div className="px-6 py-5 border-b border-white/8">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shrink-0">
                        <AlertTriangle size={16} className="text-white" />
                    </div>
                    <span className="text-white font-bold text-lg tracking-tight">CampusOps</span>
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {navItems.map(({ label, to, icon: Icon }) => (
                    <Link
                        key={label}
                        to={to}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/8 transition-all duration-150 group"
                    >
                        <Icon size={17} className="shrink-0 group-hover:text-indigo-400 transition-colors" />
                        <span className="text-sm font-medium">{label}</span>
                    </Link>
                ))}
            </nav>

            {/* User info + logout */}
            <div className="px-3 py-4 border-t border-white/8 space-y-1">
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5">
                    <div className="w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center shrink-0">
                        <RoleIcon role={user?.role} />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{user?.name}</p>
                        <p className="text-xs text-slate-500 truncate">{user?.role}</p>
                    </div>
                </div>

                <button
                    onClick={onLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-red-500/8 transition-all duration-150"
                >
                    <LogOut size={17} className="shrink-0" />
                    <span className="text-sm font-medium">Sign out</span>
                </button>
            </div>
        </aside>
    )
}
