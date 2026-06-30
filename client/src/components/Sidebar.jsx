import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import PanicButton from './PanicButton'
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
    BarChart3,
    Map,
    Building2,
    ChevronRight,
    Zap,
} from 'lucide-react'

// ── Role-specific nav items ───────────────────────────────────────────────────
export function buildNavItems(role) {
    const base = [
        { label: 'Dashboard',    to: '/dashboard',  icon: Home },
        { label: 'My Incidents', to: '/incidents',   icon: FileText },
        { label: 'My Profile',   to: '/profile',     icon: User },
    ]

    if (role === 'STUDENT' || role === 'FACULTY') {
        base.push({ label: 'Report Incident', to: '/incidents/new', icon: Plus })
    }

    if (role === 'MAINTENANCE' || role === 'SECURITY') {
        base.push({ label: 'My Queue', to: '/staff-dashboard', icon: ClipboardList })
    }

    if (role === 'ADMIN') {
        base.push(
            { label: 'All Incidents',    to: '/incidents',      icon: ClipboardList, dividerBefore: true },
            { label: 'Staff Management', to: '/staff',           icon: Users },
            { label: 'Create Department',to: '/departments/new', icon: Building2 },
            { label: 'Analytics',        to: '/analytics',       icon: BarChart3 },
            { label: 'Heatmap',          to: '/heatmap',         icon: Map },
            { label: 'Broadcast Alert',  to: '/alerts/new',      icon: Bell },
        )
    }

    return base
}

// ── Role display map ──────────────────────────────────────────────────────────
export function RoleIcon({ role }) {
    const map = {
        ADMIN:       { icon: ShieldCheck, color: 'text-primary-400' },
        FACULTY:     { icon: User,        color: 'text-info-500' },
        STUDENT:     { icon: User,        color: 'text-success-500' },
        MAINTENANCE: { icon: Wrench,      color: 'text-warning-500' },
        SECURITY:    { icon: ShieldCheck, color: 'text-warning-500' },
    }
    const { icon: Icon, color } = map[role] ?? { icon: User, color: 'text-text-muted' }
    return <Icon size={16} className={color} />
}

