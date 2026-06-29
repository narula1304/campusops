import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import {
    ArrowLeft,
    Send,
    Paperclip,
    Loader2,
    MessageSquare,
} from 'lucide-react'
import Sidebar from '../components/Sidebar'
import SLACountdown from '../components/SLACountdown'
import { useAuth } from '../context/AuthContext'
import { getIncident } from '../api/incidents'
import client from '../api/client'
import { uploadToCloudinary } from '../utils/uploadToCloudinary'

// ── Badge helpers ──────────────────────────────────────────────────────────────
const PRIORITY_STYLES = {
    CRITICAL: 'bg-red-500/15 text-red-400 border border-red-500/30',
    HIGH: 'bg-orange-500/15 text-orange-400 border border-orange-500/30',
    MEDIUM: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30',
    LOW: 'bg-green-500/15 text-green-400 border border-green-500/30',
}
const STATUS_STYLES = {
    OPEN: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    IN_PROGRESS: 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30',
    RESOLVED: 'bg-green-500/15 text-green-400 border border-green-500/30',
    ESCALATED: 'bg-red-500/15 text-red-400 border border-red-500/30',
    REOPENED: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
}

function PriorityBadge({ priority }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_STYLES[priority] ?? 'bg-slate-700 text-slate-300'}`}>
            {priority}
        </span>
    )
}
function StatusBadge({ status }) {
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-700 text-slate-300'}`}>
            {status?.replace('_', ' ')}
        </span>
    )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
    'bg-indigo-600', 'bg-violet-600', 'bg-emerald-600',
    'bg-rose-600', 'bg-amber-600', 'bg-cyan-600', 'bg-pink-600',
]
function avatarColor(name = '') {
    let hash = 0
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff
    return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

function Avatar({ name, size = 'sm' }) {
    const initial = (name ?? '?')[0].toUpperCase()
    const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-8 h-8 text-sm'
    return (
        <div className={`${sz} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-bold shrink-0`}>
            {initial}
        </div>
    )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className = '' }) {
    return <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, isMine }) {
    const time = msg.createdAt
        ? new Date(msg.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : ''

    return (
        <div className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
            <Avatar name={msg.sender?.name ?? msg.senderName ?? '?'} />
            <div className={`flex flex-col gap-1 max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                <div className="flex items-baseline gap-1.5">
                    <span className={`text-xs font-semibold ${isMine ? 'text-indigo-300' : 'text-slate-300'}`}>
                        {isMine ? 'You' : (msg.sender?.name ?? msg.senderName ?? 'Unknown')}
                    </span>
                    <span className="text-xs text-slate-600">{msg.sender?.role ?? msg.senderRole}</span>
                    <span className="text-xs text-slate-600">{time}</span>
                </div>

                <div className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words ${
                    isMine
                        ? 'bg-indigo-600 text-white rounded-tr-sm'
                        : 'bg-white/8 text-slate-200 rounded-tl-sm'
                }`}>
                    {msg.text}
                    {msg.attachmentUrl && (
                        <a
                            href={msg.attachmentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block mt-2 underline text-indigo-200 text-xs"
                        >
                            📎 Attachment
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
        <aside className="w-80 shrink-0 border-l border-white/8 bg-slate-900/60 flex flex-col">
            <div className="px-5 py-4 border-b border-white/8">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Incident Summary</h2>
            </div>
            <div className="px-5 py-5 space-y-4 overflow-y-auto flex-1">
                {loading ? (
                    <div className="space-y-3">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-28" />
                    </div>
                ) : incident ? (
                    <>
                        <p className="text-xs font-mono text-indigo-400">
                            #{incident.incidentNumber ?? '—'}
                        </p>
                        <p className="text-sm font-semibold text-white leading-snug">
                            {incident.title}
                        </p>
                        <div className="flex flex-wrap gap-2">
                            <StatusBadge status={incident.status} />
                            <PriorityBadge priority={incident.priority} />
                        </div>
                        <div className="space-y-2 pt-1 border-t border-white/8">
                            <InfoRow label="Category" value={incident.category} />
                            <InfoRow
                                label="Assigned To"
                                value={incident.assignedTo?.name ?? (incident.assignedToId ? 'Assigned' : 'Unassigned')}
                            />
                            <div>
                                <p className="text-xs text-slate-500 mb-1">SLA</p>
                                <SLACountdown deadline={deadline} />
                            </div>
                        </div>
                    </>
                ) : (
                    <p className="text-slate-500 text-sm">Could not load incident details.</p>
                )}
            </div>
        </aside>
    )
}

function InfoRow({ label, value }) {
    return (
        <div>
            <p className="text-xs text-slate-500">{label}</p>
            <p className="text-sm text-slate-300">{value ?? '—'}</p>
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
    }, [messages])

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
        <div className="min-h-screen bg-slate-900 flex">
            <Sidebar user={user} onLogout={handleLogout} />

            <main className="ml-64 flex-1 flex flex-col min-h-screen">
                {/* ── Header ──────────────────────────────────────────────────── */}
                <header className="sticky top-0 z-30 bg-slate-900/80 backdrop-blur border-b border-white/8 px-6 py-3.5 flex items-center gap-3">
                    <button
                        onClick={() => navigate(`/incidents/${incidentId}`)}
                        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors group"
                    >
                        <ArrowLeft size={16} className="group-hover:-translate-x-0.5 transition-transform" />
                    </button>
                    <div className="w-8 h-8 rounded-xl bg-indigo-600/20 flex items-center justify-center">
                        <MessageSquare size={15} className="text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-base font-semibold text-white leading-tight">Incident Chat</h1>
                        <p className="text-xs text-slate-500">Incident #{incidentId?.slice(0, 8)}</p>
                    </div>
                </header>

                {/* ── Body: chat + sidebar ─────────────────────────────────────── */}
                <div className="flex flex-1 overflow-hidden">

                    {/* ── Chat column ─────────────────────────────────────────── */}
                    <div className="flex-1 flex flex-col overflow-hidden">

                        {/* Message list */}
                        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                            {historyLoading ? (
                                <div className="space-y-4">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <div key={i} className={`flex gap-2.5 ${i % 2 === 0 ? '' : 'flex-row-reverse'}`}>
                                            <Skeleton className="w-7 h-7 rounded-full shrink-0" />
                                            <div className="space-y-1 max-w-[60%]">
                                                <Skeleton className="h-3 w-20" />
                                                <Skeleton className={`h-10 ${i % 3 === 0 ? 'w-64' : 'w-40'} rounded-2xl`} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center py-16">
                                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center mb-4">
                                        <MessageSquare size={24} className="text-slate-600" />
                                    </div>
                                    <p className="text-slate-400 font-medium">No messages yet</p>
                                    <p className="text-slate-600 text-sm mt-1">Start the conversation below.</p>
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
                            <div ref={bottomRef} />
                        </div>

                        {/* Typing indicator */}
                        <div className="px-6 h-5">
                            {typingIndicator && (
                                <p className="text-xs text-slate-500 italic">{typingIndicator}</p>
                            )}
                        </div>

                        {/* Input bar */}
                        <div className="px-6 py-4 border-t border-white/8">
                            <div className="flex items-end gap-3 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                                {/* Attachment */}
                                <button
                                    id="chat-attach-btn"
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading || sending}
                                    className="shrink-0 text-slate-500 hover:text-indigo-400 transition-colors disabled:opacity-40"
                                    title="Attach file"
                                >
                                    {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
                                </button>
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
                                    placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
                                    className="flex-1 bg-transparent text-white text-sm placeholder:text-slate-600 focus:outline-none resize-none leading-5 max-h-32 overflow-y-auto"
                                    style={{ fieldSizing: 'content' }}
                                />

                                {/* Send */}
                                <button
                                    id="chat-send-btn"
                                    type="button"
                                    onClick={() => sendMessage(inputText)}
                                    disabled={sending || (!inputText.trim())}
                                    className="shrink-0 w-8 h-8 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all"
                                >
                                    {sending ? <Loader2 size={14} className="animate-spin text-white" /> : <Send size={14} className="text-white" />}
                                </button>
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
