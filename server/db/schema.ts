/**
 * K-Drama Dreams schema.
 *
 * Applied automatically on first boot when DATABASE_URL is set, and safe to
 * re-run. Kept as a TypeScript module rather than a .sql file on purpose: both
 * the esbuild server bundle and Vercel's function packer trace imports, and a
 * loose .sql read from disk at runtime would not be included in either.
 */
export const SCHEMA_SQL = `
create extension if not exists "pgcrypto";

create table if not exists users (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  name            text,
  created_at      timestamptz not null default now(),
  total_purchases integer not null default 0
);

create table if not exists quiz_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references users(id) on delete set null,
  answers           jsonb not null default '[]'::jsonb,
  winning_archetype text not null,
  score_breakdown   jsonb not null default '{}'::jsonb,
  completed_at      timestamptz not null default now()
);

create table if not exists orders (
  id                uuid primary key default gen_random_uuid(),
  stripe_session_id text unique,
  user_id           uuid references users(id) on delete set null,
  email             text not null,
  product_tier      text not null,
  amount_paid       integer not null default 0,
  currency          text not null default 'usd',
  status            text not null default 'pending',
  download_url      text,
  storage_key       text,
  blueprint         jsonb,
  winning_archetype text,
  quiz_attempt_id   uuid references quiz_attempts(id) on delete set null,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists saved_favorites (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  archetype_id text not null,
  saved_at     timestamptz not null default now(),
  unique (user_id, archetype_id)
);

-- Added after the initial release; keeps existing deployments migrating cleanly.
alter table orders add column if not exists blueprint jsonb;

create index if not exists orders_email_idx        on orders (lower(email));
create index if not exists orders_created_at_idx   on orders (created_at desc);
create index if not exists quiz_attempts_user_idx  on quiz_attempts (user_id);
create index if not exists favorites_user_idx      on saved_favorites (user_id);

-- All access goes through the server using the service role / direct
-- connection string, so RLS stays on with no public policies attached.
alter table users          enable row level security;
alter table quiz_attempts  enable row level security;
alter table orders         enable row level security;
alter table saved_favorites enable row level security;
`;
