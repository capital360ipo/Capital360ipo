create extension if not exists pgcrypto;
create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,display_name text,role text not null default 'editor' check(role in('owner','admin','editor','viewer')),created_at timestamptz default now());
create table if not exists public.ipo_master(id uuid primary key default gen_random_uuid(),company_name text not null,slug text unique not null,issue_type text,open_date date,close_date date,listing_date date,price_band text,lot_size integer,status text not null default 'upcoming',description text,source_url text,verified boolean not null default false,updated_at timestamptz not null default now(),created_at timestamptz default now());
create table if not exists public.ipo_gmp(id uuid primary key default gen_random_uuid(),ipo_id uuid references public.ipo_master(id) on delete cascade,gmp_value numeric,currency text default 'INR',source_name text,source_url text,observed_at timestamptz default now(),is_unofficial boolean default true);
create table if not exists public.market_news(id uuid primary key default gen_random_uuid(),title text not null,title_hi text,summary text,summary_hi text,category text default 'Market News',source_name text,source_url text unique not null,published_at timestamptz,language text default 'en',status text not null default 'pending' check(status in('pending','published','rejected')),created_at timestamptz default now());
create table if not exists public.stock_data(id uuid primary key default gen_random_uuid(),symbol text not null,exchange text not null,price numeric,change_value numeric,change_percent numeric,observed_at timestamptz default now(),source_name text,source_url text);
create table if not exists public.market_indices(id uuid primary key default gen_random_uuid(),symbol text not null,value numeric,change_value numeric,change_percent numeric,observed_at timestamptz default now(),source_name text);
create table if not exists public.automation_logs(id uuid primary key default gen_random_uuid(),job_name text not null,status text not null,details jsonb default '{}'::jsonb,created_at timestamptz default now());
create or replace function public.current_user_role() returns text language sql stable security definer set search_path=public as $$ select role from public.profiles where id=auth.uid() $$;
alter table public.profiles enable row level security;alter table public.ipo_master enable row level security;alter table public.ipo_gmp enable row level security;alter table public.market_news enable row level security;alter table public.stock_data enable row level security;alter table public.market_indices enable row level security;alter table public.automation_logs enable row level security;
create policy "public verified IPO read" on public.ipo_master for select using(verified=true);
create policy "public published news read" on public.market_news for select using(status='published');
create policy "public GMP read" on public.ipo_gmp for select using(exists(select 1 from public.ipo_master i where i.id=ipo_id and i.verified=true));
create policy "public stock data read" on public.stock_data for select using(true);
create policy "public indices read" on public.market_indices for select using(true);
create policy "team profile read" on public.profiles for select to authenticated using(id=auth.uid() or public.current_user_role() in('owner','admin'));
create policy "team IPO read" on public.ipo_master for select to authenticated using(public.current_user_role() in('owner','admin','editor','viewer'));
create policy "team IPO edit" on public.ipo_master for all to authenticated using(public.current_user_role() in('owner','admin','editor')) with check(public.current_user_role() in('owner','admin','editor'));
create policy "team news edit" on public.market_news for all to authenticated using(public.current_user_role() in('owner','admin','editor')) with check(public.current_user_role() in('owner','admin','editor'));
create policy "team GMP edit" on public.ipo_gmp for all to authenticated using(public.current_user_role() in('owner','admin','editor')) with check(public.current_user_role() in('owner','admin','editor'));
create policy "team logs read" on public.automation_logs for select to authenticated using(public.current_user_role() in('owner','admin'));
create policy "team stocks read" on public.stock_data for select to authenticated using(true);
create policy "team indices read" on public.market_indices for select to authenticated using(true);
-- Create/invite users via Supabase Auth, then insert their profile rows via trusted SQL.
-- Never allow public users to assign themselves owner/admin roles.
