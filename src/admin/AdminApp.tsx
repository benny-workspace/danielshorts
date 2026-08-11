import { getArchetype, isArchetypeId } from '@shared/archetypes';
import {
  AlertTriangle,
  Database,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  adminLogin,
  adminLogout,
  getAdminSession,
  getStats,
  type DashboardData,
} from './api';
import {
  BarList,
  CHART_COLORS,
  Delta,
  Donut,
  FunnelBars,
  LineChart,
  Sparkline,
  formatMoney,
  formatPct,
} from './charts';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

/** Auto-refresh, so a dashboard left open on a second screen stays current. */
const REFRESH_MS = 60_000;

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    getAdminSession()
      .then((session) => {
        setAuthenticated(session.authenticated);
        setConfigured(session.configured);
        setReason(session.reason);
      })
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return (
      <Centered>
        <Loader2 size={20} className="animate-spin text-[rgb(var(--accent))]" strokeWidth={2} />
      </Centered>
    );
  }

  if (!authenticated) {
    return (
      <Gate
        configured={configured}
        reason={reason}
        onSuccess={() => setAuthenticated(true)}
      />
    );
  }

  return <Dashboard onSignOut={() => setAuthenticated(false)} />;
}

/* ------------------------------------------------------------------ gate */

function Gate({
  configured,
  reason,
  onSuccess,
}: {
  configured: boolean;
  reason: string | null;
  onSuccess: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(password);
      onSuccess();
    } catch (loginError) {
      setError((loginError as Error).message);
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Centered>
      <form onSubmit={submit} className="panel-raised w-full max-w-sm p-7">
        <div className="flex items-center gap-2.5">
          <LockKeyhole size={15} strokeWidth={1.5} className="text-[rgb(var(--accent))]" />
          <p className="label label-accent">Private</p>
        </div>
        <h1 className="display-md mt-3">Funnel dashboard</h1>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-ivory-3">
          Everything behind this page is yours only.
        </p>

        {!configured ? (
          <p className="mt-5 border border-gold/25 bg-gold/5 px-3.5 py-3 text-xs leading-relaxed text-ivory-2">
            <span className="font-semibold text-gold">Not set up yet.</span> {reason} Add it in
            Vercel under Settings → Environment Variables, then redeploy.
          </p>
        ) : null}

        <input
          type="password"
          value={password}
          autoFocus
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Password"
          className="field mt-5"
          disabled={!configured || busy}
        />

        {error ? <p className="mt-3 text-xs text-rose-2">{error}</p> : null}

        <button
          type="submit"
          disabled={!configured || busy || !password}
          className="btn btn-primary mt-5 w-full"
        >
          {busy ? <Loader2 size={15} className="animate-spin" strokeWidth={2} /> : null}
          Open the dashboard
        </button>
      </form>
    </Centered>
  );
}

