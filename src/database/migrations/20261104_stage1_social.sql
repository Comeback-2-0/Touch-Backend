-- Stage 1 additive migration. Neo4j owns follows, requests, blocks, and mutes.
-- OpenSearch is the primary People Search provider. PostgreSQL remains the
-- authoritative user source and availability fallback; user_search_outbox
-- records keep the OpenSearch projection synchronized.
create table if not exists user_graph_outbox (id text primary key, user_id text not null references users(id) on delete cascade, operation text not null, payload jsonb not null default '{}'::jsonb, status text not null default 'pending', attempts integer not null default 0, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists idx_user_graph_outbox_pending on user_graph_outbox(status, next_attempt_at, created_at);
create table if not exists user_search_outbox (id text primary key, user_id text not null, operation text not null, payload jsonb not null default '{}'::jsonb, status text not null default 'pending', attempts integer not null default 0, next_attempt_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists idx_user_search_outbox_pending on user_search_outbox(status, next_attempt_at, created_at);
alter table notification_devices add column if not exists capabilities jsonb not null default '[]'::jsonb;
create index if not exists idx_users_profile_username_prefix on users (lower(username) text_pattern_ops) where is_profile_complete = true;
create index if not exists idx_users_profile_name_prefix on users (lower(name) text_pattern_ops) where is_profile_complete = true;
