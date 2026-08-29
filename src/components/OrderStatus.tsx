import { CheckCircle2, Download, ExternalLink, Loader2, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { track } from '../lib/analytics';
import { getOrder, type OrderStatus as Order } from '../lib/api';
import { useMoney } from './primitives';

/**
 * Shown after returning from Stripe. Fulfilment runs on the webhook, so this
 * polls until the order flips to `fulfilled` rather than assuming the file is
 * ready the moment the buyer lands back on the site.
 */
export function OrderStatusPanel({
  orderId,
  sessionId,
  cancelled,
  onDismiss,
}: {
  orderId: string;
  sessionId?: string | null;
  cancelled: boolean;
  onDismiss: () => void;
}) {
  const money = useMoney();
  const [order, setOrder] = useState<Order | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cancelled) return;
    let active = true;
    let attempts = 0;

    const poll = async () => {
      try {
        const next = await getOrder(orderId, sessionId);
        if (!active) return;
        setOrder(next);
        if (next.status === 'fulfilled' || next.status === 'failed') return;
      } catch (fetchError) {
        if (!active) return;
        setError((fetchError as Error).message);
      }

      attempts += 1;
      setElapsed(attempts * 2);
      // ~2 minutes of polling; generation plus email is normally well under that.
      if (attempts < 60 && active) window.setTimeout(poll, 2000);
    };

    void poll();
    return () => {
      active = false;
    };
  }, [orderId, sessionId, cancelled]);

  if (cancelled) {
    return (
      <Shell tone="neutral" onDismiss={onDismiss}>
        <p className="label">Checkout cancelled</p>
        <h2 className="display-md mt-3">No payment was taken.</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-2">
          Your result is still here whenever you want it. Nothing was charged.
        </p>
      </Shell>
    );
  }

  const fulfilled = order?.status === 'fulfilled' && order.downloadUrl;
  const failed = order?.status === 'failed';

  return (
    <Shell tone={fulfilled ? 'success' : failed ? 'error' : 'neutral'} onDismiss={onDismiss}>
      {fulfilled ? (
        <>
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={16} strokeWidth={1.5} className="text-[rgb(var(--accent))]" />
            <p className="label label-accent">Payment received</p>
          </div>
          <h2 className="display-md mt-3">Your blueprint is ready.</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            A copy is on its way to your inbox with a receipt. You can also grab it here —
            the link is signed and expires, so save the file once it opens.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={order.downloadUrl ?? '#'}
              onClick={() => track('download_click', { tier: order.productTier })}
              className="btn btn-primary w-full sm:w-auto"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Download size={15} strokeWidth={1.8} />
              Download the PDF
            </a>
            {order.templateUrl ? (
              <a
                href={order.templateUrl}
                onClick={() => track('template_click', { tier: order.productTier })}
                className="btn btn-ghost w-full sm:w-auto"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={15} strokeWidth={1.8} />
                Open the Notion planner
              </a>
            ) : null}
          </div>
          {order.templateUrl ? (
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              In Notion, hit <span className="text-ink-2">Duplicate</span> in the top-right
              to save your own copy of the planner.
            </p>
          ) : null}
          <p className="mt-4 text-[0.6875rem] text-ink-3">
            Order {order.id.slice(0, 8).toUpperCase()} · {money(order.amountPaid)}
          </p>
        </>
      ) : failed ? (
        <>
          <div className="flex items-center gap-2.5">
            <TriangleAlert size={16} strokeWidth={1.5} className="text-gold" />
            <p className="label" style={{ color: 'var(--color-gold)' }}>
              Something went wrong
            </p>
          </div>
          <h2 className="display-md mt-3">Your payment went through.</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            The file did not generate. Reply to your Stripe receipt and we will send it
            manually — you will not be charged twice.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2.5">
            <Loader2 size={16} className="animate-spin text-[rgb(var(--accent))]" strokeWidth={2} />
            <p className="label label-accent">Writing your blueprint</p>
          </div>
          <h2 className="display-md mt-3">Thank you — this takes a moment.</h2>
          <p className="mt-3 text-sm leading-relaxed text-ink-2">
            We are generating your 15 pages from your answers and emailing them to you.
            You can close this page; the email will still arrive.
          </p>
          {elapsed > 30 ? (
            <p className="mt-4 text-xs text-ink-3">
              Still working ({elapsed}s). If nothing arrives in a few minutes, check your
              spam folder or reply to your Stripe receipt.
            </p>
          ) : null}
          {error ? <p className="mt-4 text-xs text-rose-2">{error}</p> : null}
        </>
      )}
    </Shell>
  );
}

function Shell({
  children,
  tone,
  onDismiss,
}: {
  children: React.ReactNode;
  tone: 'neutral' | 'success' | 'error';
  onDismiss: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 pt-24 sm:px-8">
      <div
        className="panel-raised relative p-6 sm:p-8"
        style={
          tone === 'success'
            ? { boxShadow: 'inset 0 0 0 1px rgb(var(--accent) / 0.35)' }
            : undefined
        }
      >
        <button
          type="button"
          onClick={onDismiss}
          className="absolute right-4 top-4 text-xs text-ink-3 transition-colors hover:text-ink"
        >
          Dismiss
        </button>
        {children}
      </div>
    </div>
  );
}
