import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/* ------------------------------------------------------------- reveal ---- */

/** Fades content in the first time it enters the viewport. */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`}
      data-shown={shown}
      style={{ transitionDelay: shown ? `${delay}ms` : undefined }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- toasts --- */

interface Toast {
  id: number;
  message: string;
  tone: 'default' | 'error';
}

const ToastContext = createContext<(message: string, tone?: Toast['tone']) => void>(
  () => {},
);

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((message: string, tone: Toast['tone'] = 'default') => {
    const id = (nextId.current += 1);
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-[70] flex flex-col items-center gap-2 px-4"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto max-w-sm border px-4 py-3 text-sm shadow-2xl backdrop-blur-md ${
              toast.tone === 'error'
                ? 'border-rose-deep/60 bg-rose-deep/20 text-rose-2'
                : 'border-line bg-ink-800/95 text-ivory'
            }`}
            style={{ animation: 'toast-in 320ms cubic-bezier(0.16,1,0.3,1)' }}
          >
            {toast.message}
          </div>
        ))}
      </div>
      <style>{`@keyframes toast-in{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`}</style>
    </ToastContext.Provider>
  );
}

/* --------------------------------------------------------------- sheet --- */

/** Right-hand slide-over used for favourites, account, and the checkout flow. */
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    // Move focus into the panel so the dialog is reachable by keyboard.
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] flex justify-end">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-950/80 backdrop-blur-sm"
        style={{ animation: 'fade-in 240ms ease' }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex h-full w-full max-w-md flex-col border-l border-line bg-ink-900 outline-none"
        style={{ animation: 'slide-in 380ms cubic-bezier(0.16,1,0.3,1)' }}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
          <div>
            {eyebrow ? <p className="label label-accent mb-1.5">{eyebrow}</p> : null}
            <h2 className="display-md">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="-mr-2 -mt-1 p-2 text-ivory-3 transition-colors hover:text-ivory"
          >
            <X size={18} strokeWidth={1.5} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
      </div>
      <style>{`
        @keyframes fade-in{from{opacity:0}to{opacity:1}}
        @keyframes slide-in{from{transform:translateX(100%)}to{transform:none}}
      `}</style>
    </div>
  );
}

/* --------------------------------------------------------------- meter --- */

export function Meter({ percent, delay = 0 }: { percent: number; delay?: number }) {
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => setWidth(percent), 120 + delay);
    return () => window.clearTimeout(id);
  }, [percent, delay]);

  return (
    <div
      className="meter-track"
      role="meter"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="meter-fill" style={{ width: `${width}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------- petals --- */

export function usePetals() {
  return useCallback((count = 22) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layer = document.createElement('div');
    document.body.appendChild(layer);

    for (let i = 0; i < count; i += 1) {
      const petal = document.createElement('span');
      const size = 6 + Math.random() * 10;
      petal.className = 'petal';
      petal.style.left = `${Math.random() * 100}vw`;
      petal.style.width = `${size}px`;
      petal.style.height = `${size * 1.25}px`;
      petal.style.opacity = String(0.35 + Math.random() * 0.5);
      petal.style.animationDuration = `${4.5 + Math.random() * 4}s`;
      petal.style.animationDelay = `${Math.random() * 1.6}s`;
      layer.appendChild(petal);
    }

    window.setTimeout(() => layer.remove(), 11_000);
  }, []);
}

/* ----------------------------------------------------------- atmosphere -- */

export function Atmosphere() {
  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
    </>
  );
}

/* -------------------------------------------------------------- utility -- */

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Formats cents for display without trailing `.00` on whole amounts. */
export function useMoney(currency = 'usd') {
  return useMemo(
    () => (amount: number) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency.toUpperCase(),
        minimumFractionDigits: amount % 100 === 0 ? 0 : 2,
      }).format(amount / 100),
    [currency],
  );
}