/* ------------------------------------------------------------- dashboard */

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (window: number) => {
      setRefreshing(true);
      try {
        setData(await getStats(window));
        setError(null);
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(days);
    const timer = window.setInterval(() => void load(days), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [days, load]);

  const signOut = async () => {
    await adminLogout().catch(() => undefined);
    onSignOut();
  };

  if (!data) {
    return (
      <Centered>
        {error ? (
          <p className="text-sm text-rose-2">{error}</p>
        ) : (
          <Loader2 size={20} className="animate-spin text-[rgb(var(--accent))]" strokeWidth={2} />
        )}
      </Centered>
    );
  }

  const { totals, delivery } = data;

  /*
   * Splits the window down the middle so each tile can say whether it is
   * rising or falling. Comparing the recent half against the one before it is
   * the only period-over-period read available without a second query, and it
   * answers the question a bare total cannot: is this getting better?
   */
  const split = (pick: (day: DashboardData['daily'][number]) => number) => {
    const mid = Math.floor(data.daily.length / 2);
    const sum = (rows: DashboardData['daily']) => rows.reduce((total, d) => total + pick(d), 0);
    return {
      current: sum(data.daily.slice(mid)),
      previous: sum(data.daily.slice(0, mid)),
    };
  };

  return (
    <div className="min-h-screen bg-ink-950 pb-24">
      {/* ----------------------------------------------------------- head */}
      <header className="sticky top-0 z-20 border-b border-line-soft bg-ink-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 sm:px-8">
          <div className="mr-auto">
            <p className="label label-accent">K-Drama Dreams</p>
            <h1 className="display-md mt-1">Funnel dashboard</h1>
          </div>

          <div className="flex items-center gap-px border border-line-soft bg-line-soft">
            {RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                onClick={() => setDays(range.days)}
                className="bg-ink-900 px-3.5 py-2 text-[0.6875rem] uppercase tracking-[0.14em] transition-colors"
                style={{
                  color: days === range.days ? 'rgb(var(--accent))' : 'var(--color-ivory-3)',
                  background: days === range.days ? 'rgb(var(--accent) / 0.09)' : undefined,
                }}
              >
                {range.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void load(days)}
            className="btn btn-quiet"
            aria-label="Refresh now"
          >
            <RefreshCw size={14} strokeWidth={1.6} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>

          <button type="button" onClick={() => void signOut()} className="btn btn-quiet">
            <LogOut size={14} strokeWidth={1.6} />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-12 px-5 pt-10 sm:px-8">
        {!data.storage.durable ? <MemoryWarning /> : null}
        {error ? (
          <p className="border border-rose-deep/40 bg-rose-deep/10 px-4 py-3 text-xs text-ivory-2">
            Last refresh failed: {error}
          </p>
        ) : null}

        {/* -------------------------------------------------------- tiles */}
        <section className="grid gap-px border border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            label="Visitors"
            value={String(totals.visitors)}
            sub={`${totals.pageViews} page views`}
            series={data.daily.map((d) => d.visitors)}
            split={split((d) => d.visitors)}
          />
          <Tile
            label="Finished the quiz"
            value={String(totals.quizCompletions)}
            sub={`${formatPct(rate(totals.quizCompletions, totals.visitors))} of visitors`}
            series={data.daily.map((d) => d.quizCompletions)}
            split={split((d) => d.quizCompletions)}
            color={CHART_COLORS[2]}
          />
          <Tile
            label="Sales"
            value={String(totals.purchases)}
            sub={`${formatPct(totals.conversionRate)} of visitors converted`}
            series={data.daily.map((d) => d.purchases)}
            split={split((d) => d.purchases)}
            color={CHART_COLORS[3]}
            accent
          />
          <Tile
            label="Revenue"
            value={formatMoney(totals.revenueCents)}
            sub={`${formatMoney(totals.purchases ? totals.revenueCents / totals.purchases : 0)} per sale`}
            series={data.daily.map((d) => d.revenueCents)}
            split={split((d) => d.revenueCents)}
            color={CHART_COLORS[1]}
            accent
          />
        </section>

        {/* ------------------------------------------------------- kanban */}
        <Section
          title="The funnel as a board"
          blurb="Five columns, one per thing a visitor does. Amber and red cards are the ones costing you money — fix left to right."
        >
          <div className="grid gap-px border border-line-soft bg-line-soft md:grid-cols-3 xl:grid-cols-5">
            {data.kanban.map((column, index) => {
              const previous = index > 0 ? data.kanban[index - 1].visitors : 0;
              const carried = index > 0 ? rate(column.visitors, previous) : 100;

              return (
                <div key={column.id} className="relative flex flex-col bg-ink-900 p-4">
                  {/*
                    The share of the previous column that made it here, printed
                    on the seam between the two. It turns five separate boxes
                    into one funnel you can read left to right, and it is the
                    number that identifies which stage is actually leaking.
                  */}
                  {index > 0 ? (
                    <span
                      className="absolute -left-px top-0 z-10 hidden -translate-x-1/2 border border-line-soft bg-ink-950 px-1.5 py-0.5 text-[0.625rem] tabular-nums xl:block"
                      style={{
                        color:
                          previous === 0
                            ? 'var(--color-ivory-3)'
                            : carried >= 60
                              ? 'rgb(151 208 168)'
                              : carried >= 30
                                ? 'var(--color-gold)'
                                : 'var(--color-rose-2)',
                      }}
                      title={`${column.visitors} of the ${previous} who reached the previous stage`}
                    >
                      {previous === 0 ? '—' : `${carried.toFixed(0)}%`}
                    </span>
                  ) : null}

                  <div className="flex items-baseline justify-between gap-2 border-b border-line-soft pb-3">
                    <p className="label">{column.title}</p>
                    <span className="numeral text-xl text-ivory">{column.visitors}</span>
                  </div>

                  <div className="mt-3 space-y-2.5">
                    {column.cards.map((card) => (
                      <article
                        key={card.label}
                        className="border-l-2 bg-ink-800 p-3 transition-colors hover:bg-ink-700"
                        style={{ borderColor: toneBorder(card.tone) }}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[0.625rem] uppercase tracking-[0.12em] text-ivory-3">
                            {card.label}
                          </p>
                          <span
                            className="numeral shrink-0 text-base"
                            style={{ color: toneText(card.tone) }}
                          >
                            {card.value}
                          </span>
                        </div>
                        <p className="mt-2 text-[0.6875rem] leading-relaxed text-ivory-3">
                          {card.detail}
                        </p>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ------------------------------------------------------- funnel */}
        <Section
          title="Every step, in order"
          blurb="Percentages on the right are share of everyone who landed. The line underneath each bar is the one to act on: how many of the previous step made it through."
        >
          <div className="panel p-5 sm:p-7">
            <FunnelBars steps={data.funnel} />
          </div>
        </Section>

        {/* --------------------------------------------------------- over time */}
        <Section
          title="Over time"
          blurb="Hover for any day. Revenue is read against the right-hand scale."
        >
          <div className="panel p-5 sm:p-7">
            <LineChart
              data={data.daily}
              series={[
                { key: 'visitors', label: 'Visitors', color: CHART_COLORS[0] },
                { key: 'quizCompletions', label: 'Quizzes finished', color: CHART_COLORS[2] },
                { key: 'purchases', label: 'Sales', color: CHART_COLORS[3] },
                {
                  key: 'revenueCents',
                  label: 'Revenue',
                  color: CHART_COLORS[1],
                  axis: 'right',
                  format: formatMoney,
                },
              ]}
            />
          </div>
        </Section>

        {/* ------------------------------------------------------ questions */}
        <Section
          title="Which question loses them"
          blurb="How many people answered each of the seven. The biggest fall is the question to rewrite first."
        >
          <div className="panel p-5 sm:p-7">
            <BarList
              rows={data.questions.map((question) => ({
                label: `Q${question.step} · ${question.chapter}`,
                value: question.visitors,
                sub: question.lost > 0 ? `${question.lost} dropped` : undefined,
                tone:
                  question.lost > 0 && question.step > 1
                    ? 'rgb(212 175 106 / 0.6)'
                    : 'rgb(var(--accent) / 0.6)',
              }))}
            />
          </div>
        </Section>

        {/* ---------------------------------------------------------- products */}
        <Section
          title="The three products"
          blurb="Clicks are intent, sales are money. A tier with clicks and no sales is a price or a checkout problem, not an interest problem."
        >
          {/* Six columns need real width before they stop clipping, so the
              donut only moves alongside the table at xl. */}
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="panel overflow-x-auto p-5 sm:p-7">
              <table className="w-full min-w-[34rem] text-left">
                <thead>
                  <tr className="border-b border-line-soft">
                    {['Product', 'Pressed buy', 'Reached Stripe', 'Paid', 'Revenue', 'Buy → paid'].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="whitespace-nowrap pb-3 pr-3 text-[0.625rem] uppercase tracking-[0.14em] text-ivory-3 last:pr-0"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.tiers.map((tier) => (
                    <tr key={tier.tier} className="border-b border-line-soft last:border-0">
                      <td className="whitespace-nowrap py-3.5 pr-3">
                        <span className="text-[0.8125rem] text-ivory">{tier.name}</span>
                        <span className="numeral ml-2 text-ivory-3">
                          ${(tier.amount / 100).toFixed(0)}
                        </span>
                      </td>
                      <td className="numeral py-3.5 pr-3 text-ivory-2">{tier.clicks}</td>
                      <td className="numeral py-3.5 pr-3 text-ivory-2">{tier.reachedStripe}</td>
                      <td className="numeral py-3.5 pr-3 text-ivory">{tier.purchases}</td>
                      <td className="numeral whitespace-nowrap py-3.5 pr-3 text-ivory">
                        {formatMoney(tier.revenueCents)}
                      </td>
                      <td className="numeral py-3.5" style={{ color: 'rgb(var(--accent))' }}>
                        {tier.clicks ? formatPct(tier.clickToPaid) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="panel p-5 sm:p-7">
              <p className="label mb-5">Revenue split</p>
              <Donut
                slices={data.tiers.map((tier) => ({
                  label: tier.name,
                  value: tier.revenueCents,
                }))}
                centerValue={formatMoney(totals.revenueCents)}
                centerLabel="total"
              />
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------- audience */}
        <Section
          title="Who is arriving"
          blurb="Where they come from, what they browse on, and which archetype they land on."
        >
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="panel p-5 sm:p-7">
              <p className="label mb-5">Traffic source</p>
              <BarList
                rows={data.sources.map((source) => ({
                  label: source.source,
                  value: source.visitors,
                  sub: source.checkouts ? `${source.checkouts} reached checkout` : undefined,
                }))}
              />
            </div>

            <div className="panel p-5 sm:p-7">
              <p className="label mb-5">Device</p>
              <Donut
                slices={data.devices.map((device) => ({
                  label: device.device,
                  value: device.visitors,
                }))}
                height={168}
              />
            </div>

            <div className="panel p-5 sm:p-7">
              <p className="label mb-5">Archetype results</p>
              <BarList
                rows={data.archetypes.map((entry) => ({
                  label: isArchetypeId(entry.archetype)
                    ? getArchetype(entry.archetype).shortTitle
                    : entry.archetype,
                  value: entry.visitors,
                }))}
              />
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------ geography */}
        <Section
          title="Where they are"
          blurb="Resolved from the request at the edge — no client-side lookup, so it cannot be faked or blocked. A country sending traffic but no checkouts is a targeting or a pricing signal."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="panel p-5 sm:p-7">
              <p className="label mb-5">Country</p>
              {data.countries.length ? (
                <BarList
                  rows={data.countries.map((entry) => ({
                    label: `${countryFlag(entry.country)}  ${countryName(entry.country)}`,
                    value: entry.visitors,
                    sub: entry.checkouts ? `${entry.checkouts} reached checkout` : undefined,
                    tone: entry.checkouts
                      ? 'rgb(151 208 168 / 0.7)'
                      : 'rgb(var(--accent) / 0.6)',
                  }))}
                />
              ) : (
                <GeoEmpty />
              )}
            </div>

            <div className="panel p-5 sm:p-7">
              <p className="label mb-5">Region</p>
              {data.regions.length ? (
                <BarList
                  rows={data.regions.map((entry) => ({
                    label: `${countryFlag(entry.country)}  ${entry.region} · ${countryName(entry.country)}`,
                    value: entry.visitors,
                    sub: entry.checkouts ? `${entry.checkouts} reached checkout` : undefined,
                  }))}
                />
              ) : (
                <GeoEmpty />
              )}
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------- delivery */}
        <Section
          title="Did they get what they paid for"
          blurb="The last mile. Anyone who paid and never received the file is a refund and a bad review waiting to happen."
        >
          <div className="grid gap-px border border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-4">
            <Tile label="Paid" value={String(delivery.purchases)} sub="confirmed by Stripe" />
            <Tile
              label="Pressed download"
              value={String(delivery.downloadClicks)}
              sub="on the site"
            />
            <Tile
              label="PDF delivered"
              value={String(delivery.downloadsServed)}
              sub={`${formatPct(rate(delivery.downloadsServed, delivery.purchases))} of buyers`}
              accent={delivery.downloadsServed >= delivery.purchases && delivery.purchases > 0}
              warn={delivery.purchases > 0 && delivery.downloadsServed < delivery.purchases}
            />
            <Tile
              label="Notion planner opened"
              value={String(delivery.templateClicks)}
              sub="$5 tier only"
            />
          </div>
        </Section>

        {/* --------------------------------------------------------- orders */}
        <Section
          title="Recent orders"
          blurb={`${data.orders.total} orders created in this window · ${data.orders.fulfilled} fulfilled · ${data.orders.pending} never paid · ${data.orders.failed} failed.`}
        >
          <div className="panel overflow-x-auto p-5 sm:p-7">
            {data.orders.recent.length ? (
              <table className="w-full min-w-[32rem] text-left">
                <thead>
                  <tr className="border-b border-line-soft">
                    {['Order', 'Product', 'Status', 'Amount', 'When'].map((heading) => (
                      <th
                        key={heading}
                        className="whitespace-nowrap pb-3 pr-6 text-[0.625rem] uppercase tracking-[0.14em] text-ivory-3 last:pr-0"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.orders.recent.map((order) => (
                    <tr key={order.id} className="border-b border-line-soft last:border-0">
                      <td className="numeral py-3 pr-4 text-ivory-3">
                        {order.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="py-3 pr-4 text-[0.8125rem] text-ivory-2">{order.tier}</td>
                      <td className="py-3 pr-4">
                        <span
                          className="text-[0.6875rem] uppercase tracking-[0.12em]"
                          style={{ color: statusColor(order.status) }}
                        >
                          {order.status}
                        </span>
                      </td>
                      <td className="numeral py-3 pr-4 text-ivory">{formatMoney(order.amount)}</td>
                      <td className="py-3 text-[0.75rem] text-ivory-3">
                        {new Date(order.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-6 text-center text-[0.8125rem] text-ivory-3">
                No orders in this window yet.
              </p>
            )}
          </div>
        </Section>

        <p className="pt-4 text-center text-[0.6875rem] text-ivory-3">
          {data.storage.eventsStored.toLocaleString()} events in this window · store:{' '}
          {data.storage.driver} · refreshed{' '}
          {new Date(data.generatedAt).toLocaleTimeString()}
        </p>
      </main>
    </div>
  );
}

/* ----------------------------------------------------------------- parts */

/**
 * The one warning that changes how everything above it should be read. On
 * serverless the in-memory store lives inside a single function instance and
 * is wiped whenever it goes cold, so the numbers are a fraction of reality
 * rather than a small undercount — worth saying loudly rather than filing
 * under advisories.
 */
function MemoryWarning() {
  return (
    <div className="flex gap-3.5 border border-gold/30 bg-gold/5 px-4 py-4">
      <AlertTriangle size={17} strokeWidth={1.5} className="mt-0.5 shrink-0 text-gold" />
      <div>
        <p className="text-[0.8125rem] font-semibold text-gold">
          These numbers are not being kept.
        </p>
        <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-ivory-2">
          No <code className="text-gold">DATABASE_URL</code> is set, so events are held in the
          memory of one serverless instance and thrown away whenever it sleeps — which is every
          few minutes on a quiet site. Sales and revenue below are still accurate because they
          are read from Stripe, but visitors, quiz steps and clicks will read far lower than
          they really are. Add a Postgres connection string in Vercel and this banner goes away.
        </p>
        <p className="mt-2 flex items-center gap-2 text-[0.6875rem] text-ivory-3">
          <Database size={12} strokeWidth={1.6} />
          Supabase → Project → Settings → Database → Connection string (session pooler)
        </p>
      </div>
    </div>
  );
}

/**
 * Location comes from the hosting edge, which only fills those headers on a
 * real deployment — so an empty panel locally means "not deployed", not "no
 * visitors", and saying so avoids a false alarm.
 */
function GeoEmpty() {
  return (
    <div className="flex h-[120px] items-center justify-center border border-dashed border-line-soft px-4 text-center text-[0.6875rem] leading-relaxed text-ivory-3">
      No location data yet. Locations are filled in by Vercel's edge on live
      traffic, so this stays empty when running locally.
    </div>
  );
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
        <h2 className="display-md">{title}</h2>
        <p className="max-w-[52ch] text-[0.8125rem] leading-relaxed text-ivory-3">{blurb}</p>
      </div>
      {children}
    </section>
  );
}

function Tile({
  label,
  value,
  sub,
  accent,
  warn,
  series,
  split,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: boolean;
  warn?: boolean;
  series?: number[];
  split?: { current: number; previous: number };
  color?: string;
}) {
  const tone = warn
    ? 'var(--color-gold)'
    : accent
      ? 'rgb(var(--accent))'
      : 'var(--color-ivory)';

  return (
    <div className="flex flex-col bg-ink-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="label">{label}</p>
        {split ? <Delta current={split.current} previous={split.previous} /> : null}
      </div>

      <p className="numeral mt-3 text-4xl leading-none" style={{ color: tone }}>
        {value}
      </p>
      <p className="mt-2 text-[0.6875rem] leading-relaxed text-ivory-3">{sub}</p>

      {series && series.some((v) => v > 0) ? (
        <div className="mt-4">
          <Sparkline values={series} color={color ?? tone} />
        </div>
      ) : (
        // Reserves the same height whether or not there is a line to draw, so
        // one quiet metric cannot shorten its tile and break the row.
        <div className="mt-4 h-[28px]" />
      )}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-950 px-5">{children}</div>
  );
}

const rate = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/**
 * Country code to a readable name, via the browser's own locale data rather
 * than a bundled lookup table — a full ISO list is a few kilobytes that every
 * runtime already ships.
 */
const COUNTRY_NAMES =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function countryName(code: string): string {
  try {
    return COUNTRY_NAMES?.of(code.toUpperCase()) ?? code;
  } catch {
    // Not a valid region subtag — show whatever the edge reported.
    return code;
  }
}

/**
 * Flag emoji from a country code: the two letters map to regional indicator
 * symbols, which every platform renders as that country's flag.
 */
function countryFlag(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '🌐';
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65),
  );
}

/**
 * A card's tone drives two different things, and they need different values.
 *
 * The accent stripe wants a colour that stays quiet when there is nothing
 * wrong; the figure itself has to stay readable in every case. Sharing one
 * function between them is what made "plain" numbers render in the border
 * colour — technically the right hue, and almost invisible as text.
 */
function toneBorder(tone: 'good' | 'warn' | 'bad' | 'plain'): string {
  if (tone === 'good') return 'rgb(151 208 168)';
  if (tone === 'warn') return 'var(--color-gold)';
  if (tone === 'bad') return 'var(--color-rose-2)';
  return 'var(--color-line)';
}

function toneText(tone: 'good' | 'warn' | 'bad' | 'plain'): string {
  return tone === 'plain' ? 'var(--color-ivory)' : toneBorder(tone);
}

function statusColor(status: string): string {
  if (status === 'fulfilled') return 'rgb(151 208 168)';
  if (status === 'paid') return 'rgb(var(--accent))';
  if (status === 'failed') return 'var(--color-rose-2)';
  return 'var(--color-ivory-3)';
}
