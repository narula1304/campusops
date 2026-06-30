import React from 'react'
import { Loader2 } from 'lucide-react'

const VARIANTS = ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success', 'warning']
const SIZES    = ['xs', 'sm', 'md', 'lg', 'xl', 'icon']

export function Button({
  children,
  variant   = 'primary',
  size      = 'md',
  className = '',
  isLoading = false,
  disabled  = false,
  icon: Icon,
  iconRight: IconRight,
  ...props
}) {
  const v = VARIANTS.includes(variant) ? variant : 'primary'
  const s = SIZES.includes(size) ? size : 'md'

  const classes = [
    'btn',
    `btn-${v}`,
    `btn-${s}`,
    isLoading ? 'loading' : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <button
      disabled={disabled || isLoading}
      className={classes}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
      ) : Icon ? (
        <Icon className={size === 'xs' || size === 'sm' ? 'w-3.5 h-3.5 flex-shrink-0' : 'w-4 h-4 flex-shrink-0'} />
      ) : null}

      {children}

      {!isLoading && IconRight && (
        <IconRight className={size === 'xs' || size === 'sm' ? 'w-3.5 h-3.5 flex-shrink-0' : 'w-4 h-4 flex-shrink-0'} />
      )}
    </button>
  )
}
