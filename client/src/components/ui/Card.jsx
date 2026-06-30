import React from 'react'
import { motion } from 'framer-motion'

export function Card({ children, className = '', index = 0, delay = 0, flat = false, ...props }) {
  const animDelay = delay || index * 0.06

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1], delay: animDelay }}
      className={`${flat ? 'card-flat' : 'card'} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  )
}

export function CardHeader({ children, className = '' }) {
  return (
    <div className={`relative z-10 px-6 py-5 border-b border-border-subtle ${className}`}>
      {children}
    </div>
  )
}

export function CardTitle({ children, className = '' }) {
  return (
    <h3 className={`text-base font-semibold text-text-primary tracking-tight ${className}`}>
      {children}
    </h3>
  )
}

export function CardDescription({ children, className = '' }) {
  return (
    <p className={`text-sm text-text-secondary mt-0.5 leading-relaxed ${className}`}>
      {children}
    </p>
  )
}

export function CardContent({ children, className = '' }) {
  return (
    <div className={`relative z-10 px-6 py-6 ${className}`}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '' }) {
  return (
    <div
      className={`relative z-10 px-6 py-4 border-t border-border-subtle rounded-b-2xl flex items-center justify-end gap-3 ${className}`}
      style={{ background: 'rgba(255,255,255,0.015)' }}
    >
      {children}
    </div>
  )
}
