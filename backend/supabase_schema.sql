create extension if not exists pgcrypto;

create table if not exists profiles (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    email text not null unique,
    phone text,
    role text not null default 'user',
    created_at timestamptz not null default now()
);

create table if not exists calls (
    id uuid primary key default gen_random_uuid(),
    caller_id uuid not null references profiles(id),
    receiver_id uuid not null references profiles(id),
    status text not null default 'started',
    started_at timestamptz not null default now(),
    ended_at timestamptz,
    final_risk_score numeric
);

create table if not exists speaker_profiles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references profiles(id) on delete cascade,
    embedding jsonb,
    language text,
    created_at timestamptz not null default now()
);

create table if not exists call_analysis (
    id uuid primary key default gen_random_uuid(),
    call_id uuid not null references calls(id) on delete cascade,
    timestamp timestamptz not null default now(),
    deepfake_score numeric not null,
    speaker_score numeric not null,
    prosody_score numeric not null,
    context_score numeric not null,
    risk_score numeric not null
);

create table if not exists alerts (
    id uuid primary key default gen_random_uuid(),
    call_id uuid not null references calls(id) on delete cascade,
    severity text not null,
    message text not null,
    recommendation text,
    created_at timestamptz not null default now()
);

-- Row-Level Security (RLS) configuration for prototype testing.
-- To allow the backend to read and write using the anonymous client key, 
-- you can run these commands in your Supabase SQL Editor:
-- 
-- ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE calls DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE speaker_profiles DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE call_analysis DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE alerts DISABLE ROW LEVEL SECURITY;