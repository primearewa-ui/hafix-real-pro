-- HAFIZ DATA & BILLS Stage 3 schema
-- Run in Supabase SQL Editor after creating a project.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone text,
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_kobo bigint not null default 0 check (balance_kobo >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.catalog (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'vtpass',
  category text not null check (category in ('airtime','data','electricity','tv','education','water')),
  service_id text not null,
  product_code text,
  variation_code text,
  title text not null,
  cost_kobo bigint not null check (cost_kobo >= 0),
  selling_kobo bigint not null check (selling_kobo >= cost_kobo),
  fixed_price boolean not null default true,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists catalog_provider_service_variation_uq
  on public.catalog(provider, service_id, coalesce(variation_code,''), coalesce(product_code,''));

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  provider text not null default 'flutterwave',
  tx_ref text not null unique,
  provider_transaction_id text unique,
  purpose text not null check (purpose in ('wallet_funding','direct_purchase')),
  expected_kobo bigint not null check (expected_kobo > 0),
  currency text not null default 'NGN' check (currency='NGN'),
  status text not null default 'pending' check (status in ('pending','successful','failed','review')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  catalog_id uuid not null references public.catalog(id),
  idempotency_key text not null,
  request_id text not null unique,
  recipient text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  provider_cost_kobo bigint not null check (provider_cost_kobo >= 0),
  status text not null default 'pending' check (status in ('pending','processing','successful','failed','review','refunded')),
  provider_transaction_id text,
  provider_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, idempotency_key)
);

create table if not exists public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  wallet_id uuid not null references public.wallets(user_id),
  kind text not null check (kind in ('deposit','purchase_debit','refund','adjustment')),
  amount_kobo bigint not null check (amount_kobo <> 0),
  reference text not null unique,
  payment_id uuid references public.payments(id),
  order_id uuid references public.orders(id),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.processed_events (
  event_key text primary key,
  source text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now()
);

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists payments_user_created_idx on public.payments(user_id, created_at desc);
create index if not exists ledger_user_created_idx on public.wallet_ledger(user_id, created_at desc);

-- Profile/wallet rows are created automatically at signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.profiles(id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  insert into public.wallets(user_id, balance_kobo) values (new.id,0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Server-only RPC: atomically create order and reserve wallet debit.
-- All monetary values come from the catalog row, never from browser input.
create or replace function public.reserve_order(
  p_user_id uuid, p_catalog_id uuid, p_idempotency_key text, p_recipient text, p_request_id text
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare c public.catalog%rowtype; w public.wallets%rowtype; o public.orders%rowtype;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 12 or length(p_idempotency_key) > 100 then
    raise exception 'INVALID_IDEMPOTENCY_KEY';
  end if;
  if p_recipient is null or length(trim(p_recipient)) < 5 or length(p_recipient) > 100 then
    raise exception 'INVALID_RECIPIENT';
  end if;
  select * into c from public.catalog where id=p_catalog_id and active=true for share;
  if not found then raise exception 'PRODUCT_UNAVAILABLE'; end if;
  insert into public.wallets(user_id,balance_kobo) values (p_user_id,0) on conflict do nothing;
  select * into w from public.wallets where user_id=p_user_id for update;

  select * into o from public.orders where user_id=p_user_id and idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('order_id',o.id,'status',o.status,'duplicate',true);
  end if;
  if w.balance_kobo < c.selling_kobo then raise exception 'INSUFFICIENT_FUNDS'; end if;

  insert into public.orders(user_id,catalog_id,idempotency_key,request_id,recipient,amount_kobo,provider_cost_kobo,status)
  values(p_user_id,c.id,p_idempotency_key,p_request_id,trim(p_recipient),c.selling_kobo,c.cost_kobo,'processing')
  returning * into o;
  update public.wallets set balance_kobo=balance_kobo-c.selling_kobo, updated_at=now() where user_id=p_user_id;
  insert into public.wallet_ledger(user_id,wallet_id,kind,amount_kobo,reference,order_id,note)
  values(p_user_id,p_user_id,'purchase_debit',-c.selling_kobo,'order:'||o.id,o.id,'Reserved for service purchase');
  return jsonb_build_object('order_id',o.id,'status',o.status,'amount_kobo',o.amount_kobo,'service_id',c.service_id,'product_code',c.product_code,'variation_code',c.variation_code,'category',c.category,'duplicate',false);
end;
$$;

-- Server-only RPC: update order once; failed orders get exactly one refund.
create or replace function public.finish_order(
  p_order_id uuid, p_status text, p_provider_transaction_id text, p_provider_response jsonb
) returns jsonb language plpgsql security definer set search_path=public
as $$
declare o public.orders%rowtype; changed integer;
begin
  if p_status not in ('successful','failed','review') then raise exception 'INVALID_STATUS'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  if o.status in ('successful','failed','refunded') then
    return jsonb_build_object('order_id',o.id,'status',o.status,'duplicate',true);
  end if;

  update public.orders set status=p_status, provider_transaction_id=p_provider_transaction_id,
    provider_response=coalesce(p_provider_response,'{}'::jsonb), updated_at=now()
    where id=p_order_id and status in ('pending','processing','review');
  get diagnostics changed = row_count;
  if changed=0 then return jsonb_build_object('order_id',o.id,'status',o.status,'duplicate',true); end if;

  if p_status='failed' then
    update public.wallets set balance_kobo=balance_kobo+o.amount_kobo,updated_at=now() where user_id=o.user_id;
    insert into public.wallet_ledger(user_id,wallet_id,kind,amount_kobo,reference,order_id,note)
    values(o.user_id,o.user_id,'refund',o.amount_kobo,'refund:'||o.id,o.id,'Automatic refund for failed service');
  end if;
  return jsonb_build_object('order_id',o.id,'status',p_status,'duplicate',false);
end;
$$;

-- Server-only RPC: deposit credited at most once per payment reference.
create or replace function public.credit_wallet_deposit(p_payment_id uuid, p_verified_ref text, p_amount_kobo bigint)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare p public.payments%rowtype; existing public.wallet_ledger%rowtype;
begin
  select * into p from public.payments where id=p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into existing from public.wallet_ledger where reference='deposit:'||p.id;
  if found then return jsonb_build_object('credited',false,'duplicate',true); end if;
  if p.status='successful' then return jsonb_build_object('credited',false,'duplicate',true); end if;
  if p.tx_ref<>p_verified_ref or p.expected_kobo<>p_amount_kobo or p.currency<>'NGN' then
    update public.payments set status='review',updated_at=now() where id=p.id;
    raise exception 'PAYMENT_MISMATCH';
  end if;
  update public.payments set status='successful',updated_at=now() where id=p.id;
  insert into public.wallets(user_id,balance_kobo) values(p.user_id,0) on conflict do nothing;
  update public.wallets set balance_kobo=balance_kobo+p_amount_kobo,updated_at=now() where user_id=p.user_id;
  insert into public.wallet_ledger(user_id,wallet_id,kind,amount_kobo,reference,payment_id,note)
  values(p.user_id,p.user_id,'deposit',p_amount_kobo,'deposit:'||p.id,p.id,'Verified Flutterwave wallet deposit');
  return jsonb_build_object('credited',true,'duplicate',false);
end;
$$;

-- Lock down all writes: customers may read only their own rows. Admin/server
-- mutations go through trusted server-side functions using service role.
alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.catalog enable row level security;
alter table public.payments enable row level security;
alter table public.orders enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.processed_events enable row level security;

create policy "profiles select own" on public.profiles for select to authenticated using (id=auth.uid());
create policy "profiles update own basic" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid() and role='customer');
create policy "wallet read own" on public.wallets for select to authenticated using (user_id=auth.uid());
create policy "catalog active read" on public.catalog for select to anon,authenticated using (active=true);
create policy "payments read own" on public.payments for select to authenticated using (user_id=auth.uid());
create policy "orders read own" on public.orders for select to authenticated using (user_id=auth.uid());
create policy "ledger read own" on public.wallet_ledger for select to authenticated using (user_id=auth.uid());

revoke all on function public.reserve_order(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.finish_order(uuid,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.credit_wallet_deposit(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.reserve_order(uuid,uuid,text,text,text) to service_role;
grant execute on function public.finish_order(uuid,text,text,jsonb) to service_role;
grant execute on function public.credit_wallet_deposit(uuid,text,bigint) to service_role;


-- SUPPORT CHAT ADD-ON (safe foundation; chat API/server authorization still required).
-- Allow an owner to promote a support agent only through trusted admin tooling.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('customer','admin','agent'));

create table if not exists public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default 'Customer support',
  status text not null default 'open' check (status in ('open','pending','resolved')),
  assigned_agent uuid references auth.users(id) on delete set null,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_kind text not null check (sender_kind in ('customer','agent','admin','system')),
  body text not null check (length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists support_conversations_customer_idx on public.support_conversations(customer_id, last_message_at desc);
create index if not exists support_messages_conversation_idx on public.support_messages(conversation_id, created_at);
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
-- Customers can read only their own conversations/messages. Do not add broad insert/update policies.
create policy "customers read own support conversations" on public.support_conversations for select to authenticated using (customer_id=auth.uid());
create policy "customers read messages in own conversations" on public.support_messages for select to authenticated using (exists (select 1 from public.support_conversations c where c.id=conversation_id and c.customer_id=auth.uid()));
-- Message sending, agent/admin inbox access, wallet adjustments and role changes must be implemented
-- through server functions that verify the caller's authenticated role. Never trust a role from the browser.
