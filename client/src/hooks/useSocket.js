import { useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

/**
 * Manages a Socket.IO connection for the given token / auth state.
 *
 * Accepts token and isAuthenticated as parameters instead of calling
 * useAuth() directly — this avoids a circular dependency when AuthContext
 * is the caller.
 *
 * @param {{ token: string|null, isAuthenticated: boolean }} opts
 */
const useSocket = ({ token, isAuthenticated }) => {
    const socketRef = useRef(null)

    useEffect(() => {
        if (!isAuthenticated || !token) return

        // Connect to the backend Socket.IO server.
        // Use environment variable if provided, fallback to localhost in dev, or current origin in production
        const BACKEND_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000' : '')
        const socket = io(BACKEND_URL, {
            auth: { token },
            transports: ['websocket', 'polling'],
        })

        socket.on('connect', () => {
            console.log('[Socket] Connected:', socket.id)
        })

        socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected:', reason)
        })

        socket.on('connect_error', (err) => {
            console.warn('[Socket] Connection error:', err.message)
        })

        socketRef.current = socket

        return () => {
            socket.disconnect()
            socketRef.current = null
        }
    }, [isAuthenticated, token])

    // Subscribe to a specific event and call handler when it fires.
    // Returns an unsubscribe function.
    const on = useCallback((event, handler) => {
        if (!socketRef.current) return () => {}
        socketRef.current.on(event, handler)
        return () => socketRef.current?.off(event, handler)
    }, [])

    return { socket: socketRef.current, on }
}

export default useSocket
