import React from 'react'

const variantClasses = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger:  'badge-danger',
  info:    'badge-info',
  neutral: 'badge-neutral',
  primary: 'badge-primary',
}

export function Badge({ children, variant = 'neutral', className = '', noDot = false }) {
  const base = variantClasses[variant] ?? variantClasses.neutral
  return (
    <span
      className={`badge ${base} ${noDot ? '[&::before]:hidden' : ''} ${className}`}
    >
      {children}
    </span>
  )
}
