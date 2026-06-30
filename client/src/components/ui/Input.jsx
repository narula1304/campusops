import React, { forwardRef } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

export const Input = forwardRef(({
  label,
  error,
  hint,
  icon: Icon,
  iconRight: IconRight,
  required,
  className = '',
  wrapperClassName = '',
  size = 'md',  // 'sm' | 'md' | 'lg'
  ...props
}, ref) => {
  const hasError   = !!error
  const sizeStyles = {
    sm: 'px-3 py-2 text-xs',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-5 py-3.5 text-base',
  }

  return (
    <div className={`input-wrapper ${wrapperClassName}`}>
      {label && (
        <label className="text-xs font-semibold text-text-secondary tracking-wide flex items-center gap-1.5">
          {label}
          {required && <span className="text-primary-400 text-sm leading-none">*</span>}
        </label>
      )}

      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            <Icon size={15} />
          </div>
        )}

        <input
          ref={ref}
          className={`
            input
            ${sizeStyles[size] || sizeStyles.md}
            ${Icon ? 'pl-10' : ''}
            ${IconRight || hasError ? 'pr-10' : ''}
            ${hasError ? 'input-error' : ''}
            ${className}
          `}
          {...props}
        />

        {/* Right icon slot (error state takes priority) */}
        {hasError ? (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-danger-500 pointer-events-none">
            <AlertTriangle size={14} />
          </div>
        ) : IconRight ? (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
            <IconRight size={15} />
          </div>
        ) : null}
      </div>

      {/* Error message */}
      {hasError && (
        <p
          className="text-xs flex items-center gap-1.5 mt-0.5"
          style={{ color: 'var(--color-danger-400)', animation: 'fadeDown 200ms cubic-bezier(.16,1,.3,1)' }}
        >
          <AlertTriangle size={11} className="flex-shrink-0" />
          {error}
        </p>
      )}

      {/* Hint text */}
      {!hasError && hint && (
        <p className="text-xs text-text-muted mt-0.5">{hint}</p>
      )}
    </div>
  )
})

Input.displayName = 'Input'
