import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    ArrowLeft,
    Send,
    Paperclip,
    Loader2,
    MessageSquare,
    Info,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import SLACountdown from '../components/SLACountdown'
import { useAuth } from '../context/AuthContext'
import { getIncident } from '../api/incidents'
import client from '../api/client'
import { uploadToCloudinary } from '../utils/uploadToCloudinary'
import { Badge } from '../components/ui/Badge'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'

// ── Badge helpers ──────────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
    const variantMap = {
        CRITICAL: 'danger',
        HIGH: 'warning',
        MEDIUM: 'info',
        LOW: 'success',
    }
    return (
        <Badge variant={variantMap[priority] || 'neutral'} className="px-2 py-0.5">
            {priority}
        </Badge>
    )
}
function StatusBadge({ status }) {
    const variantMap = {
        OPEN: 'info',
        IN_PROGRESS: 'primary',
        RESOLVED: 'success',
        ESCALATED: 'danger',
        REOPENED: 'warning',
    }
    return (
        <Badge variant={variantMap[status] || 'neutral'} className="px-2 py-0.5">
            {status?.replace('_', ' ')}
        </Badge>
    )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
    'bg-primary-600', 'bg-violet-600', 'bg-success-600',
    'bg-danger-600', 'bg-warning-600', 'bg-info-600', 'bg-pink-600',
]
function avatarColor(name = '') {
    let hash = 0
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function Avatar({ name, size = 'sm' }) {
    const initial = (name ?? '?')[0].toUpperCase()
    const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
    return (
        <div className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm border border-black/10`}>
            {initial}
        </div>
    )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-surface-hover ${className}`} />
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine }) {
    const time = msg.createdAt
        ? new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : ''

    return (
        <div className={`flex gap-3 w-full ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
            <Avatar name={msg.sender?.name ?? msg.senderName ?? '?'} />
            <div className={`flex flex-col gap-1 max-w-[75%] lg:max-w-[60%] ${isMine ? 'items-end' : 'items-start'}`}>
                <div className="flex items-baseline gap-2 px-1">
                    <span className={`text-xs font-bold ${isMine ? 'text-primary-400' : 'text-text-primary'}`}>
                        {isMine ? 'You' : (msg.sender?.name ?? msg.senderName ?? 'Unknown')}
                    </span>
                    <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">{msg.sender?.role ?? msg.senderRole}</span>
                    <span className="text-[10px] font-medium text-text-muted">{time}</span>
                </div>

                <div
                    className={`px-4 py-3 text-sm leading-relaxed break-words ${
                        isMine
                            ? 'text-white rounded-2xl rounded-tr-sm'
                            : 'text-white rounded-2xl rounded-tl-sm'
                    }`}
                    style={isMine
                        ? {
                            background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
                            boxShadow: '0 4px 16px -4px rgba(99,102,241,0.4)',
                        }
                        : {
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            boxShadow: '0 2px 12px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
                            backdropFilter: 'blur(8px)',
                            color: 'var(--color-text-primary)',
                        }
                    }
                >
                    {msg.text}
                    {msg.attachmentUrl && (
                        <a
                            href={msg.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mt-3 px-3 py-2 rounded-lg flex items-center gap-2 text-xs font-medium transition-colors"
                            style={isMine
                                ? { background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }
                                : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--color-text-secondary)' }
                            }
                        >
                            <Paperclip size={14} />
                            View Attachment
                        </a>
                    )}
                </div>
            </div>
        </div>
    )
}

// ── Incident summary panel ────────────────────────────────────────────────────
function IncidentPanel({ incidentId }) {
    const [incident, setIncident] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const data = await getIncident(incidentId)
                if (!cancelled) setIncident(data)
            } catch { /* silent */ }
            finally { if (!cancelled) setLoading(false) }
        })()
        return () => { cancelled = true }
    }, [incidentId])

    const deadline = incident?.sla?.deadlineAt ?? incident?.slaDeadlineAt ?? null

    return (
        <aside
            className="w-80 shrink-0 flex-col hidden lg:flex"
            style={{
                background: 'var(--color-bg-base)',
                borderLeft: '1px solid rgba(255,255,255,0.05)',
            }}
        >
            <div className="px-6 py-5 border-b border-border-subtle bg-surface-hover/50 flex items-center gap-2">
                <Info size={16} className="text-text-muted" />
                <h2 className="text-xs font-bold text-text-secondary uppercase tracking-widest">Incident Summary</h2>
            </div>
            <div className="px-6 py-6 space-y-6 overflow-y-auto flex-1">
                {loading ? (
                    <div className="space-y-4">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-6 w-full" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-28" />
                    </div>
                ) : incident ? (
                    <>
                        <div>
                            <p className="text-xs font-bold font-mono text-primary-500 mb-1">
                                #{incident.incidentNumber ?? '—'}
                            </p>
                            <p className="text-base font-bold text-text-primary leading-snug">
                                {incident.title}
                            </p>
                        </div>
                        
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge status={incident.status} />
                            <PriorityBadge priority={incident.priority} />
                        </div>
                        
                        <div className="space-y-5 pt-5 border-t border-border-subtle">
                            <InfoRow label="Category" value={incident.category} />
                            <InfoRow
                                label="Assigned To"
                                value={incident.assignedTo?.name ?? (incident.assignedToId ? 'Assigned' : 'Unassigned')}
                            />
                            <div className="bg-surface p-4 rounded-xl border border-border-subtle">
                                <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-2">SLA Status</p>
                                <SLACountdown deadline={deadline} />
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-10 bg-surface-hover/30 rounded-xl border border-border-subtle">
                        <p className="text-text-muted text-sm font-medium">Could not load incident details.</p>
                    </div>
                )}
            </div>
        </aside>
    )
}

function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-xs font-bold text-text-secondary uppercase tracking-widest mb-1">{label}</p>
            <p className="text-sm font-medium text-text-primary">{value ?? '—'}</p>
        </div>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
    const { id: incidentId } = useParams()
    const navigate = useNavigate()
    const { user, logout, socket } = useAuth()

    const [chatRoomId, setChatRoomId] = useState(null)
    const [messages, setMessages] = useState([])
    const [historyLoading, setHistoryLoading] = useState(true)

    const [inputText, setInputText] = useState('')
    const [sending, setSending] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [typingIndicator, setTypingIndicator] = useState('')

    const bottomRef = useRef(null)
    const typingTimerRef = useRef(null)
    const fileInputRef = useRef(null)

    const handleLogout = () => { logout(); navigate('/login') }

    // ── Fetch history ──────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setHistoryLoading(true)
            try {
                const res = await client.get(`/incidents/${incidentId}/chat`)
                if (!cancelled) {
                    setChatRoomId(res.data?.chatRoomId ?? null)
                    setMessages(res.data?.messages ?? [])
                }
            } catch {
                if (!cancelled) setMessages([])
            } finally {
                if (!cancelled) setHistoryLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [incidentId])

    // ── Auto-scroll to bottom ──────────────────────────────────────────────────
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, typingIndicator])

    // ── Socket join/leave + real-time events ───────────────────────────────────
    useEffect(() => {
        if (!socket) return

        socket.emit('join_chat', incidentId)

        const onMessage = (msg) => {
            setMessages((prev) => {
                // Deduplicate by id if server sends back our own message
                if (msg.id && prev.some((m) => m.id === msg.id)) return prev
                return [...prev, msg]
            })
        }

        const onTyping = ({ senderName }) => {
            if (senderName === user?.name) return
            setTypingIndicator(`${senderName} is typing…`)
            clearTimeout(typingTimerRef.current)
            typingTimerRef.current = setTimeout(() => setTypingIndicator(''), 3000)
        }

        const onStopTyping = () => {
            setTypingIndicator('')
            clearTimeout(typingTimerRef.current)
        }

        socket.on('chat_message', onMessage)
        socket.on('chat_typing', onTyping)
        socket.on('chat_stop_typing', onStopTyping)

        return () => {
            socket.emit('leave_chat', incidentId)
            socket.off('chat_message', onMessage)
            socket.off('chat_typing', onTyping)
            socket.off('chat_stop_typing', onStopTyping)
        }
    }, [socket, incidentId, user?.name])

    // ── Typing events ──────────────────────────────────────────────────────────
    const emitTyping = useCallback(() => {
        if (!socket || !chatRoomId) return
        socket.emit('chat_typing', { chatRoomId, senderName: user?.name })
    }, [socket, chatRoomId, user?.name])

    const emitStopTyping = useCallback(() => {
        if (!socket || !chatRoomId) return
        socket.emit('chat_stop_typing', { chatRoomId })
    }, [socket, chatRoomId])

    // ── Send message ───────────────────────────────────────────────────────────
    const sendMessage = async (text, attachmentUrl) => {
        if (!text.trim() && !attachmentUrl) return
        setSending(true)
        emitStopTyping()
        try {
            const res = await client.post(`/incidents/${incidentId}/chat`, {
                text: text.trim() || undefined,
                attachmentUrl: attachmentUrl || undefined,
            })
            // Server will emit back via socket; if not, optimistically add
            const newMsg = res.data?.data ?? res.data
            if (newMsg) {
                setMessages((prev) =>
                    prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]
                )
            }
            setInputText('')
        } catch (err) {
            toast.error(err?.response?.data?.error?.message ?? 'Failed to send message')
        } finally {
            setSending(false)
        }
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            sendMessage(inputText)
        }
    }

    const handleInputChange = (e) => {
        setInputText(e.target.value)
        emitTyping()
        clearTimeout(typingTimerRef.current)
        typingTimerRef.current = setTimeout(emitStopTyping, 2000)
    }

    // ── Attachment upload ──────────────────────────────────────────────────────
    const handleAttachment = async (e) => {
        const file = e.target.files?.[0]
        if (!file) return
        setUploading(true)
        try {
            const url = await uploadToCloudinary(file)
            await sendMessage(inputText, url)
        } catch (err) {
            toast.error('Upload failed: ' + err.message)
        } finally {
            setUploading(false)
            e.target.value = ''
        }
    }

    return (
        <div className="min-h-screen bg-bg-base flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-[17rem] flex-1 flex flex-col min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-bg-base/80 backdrop-blur-md border-b border-border-subtle px-6 py-4 flex items-center gap-4">
                    <button
                        onClick={() => navigate(`/incidents/${incidentId}`)}
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors group"
                    >
                        <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <div className="w-10 h-10 rounded-xl bg-primary-500/10 border border-primary-500/20 flex items-center justify-center shadow-sm">
                        <MessageSquare size={20} className="text-primary-500" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-text-primary leading-tight">Incident Chat</h1>
                        <p className="text-xs font-medium text-text-secondary mt-0.5">#{incidentId?.slice(0, 8)}</p>
                    </div>
                </header>

                {/* ── Body: chat + sidebar ─────────────────────────────────────── */}
                <div className="flex flex-1 overflow-hidden bg-[url('/noise.png')] bg-repeat opacity-95">

                    {/* ── Chat column ─────────────────────────────────────────── */}
                    <div className="flex-1 flex flex-col overflow-hidden relative">

                        {/* Message list */}
                        <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
                            {historyLoading ? (
                                <div className="space-y-6">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className={`flex gap-3 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                                            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                                            <div className="space-y-2 max-w-[60%]">
                                                <Skeleton className="h-4 w-24" />
                                                <Skeleton className={`h-16 ${i % 3 === 0 ? 'w-64' : 'w-48'} rounded-2xl`} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                                    <div className="w-16 h-16 rounded-full bg-surface-hover border border-border-subtle flex items-center justify-center mb-4">
                                        <MessageSquare size={28} className="text-text-muted" />
                                    </div>
                                    <p className="text-text-primary font-bold text-lg">No messages yet</p>
                                    <p className="text-text-secondary text-sm font-medium mt-1">Start the conversation below.</p>
                                </div>
                            ) : (
                                messages.map((msg, i) => (
                                    <MessageBubble
                                        key={msg.id ?? i}
                                        msg={msg}
                                        isMine={msg.senderId === user?.id || msg.sender?.id === user?.id}
                                    />
                                ))
                            )}
                            {typingIndicator && (
                                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="w-10 h-10 rounded-full bg-surface-hover border border-border-subtle flex items-center justify-center shrink-0">
                                        <div className="flex gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '0ms' }} />
                                            <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '150ms' }} />
                                            <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" style={{ animationDelay: '300ms' }} />
                                        </div>
                                    </div>
                                    <p className="text-xs font-medium text-text-muted italic">{typingIndicator}</p>
                                </div>
                            )}
                            <div ref={bottomRef} className="h-4" />
                        </div>

                        {/* Input bar */}
                        <div
                            className="p-4 shrink-0"
                            style={{
                                background: 'rgba(3,7,18,0.85)',
                                backdropFilter: 'blur(20px)',
                                borderTop: '1px solid rgba(255,255,255,0.05)',
                            }}
                        >
                            <div
                                className="flex items-end gap-2 rounded-2xl p-2 transition-all"
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.07)',
                                    boxShadow: '0 2px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.04)',
                                }}
                            >
                                {/* Attachment */}
                                <Button
                                    id="chat-attach-btn"
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading || sending}
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 h-10 w-10 text-text-muted hover:text-text-primary hover:bg-surface-hover"
                                >
                                    {uploading ? <Loader2 size={20} className="animate-spin" /> : <Paperclip size={20} />}
                                </Button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,application/pdf"
                                    className="hidden"
                                    onChange={handleAttachment}
                                />

                                {/* Text input */}
                                <textarea
                                    id="chat-input"
                                    rows={1}
                                    value={inputText}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    onBlur={emitStopTyping}
                                    placeholder="Type your message... (Enter to send)"
                                    className="flex-1 bg-transparent text-text-primary text-sm font-medium placeholder:text-text-muted placeholder:font-normal focus:outline-none resize-none py-2.5 max-h-32 overflow-y-auto"
                                    style={{ fieldSizing: 'content' }}
                                />

                                {/* Send */}
                                <Button
                                    id="chat-send-btn"
                                    type="button"
                                    onClick={() => sendMessage(inputText)}
                                    disabled={sending || (!inputText.trim() && !uploading)}
                                    variant="primary"
                                    size="icon"
                                    className="shrink-0 h-10 w-10 shadow-primary-500/25"
                                >
                                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} className="ml-0.5" />}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* ── Incident summary panel ───────────────────────────────── */}
                    <IncidentPanel incidentId={incidentId} />
                </div>
            </main>
        </div>
    )
}
