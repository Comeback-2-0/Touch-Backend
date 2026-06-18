const { getPostgresClient } = require('./postgresClient');

async function ensurePostgresSchema(sql = getPostgresClient()) {
  await sql`
    create table if not exists users (
      id text primary key,
      firebase_uid text unique,
      uid text unique,
      name text not null default '',
      email text unique not null,
      photo text not null default '',
      username text unique,
      bio text not null default '',
      profile_picture text not null default '',
      profile_picture_public_id text not null default '',
      is_private boolean not null default false,
      is_profile_complete boolean not null default false,
      followers_count integer not null default 0,
      following_count integer not null default 0,
      posts_count integer not null default 0,
      role text not null default 'user',
      last_login_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists refresh_sessions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      token_hash text not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null,
      revoked_at timestamptz
    )
  `;

  await sql`
    create table if not exists communities (
      id text primary key,
      name text not null,
      description text not null default '',
      image text not null default '',
      members_count integer not null default 0,
      trending_score numeric not null default 0,
      created_by text references users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists community_memberships (
      user_id text not null references users(id) on delete cascade,
      community_id text not null references communities(id) on delete cascade,
      role text not null default 'member',
      status text not null default 'active',
      joined_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key (user_id, community_id)
    )
  `;

  await sql`
    create table if not exists notification_preferences (
      user_id text primary key references users(id) on delete cascade,
      push_enabled boolean not null default true,
      email_enabled boolean not null default false,
      in_app_enabled boolean not null default true,
      muted_until timestamptz,
      preferences jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists reports (
      id text primary key,
      reporter_id text not null references users(id) on delete cascade,
      target_type text not null,
      target_id text not null,
      reason text not null,
      status text not null default 'open',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists moderation_reviews (
      id text primary key,
      report_id text references reports(id) on delete set null,
      reviewer_id text references users(id) on delete set null,
      target_type text not null,
      target_id text not null,
      status text not null,
      decision text not null default '',
      notes text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `;

  await sql`
    create table if not exists subscriptions (
      id text primary key,
      user_id text not null references users(id) on delete cascade,
      provider text not null,
      provider_subscription_id text not null,
      status text not null,
      current_period_start timestamptz,
      current_period_end timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (provider, provider_subscription_id)
    )
  `;

  await sql`create index if not exists idx_users_username on users(username)`;
  await sql`create index if not exists idx_refresh_sessions_user_id on refresh_sessions(user_id)`;
  await sql`create index if not exists idx_community_memberships_user_id on community_memberships(user_id)`;
  await sql`create index if not exists idx_community_memberships_community_id on community_memberships(community_id)`;
  await sql`create index if not exists idx_reports_target on reports(target_type, target_id)`;
  await sql`create index if not exists idx_moderation_reviews_target on moderation_reviews(target_type, target_id)`;
}

module.exports = {
  ensurePostgresSchema,
};
