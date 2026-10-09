import { useEffect, useId, type ReactNode } from 'react'

type Props = {
  title: string
  children: ReactNode
  actions: ReactNode
  onClose?: () => void
  tone?: 'error' | 'info'
}

export function Modal({ title, children, actions, onClose, tone = 'info' }: Props) {
  const titleId = useId()
  useEffect(() => {
    if (!onClose) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop">
      <div
        className={`modal modal-${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="modal-title">
          {title}
        </h2>
        <div className="modal-body">{children}</div>
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}
