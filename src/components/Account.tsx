import type { ArchetypeId } from '@shared/archetypes';
import { Download, ExternalLink, Loader2, LogOut, Mail } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { track } from '../lib/analytics';
import {
  getMe,
  getOrders,
  requestMagicLink,
  signOut,
  type Me,
  type PublicOrder,
} from '../lib/api';
import type { Favorite } from '../lib/storage';
import { ArchetypeTile } from './Result';
import { Sheet, useMoney, useToast } from './primitives';

export function AccountSheet({
  open,
  onClose,
  favorites,
  onRemoveFavorite,
  accountsEnabled,
  defaultEmail,
}: {
  open: boolean;
  onClose: () => void;
  favorites: Favorite[];
  onRemoveFavorite: (id: ArchetypeId) => void;
  accountsEnabled: boolean;
  defaultEmail: string | null;
}) {
  const toast = useToast();
  const money = useMoney();
  const [me, setMe] = useState<Me | null>(null);
  const [orders, setOrders] = useState<PublicOrder[] | null>(null);
  const [email, setEmail] = useState(defaultEmail ?? '');
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const identity = await getMe();
      setMe(identity);
      if (!identity.authenticated) {
        setOrders(null);
        return;
      }
      const { orders: list } = await getOrders();
      setOrders(list);
    } catch {
      // The panel still shows local favourites when the API is unreachable.
      setMe({ authenticated: false, user: null });
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const sendLink = async () => {
    const address = email.trim();
    if (!address) return;
    setSending(true);
    try {
      const result = await requestMagicLink(address);
      if (result.devLink) {
        // No email provider configured — surface the link so local dev works.
        window.open(result.devLink, '_self');
        return;
      }
      toast('Check your inbox for a sign-in link.');
    } catch (error) {
      toast((error as Error).message, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} eyebrow="Your account" title="My library">
      {/* ------------------------------------------------------ favourites */}
      <section>
        <p className="label">Saved archetypes</p>
        {favorites.length ? (
          <div className="mt-4 space-y-2">
            {favorites.map((favorite) => (
              <ArchetypeTile
                key={favorite.id}
                id={favorite.id}
                onRemove={() => onRemoveFavorite(favorite.id)}
              />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm leading-relaxed text-ink-3">
            Nothing saved yet. Tap <span className="text-ink-2">Save</span> on a result
            to keep it here.
          </p>
        )}
      </section>

      {/* ---------------------------------------------------------- orders */}
      <section className="mt-10 border-t border-line-soft pt-8">
        <p className="label">Purchases</p>

        {me?.authenticated ? (
          <>
            <p className="mt-3 text-xs text-ink-3">Signed in as {me.user?.email}</p>

            {orders === null ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-ink-3">
                <Loader2 size={14} className="animate-spin" /> Loading your orders…
              </p>
            ) : orders.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-ink-3">
                No purchases on this address yet.
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {orders.map((order) => (
                  <li key={order.id} className="border border-line-soft p-4">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-sm text-ink">{order.productName}</p>
                      <p className="numeral shrink-0 text-sm text-ink-2">
                        {money(order.amountPaid)}
                      </p>
                    </div>
                    <p className="mt-1 text-[0.6875rem] text-ink-3">
                      {new Date(order.createdAt).toLocaleDateString()} ·{' '}
                      {order.archetypeTitle ?? '—'}
                    </p>
                    {order.downloadUrl || order.templateUrl ? (
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                        {order.downloadUrl ? (
                          <a
                            href={order.downloadUrl}
                            onClick={() => track('download_click')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs text-[rgb(var(--accent))] transition-opacity hover:opacity-80"
                          >
                            <Download size={12} strokeWidth={1.8} />
                            Download PDF
                          </a>
                        ) : null}
                        {order.templateUrl ? (
                          <a
                            href={order.templateUrl}
                            onClick={() => track('template_click')}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 text-xs text-ink-2 transition-opacity hover:opacity-80"
                          >
                            <ExternalLink size={12} strokeWidth={1.8} />
                            Notion planner
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <p className="mt-3 text-[0.6875rem] capitalize text-ink-3">
                        Status: {order.status}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              onClick={async () => {
                await signOut();
                setMe({ authenticated: false, user: null });
                setOrders(null);
              }}
              className="btn btn-quiet mt-5 text-xs"
            >
              <LogOut size={13} strokeWidth={1.6} />
              Sign out
            </button>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm leading-relaxed text-ink-3">
              {accountsEnabled
                ? 'Sign in with a one-time link to see everything you have bought and re-download it any time.'
                : 'Sign-in needs an email provider connected. Your download links still arrive by email after each purchase.'}
            </p>

            <div className="mt-4 space-y-3">
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="field"
                autoComplete="email"
              />
              <button
                type="button"
                onClick={sendLink}
                disabled={sending || !email.trim()}
                className="btn btn-ghost w-full"
              >
                {sending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" strokeWidth={2} /> Sending…
                  </>
                ) : (
                  <>
                    <Mail size={14} strokeWidth={1.6} /> Email me a sign-in link
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </section>
    </Sheet>
  );
}