const roleColors = {
    ADMIN:       { bg: 'from-violet-500 to-purple-600',   badge: 'bg-violet-500/15 text-violet-300 border-violet-500/25' },
    FACULTY:     { bg: 'from-sky-500 to-blue-600',        badge: 'bg-sky-500/15 text-sky-300 border-sky-500/25' },
    STUDENT:     { bg: 'from-emerald-500 to-teal-600',    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' },
    MAINTENANCE: { bg: 'from-amber-500 to-orange-600',    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/25' },
    SECURITY:    { bg: 'from-orange-500 to-red-600',      badge: 'bg-orange-500/15 text-orange-300 border-orange-500/25' },
}

// ── Sidebar ────────────────────────────────────────────────────────────────────
export default function Sidebar({ user, onLogout }) {
    const navItems = buildNavItems(user?.role)
    const location = useLocation()
    const role     = user?.role
    const colors   = roleColors[role] ?? roleColors.STUDENT

    return (
        <>
            <motion.aside
                initial={{ x: -56, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="
                    fixed left-0 top-0 bottom-0
                    w-[17rem]
                    flex flex-col
                    z-50
                    overflow-hidden
                "
                style={{
                    background: 'linear-gradient(180deg, #08101e 0%, #060d1a 100%)',
                    borderRight: '1px solid rgba(255,255,255,0.05)',
                }}
            >
                {/* Ambient top glow */}
                <div
                    className="absolute top-0 left-0 right-0 h-64 pointer-events-none"
                    style={{
                        background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(99,102,241,0.18), transparent)',
                    }}
                />

                {/* Subtle dot grid texture */}
                <div
                    className="absolute inset-0 pointer-events-none opacity-[0.025]"
                    style={{
                        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)',
                        backgroundSize: '24px 24px',
                    }}
                />

                {/* ── Logo ── */}
                <div className="relative px-6 pt-7 pb-6">
                    <div className="flex items-center gap-3.5">
                        {/* Icon */}
                        <div
                            className="relative h-11 w-11 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0"
                            style={{
                                background: 'linear-gradient(135deg, #6366f1, #4338ca)',
                                boxShadow: '0 4px 20px -4px rgba(99,102,241,0.6), inset 0 1px 0 rgba(255,255,255,0.2)',
                            }}
                        >
                            <Zap size={20} className="text-white drop-shadow-sm" />
                        </div>
                        <div>
                            <h2 className="font-bold text-white text-lg tracking-tight leading-none">
                                CampusOps
                            </h2>
                            <p className="text-[10px] text-zinc-500 mt-0.5 tracking-widest uppercase font-medium">
                                Incident System
                            </p>
                        </div>
                    </div>
                    {/* Bottom separator with gradient */}
                    <div className="mt-5 h-px" style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.3), rgba(255,255,255,0.04), transparent)' }} />
                </div>

                {/* ── Navigation ── */}
                <nav className="flex-1 px-3 pb-4 overflow-y-auto space-y-0.5">
                    {navItems.map(({ label, to, icon: Icon, dividerBefore }) => {
                        const active = location.pathname === to

                        return (
                            <div key={label}>
                                {dividerBefore && (
                                    <div className="mx-3 my-3 flex items-center gap-2">
                                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                        <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-zinc-600">Admin</span>
                                        <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.05)' }} />
                                    </div>
                                )}
                                <Link
                                    to={to}
                                    className={`
                                        relative flex items-center gap-3 rounded-xl px-3 py-2.5
                                        transition-all duration-200 group
                                        ${active
                                            ? 'text-white'
                                            : 'text-zinc-400 hover:text-zinc-200'
                                        }
                                    `}
                                    style={active ? {
                                        background: 'rgba(99,102,241,0.14)',
                                        border: '1px solid rgba(99,102,241,0.18)',
                                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                                    } : {
                                        border: '1px solid transparent',
                                    }}
                                >
                                    {/* Active left bar */}
                                    {active && (
                                        <motion.div
                                            layoutId="activeBar"
                                            className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
                                            style={{ background: 'linear-gradient(180deg, #818cf8, #6366f1)' }}
                                        />
                                    )}

                                    {/* Icon box */}
                                    <div
                                        className={`
                                            h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0
                                            transition-all duration-200
                                            ${active
                                                ? 'text-white'
                                                : 'text-zinc-500 group-hover:text-zinc-300'
                                            }
                                        `}
                                        style={active ? {
                                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                                            boxShadow: '0 2px 8px -2px rgba(99,102,241,0.5)',
                                        } : {
                                            background: 'rgba(255,255,255,0.03)',
                                        }}
                                    >
                                        <Icon size={15} />
                                    </div>

                                    {/* Label */}
                                    <span className={`flex-1 text-sm font-medium ${active ? 'text-white' : 'group-hover:text-white'} transition-colors`}>
                                        {label}
                                    </span>

                                    {active && (
                                        <ChevronRight size={14} className="text-primary-400 opacity-70" />
                                    )}

                                    {/* Hover background */}
                                    {!active && (
                                        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                                            style={{ background: 'rgba(255,255,255,0.025)' }}
                                        />
                                    )}
                                </Link>
                            </div>
                        )
                    })}
                </nav>

                {/* ── User Card ── */}
                <div className="p-3 pb-5">
                    {/* Card top separator */}
                    <div className="mb-3 h-px mx-2" style={{ background: 'rgba(255,255,255,0.05)' }} />

                    <div
                        className="rounded-2xl p-3.5"
                        style={{
                            background: 'rgba(255,255,255,0.025)',
                            border: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div
                                className={`h-10 w-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 bg-gradient-to-br ${colors.bg}`}
                                style={{ boxShadow: '0 2px 10px -2px rgba(0,0,0,0.4)' }}
                            >
                                {user?.name?.charAt(0)?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-white text-sm truncate leading-snug">
                                    {user?.name}
                                </p>
                                <span
                                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${colors.badge}`}
                                >
                                    {user?.role}
                                </span>
                            </div>
                        </div>

                        {/* Logout */}
                        <button
                            onClick={onLogout}
                            className="
                                mt-3 w-full rounded-xl py-2.5 flex items-center justify-center gap-2
                                text-xs font-semibold tracking-wide uppercase
                                transition-all duration-200
                                text-zinc-500
                                hover:text-red-400
                                group
                            "
                            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}
                        >
                            <LogOut size={13} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </motion.aside>

            <PanicButton role={user?.role} />
        </>
    )
}
