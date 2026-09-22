import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

interface ToastContextType {
  toast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

let nextId = 0

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
}

const BORDER_COLORS = {
  success: 'border-l-success-500',
  error: 'border-l-danger-500',
  warning: 'border-l-warning-500',
  info: 'border-l-info-500',
}

const ICON_COLORS = {
  success: 'text-success-500',
  error: 'text-danger-500',
  warning: 'text-warning-500',
  info: 'text-info-500',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((type: ToastType, message: string) => {
    const id = ++nextId
    setToasts(prev => [...prev, { id, type, message }])
  }, [])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ toast: addToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 space-y-2">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const EXIT_MS = 160

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [leaving, setLeaving] = useState(false)

  const dismiss = useCallback(() => {
    setLeaving(true)
    setTimeout(onDismiss, EXIT_MS)
  }, [onDismiss])

  useEffect(() => {
    const timer = setTimeout(dismiss, 4000)
    return () => clearTimeout(timer)
  }, [dismiss])

  const Icon = ICONS[toast.type]

  return (
    <div className={`flex items-center gap-2.5 bg-neutral-0 border border-neutral-200 border-l-4 ${BORDER_COLORS[toast.type]} rounded-lg px-3 py-2.5 shadow-md min-w-72 max-w-96 ${leaving ? 'animate-toast-out' : 'animate-toast-in'}`}>
      <Icon size={16} className={ICON_COLORS[toast.type]} />
      <span className="flex-1 text-[13px] text-neutral-800">{toast.message}</span>
      <button onClick={dismiss} className="text-neutral-400 hover:text-neutral-600">
        <X size={14} />
      </button>
    </div>
  )
}
