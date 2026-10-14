import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'

type ClassName = { className?: string }

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-card ${className}`} {...props} />
}

export function CardHeader({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-card-header ${className}`} {...props} />
}

export function CardTitle({ className = '', ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`ui-card-title ${className}`} {...props} />
}

export function CardDescription({ className = '', ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`ui-card-description ${className}`} {...props} />
}

export function CardContent({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-card-content ${className}`} {...props} />
}

export function CardFooter({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-card-footer ${className}`} {...props} />
}

export function Badge({ className = '', children, ...props }: ClassName & { children: ReactNode } & HTMLAttributes<HTMLSpanElement>) {
  return <span className={`ui-badge ${className}`} {...props}>{children}</span>
}

export function Button({ className = '', children, ...props }: ClassName & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`ui-button ${className}`} {...props}>{children}</button>
}

export function Progress({ value, className = '' }: { value: number; className?: string }) {
  return <div className={`ui-progress ${className}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button className={`ui-switch ${checked ? 'is-checked' : ''}`} type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}><span /></button>
}
