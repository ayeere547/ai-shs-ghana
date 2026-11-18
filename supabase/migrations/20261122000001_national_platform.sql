-- =====================================================================================
-- AI SHS Ghana — Phase 6: national platform
-- Subscription engine (plans, invoices, Paystack payments, renewals, grace periods),
-- sponsored and subsidised plans, plan limits, support tickets, national analytics
-- (aggregate-only, small groups suppressed) and platform revenue.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------------------------
insert into public.permissions (key, scope, description) values
  ('billing.manage',  'school', 'View the school''s subscription and pay platform invoices'),
  ('support.request', 'school', 'Raise support requests with the platform team');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.key in ('billing.manage', 'support.request')
where (p.key = 'billing.manage' and r.key in ('headteacher', 'school_admin', 'accountant'))
   or (p.key = 'support.request' and r.scope = 'school' and r.key not in ('student', 'parent'))
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- Plans: price checks, free stays free, every change audited
-- -------------------------------------------------------------------------------------
alter table public.subscription_plans
  add constraint subscription_plans_prices_check check ((price_monthly_ghs is null or price_monthly_ghs >= 0) and (price_annual_ghs is null or price_annual_ghs >= 0)),
  add constraint subscription_plans_name_check check (length(trim(name)) between 2 and 60);

create or replace function public._plan_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.code = 'free' and (coalesce(new.price_monthly_ghs, 0) <> 0 or coalesce(new.price_annual_ghs, 0) <> 0 or not new.is_active) then
    raise exception 'the free plan must stay free and active' using errcode = '22023';
  end if;
  perform public._audit(auth.uid(), null, 'plan.updated', 'subscription_plan', new.id::text, 'Updated plan ' || new.name,
    jsonb_build_object('monthly', new.price_monthly_ghs, 'annual', new.price_annual_ghs, 'limits', new.limits, 'active', new.is_active, 'public', new.is_public));
  return new;
end $$;
create trigger subscription_plans_guard before update on public.subscription_plans for each row execute function public._plan_guard();

-- -------------------------------------------------------------------------------------
-- Sponsors and sponsorships (sponsored = 100% covered, subsidised = partly covered)
-- -------------------------------------------------------------------------------------
create table public.sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 2 and 120),
  kind text not null default 'other' check (kind in ('government', 'ngo', 'alumni', 'corporate', 'religious', 'individual', 'other')),
  contact_name text check (length(contact_name) <= 120),
  contact_email text check (contact_email is null or contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contact_phone text check (length(contact_phone) <= 30),
  notes text check (length(notes) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger sponsors_updated_at before update on public.sponsors for each row execute function public.set_updated_at();
alter table public.sponsors enable row level security;
revoke all on public.sponsors from anon, authenticated;
grant select, insert, update (name, kind, contact_name, contact_email, contact_phone, notes, is_active) on public.sponsors to authenticated;
create policy sponsors_select on public.sponsors for select to authenticated using (public.has_platform_permission('subscriptions.manage'));
create policy sponsors_insert on public.sponsors for insert to authenticated with check (public.has_platform_permission('subscriptions.manage'));
create policy sponsors_update on public.sponsors for update to authenticated
  using (public.has_platform_permission('subscriptions.manage')) with check (public.has_platform_permission('subscriptions.manage'));

create table public.sponsorships (
  id uuid primary key default gen_random_uuid(),
  sponsor_id uuid not null references public.sponsors (id),
  school_id uuid not null references public.schools (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  coverage_percent numeric(5, 2) not null check (coverage_percent > 0 and coverage_percent <= 100),
  starts_on date not null default current_date,
  ends_on date,
  status text not null default 'active' check (status in ('active', 'ended')),
  notes text check (length(notes) <= 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on > starts_on)
);
create unique index sponsorships_one_active on public.sponsorships (school_id) where status = 'active';
create trigger sponsorships_updated_at before update on public.sponsorships for each row execute function public.set_updated_at();
create trigger sponsorships_school_lock before update on public.sponsorships for each row execute function public.forbid_school_id_change();
alter table public.sponsorships enable row level security;
revoke all on public.sponsorships from anon, authenticated;
grant select on public.sponsorships to authenticated;
create policy sponsorships_select on public.sponsorships for select to authenticated
  using (public.has_platform_permission('subscriptions.manage') or public.school_role_has(school_id, 'billing.manage'));

-- -------------------------------------------------------------------------------------
-- Subscription invoices and online payment intents
-- -------------------------------------------------------------------------------------
create sequence public.subscription_invoice_seq;

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  invoice_number text not null unique,
  plan_id uuid not null references public.subscription_plans (id),
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual')),
  kind text not null default 'new' check (kind in ('new', 'renewal')),
  period_start date not null,
  period_end date not null,
  list_amount numeric(12, 2) not null check (list_amount >= 0),
  sponsor_amount numeric(12, 2) not null default 0 check (sponsor_amount >= 0),
  amount_due numeric(12, 2) generated always as (list_amount - sponsor_amount) stored,
  sponsorship_id uuid references public.sponsorships (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  payment_method text check (payment_method in ('paystack', 'bank_transfer', 'mobile_money', 'cheque', 'sponsor', 'waived')),
  payment_reference text check (length(payment_reference) <= 120),
  provider_reference text unique,
  paid_at timestamptz,
  void_reason text check (length(void_reason) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  check (period_end > period_start),
  check (sponsor_amount <= list_amount)
);
create unique index subscription_invoices_one_open on public.subscription_invoices (school_id) where status = 'open';
create index subscription_invoices_school_idx on public.subscription_invoices (school_id, created_at desc);
create trigger subscription_invoices_updated_at before update on public.subscription_invoices for each row execute function public.set_updated_at();
create trigger subscription_invoices_school_lock before update on public.subscription_invoices for each row execute function public.forbid_school_id_change();
alter table public.subscription_invoices enable row level security;
revoke all on public.subscription_invoices from anon, authenticated;
grant select on public.subscription_invoices to authenticated;
create policy subscription_invoices_select on public.subscription_invoices for select to authenticated
  using (public.has_platform_permission('subscriptions.manage') or public.school_role_has(school_id, 'billing.manage'));

create table public.subscription_payment_intents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  invoice_id uuid not null,
  payer_user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (invoice_id, school_id) references public.subscription_invoices (id, school_id) on delete cascade
);
alter table public.subscription_payment_intents enable row level security;
revoke all on public.subscription_payment_intents from anon, authenticated;
grant select on public.subscription_payment_intents to authenticated;
create policy subscription_payment_intents_select on public.subscription_payment_intents for select to authenticated
  using (payer_user_id = auth.uid() or public.has_platform_permission('subscriptions.manage'));

-- -------------------------------------------------------------------------------------
-- Subscription engine
-- -------------------------------------------------------------------------------------
/** In-app notice to every active member of a school whose role has a permission. */
create or replace function public._notify_holders(p_school uuid, p_permission text, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, school_id, title, body, link)
  select distinct m.user_id, p_school, p_title, p_body, p_link
  from public.school_memberships m join public.role_permissions rp on rp.role_id = m.role_id
  where m.school_id = p_school and m.status = 'active' and rp.permission_key = p_permission
$$;

create or replace function public._plan_price(p_plan uuid, p_cycle text) returns numeric
language sql stable security definer set search_path = '' as $$
  select case p_cycle when 'monthly' then price_monthly_ghs when 'annual' then price_annual_ghs end
  from public.subscription_plans where id = p_plan
$$;

/** Limits that apply now: the plan's while the subscription is in good standing, otherwise the Free plan's. */
create or replace function public._effective_limits(p_school uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.limits from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
     where s.school_id = p_school and s.status in ('trialing', 'active', 'grace')),
    (select limits from public.subscription_plans where code = 'free'),
    '{}'::jsonb)
$$;

/** Marks an invoice paid and moves the school onto that plan and period. */
create or replace function public._settle_subscription_invoice(p_invoice uuid, p_method text, p_reference text, p_provider_reference text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.subscription_invoices; v_funding text;
begin
  select * into v from public.subscription_invoices where id = p_invoice for update;
  if not found or v.status <> 'open' then raise exception 'invoice is not open' using errcode = 'P0001'; end if;
  -- A new subscription runs from the day it is paid, so a late payment doesn't lose days.
  if v.kind = 'new' and v.period_start < current_date then
    update public.subscription_invoices set period_end = period_end + (current_date - period_start), period_start = current_date where id = v.id;
  end if;
  update public.subscription_invoices
  set status = 'paid', payment_method = p_method, payment_reference = p_reference, provider_reference = p_provider_reference, paid_at = now()
  where id = v.id returning * into v;
  v_funding := case when v.sponsor_amount = 0 then 'self_funded' when v.amount_due = 0 then 'sponsored' else 'subsidised' end;
  insert into public.subscriptions (school_id, plan_id, status, funding_model, billing_cycle, current_period_end)
  values (v.school_id, v.plan_id, 'active', v_funding, v.billing_cycle, v.period_end::timestamp at time zone 'Africa/Accra')
  on conflict (school_id) do update set plan_id = excluded.plan_id, status = 'active', funding_model = excluded.funding_model,
    billing_cycle = excluded.billing_cycle, current_period_end = excluded.current_period_end;
  perform public._audit(p_actor, v.school_id, 'subscription.paid', 'subscription_invoice', v.id::text, v.invoice_number || ' settled (' || p_method || ')',
    jsonb_build_object('amount', v.amount_due, 'sponsor_amount', v.sponsor_amount, 'reference', p_reference));
  perform public._notify_holders(v.school_id, 'billing.manage', 'Subscription active',
    'Your plan is active until ' || to_char(v.period_end, 'DD Mon YYYY') || '.', '/school/billing');
end $$;

/** Issues an invoice (voiding any other open one). Fully covered invoices settle at once. */
create or replace function public._issue_subscription_invoice(p_school uuid, p_plan uuid, p_cycle text, p_kind text, p_start date, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_price numeric; v_sp public.sponsorships; v_sponsor numeric := 0; v_id uuid; v_end date; v_number text;
begin
  v_price := public._plan_price(p_plan, p_cycle);
  if v_price is null then raise exception 'this plan has no % price yet. Please contact the platform team', p_cycle using errcode = 'P0001'; end if;
  v_end := (case p_cycle when 'monthly' then p_start + interval '1 month' else p_start + interval '1 year' end)::date;
  select * into v_sp from public.sponsorships
  where school_id = p_school and status = 'active' and plan_id = p_plan and starts_on <= greatest(p_start, current_date) and (ends_on is null or ends_on >= greatest(p_start, current_date));
  if found then v_sponsor := round(v_price * v_sp.coverage_percent / 100, 2); end if;
  update public.subscription_invoices set status = 'void', void_reason = 'Replaced by a new invoice' where school_id = p_school and status = 'open';
  v_number := 'SUB-' || to_char(now() at time zone 'Africa/Accra', 'YY') || '-' || lpad(nextval('public.subscription_invoice_seq')::text, 6, '0');
  insert into public.subscription_invoices (school_id, invoice_number, plan_id, billing_cycle, kind, period_start, period_end, list_amount, sponsor_amount, sponsorship_id, created_by)
  values (p_school, v_number, p_plan, p_cycle, p_kind, p_start, v_end, v_price, v_sponsor, v_sp.id, p_actor)
  returning id into v_id;
  perform public._audit(p_actor, p_school, 'subscription.invoice_issued', 'subscription_invoice', v_id::text, v_number || ' for GH₵' || (v_price - v_sponsor),
    jsonb_build_object('plan_id', p_plan, 'cycle', p_cycle, 'kind', p_kind, 'list_amount', v_price, 'sponsor_amount', v_sponsor));
  if v_price - v_sponsor = 0 then
    perform public._settle_subscription_invoice(v_id, case when v_sponsor > 0 then 'sponsor' else 'waived' end, null, null, p_actor);
  else
    perform public._notify_holders(p_school, 'billing.manage', 'Subscription invoice ' || v_number,
      'GH₵' || to_char(v_price - v_sponsor, 'FM9999999990.00') || ' is due. Pay under Billing & plan.', '/school/billing');
  end if;
  return v_id;
end $$;

/** A school (or platform finance staff) asks for a paid plan. Same plan + cycle while active = renewal from the current end date. */
create or replace function public.request_subscription(p_school uuid, p_plan_code text, p_cycle text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_plan public.subscription_plans; v_sub public.subscriptions; v_start date := current_date; v_kind text := 'new';
begin
  if not (public.has_school_permission(p_school, 'billing.manage') or public.has_platform_permission('subscriptions.manage')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if not exists (select 1 from public.schools where id = p_school and status = 'active') then raise exception 'school is not active' using errcode = 'P0001'; end if;
  if p_cycle not in ('monthly', 'annual') then raise exception 'choose monthly or annual billing' using errcode = '22023'; end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and is_active and (is_public or public.has_platform_permission('subscriptions.manage'));
  if not found then raise exception 'plan not available' using errcode = 'P0002'; end if;
  if v_plan.code = 'free' then raise exception 'the free plan needs no invoice' using errcode = '22023'; end if;
  select * into v_sub from public.subscriptions where school_id = p_school;
  if found and v_sub.plan_id = v_plan.id and v_sub.billing_cycle = p_cycle and v_sub.status in ('trialing', 'active') and v_sub.current_period_end > now() then
    v_start := (v_sub.current_period_end at time zone 'Africa/Accra')::date;
    v_kind := 'renewal';
  end if;
  return public._issue_subscription_invoice(p_school, v_plan.id, p_cycle, v_kind, v_start, auth.uid());
end $$;

create or replace function public.void_subscription_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.subscription_invoices;
begin
  select * into v from public.subscription_invoices where id = p_invoice for update;
  if not found or not (public.has_platform_permission('subscriptions.manage') or public.has_school_permission(v.school_id, 'billing.manage')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v.status <> 'open' then raise exception 'only open invoices can be cancelled' using errcode = 'P0001'; end if;
  update public.subscription_invoices set status = 'void', void_reason = left(coalesce(nullif(trim(p_reason), ''), 'Cancelled'), 300) where id = v.id;
  perform public._audit(auth.uid(), v.school_id, 'subscription.invoice_void', 'subscription_invoice', v.id::text, 'Cancelled ' || v.invoice_number, jsonb_build_object('reason', p_reason));
end $$;

/** Platform finance staff record an offline payment (bank transfer, cheque, MoMo) or waive an invoice. */
create or replace function public.record_subscription_payment(p_invoice uuid, p_method text, p_reference text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_method not in ('bank_transfer', 'mobile_money', 'cheque', 'waived') then raise exception 'invalid payment method' using errcode = '22023'; end if;
  if coalesce(trim(p_reference), '') = '' then raise exception 'a reference (or reason for waiving) is required' using errcode = '22023'; end if;
  perform public._settle_subscription_invoice(p_invoice, p_method, left(trim(p_reference), 120), null, auth.uid());
end $$;

/** Platform finance staff put a school on a plan directly (Free, institution-funded deals, corrections). */
create or replace function public.assign_plan(p_school uuid, p_plan_code text, p_cycle text, p_period_end date, p_funding text, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_plan public.subscription_plans;
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required' using errcode = '22023'; end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and is_active;
  if not found then raise exception 'plan not available' using errcode = 'P0002'; end if;
  if p_cycle not in ('none', 'monthly', 'annual') or p_funding not in ('self_funded', 'sponsored', 'subsidised', 'institution_funded') then
    raise exception 'invalid billing cycle or funding model' using errcode = '22023';
  end if;
  if v_plan.code <> 'free' and (p_period_end is null or p_period_end <= current_date) then raise exception 'set an end date in the future' using errcode = '22023'; end if;
  if not exists (select 1 from public.schools where id = p_school) then raise exception 'school not found' using errcode = 'P0002'; end if;
  update public.subscription_invoices set status = 'void', void_reason = 'Plan assigned by the platform team' where school_id = p_school and status = 'open';
  insert into public.subscriptions (school_id, plan_id, status, funding_model, billing_cycle, current_period_end)
  values (p_school, v_plan.id, 'active', p_funding, case when v_plan.code = 'free' then 'none' else p_cycle end,
          case when v_plan.code = 'free' then null else p_period_end::timestamp at time zone 'Africa/Accra' end)
  on conflict (school_id) do update set plan_id = excluded.plan_id, status = 'active', funding_model = excluded.funding_model,
    billing_cycle = excluded.billing_cycle, current_period_end = excluded.current_period_end;
  perform public._audit(auth.uid(), p_school, 'subscription.assigned', 'school', p_school::text, 'Assigned the ' || v_plan.name || ' plan',
    jsonb_build_object('cycle', p_cycle, 'period_end', p_period_end, 'funding', p_funding, 'reason', trim(p_reason)));
  perform public._notify_holders(p_school, 'billing.manage', 'Your plan changed', 'Your school is now on the ' || v_plan.name || ' plan.', '/school/billing');
end $$;

create or replace function public.set_sponsorship(p_sponsor uuid, p_school uuid, p_plan_code text, p_percent numeric, p_starts date, p_ends date, p_notes text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_sponsor public.sponsors; v_plan public.subscription_plans;
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  select * into v_sponsor from public.sponsors where id = p_sponsor and is_active;
  if not found then raise exception 'sponsor not found' using errcode = 'P0002'; end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and is_active and code <> 'free';
  if not found then raise exception 'choose a paid plan' using errcode = '22023'; end if;
  if not exists (select 1 from public.schools where id = p_school) then raise exception 'school not found' using errcode = 'P0002'; end if;
  update public.sponsorships set status = 'ended' where school_id = p_school and status = 'active';
  insert into public.sponsorships (sponsor_id, school_id, plan_id, coverage_percent, starts_on, ends_on, notes, created_by)
  values (p_sponsor, p_school, v_plan.id, p_percent, coalesce(p_starts, current_date), p_ends, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  perform public._audit(auth.uid(), p_school, 'subscription.sponsorship_set', 'sponsorship', v_id::text,
    v_sponsor.name || ' covers ' || p_percent || '% of ' || v_plan.name, jsonb_build_object('ends_on', p_ends));
  perform public._notify_holders(p_school, 'billing.manage', 'Sponsorship added',
    v_sponsor.name || ' covers ' || trim(to_char(p_percent, 'FM990.##')) || '% of your ' || v_plan.name || ' plan.', '/school/billing');
  return v_id;
end $$;

create or replace function public.end_sponsorship(p_sponsorship uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.sponsorships;
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  update public.sponsorships set status = 'ended', ends_on = least(coalesce(ends_on, current_date), greatest(current_date, starts_on + 1))
  where id = p_sponsorship and status = 'active' returning * into v;
  if not found then raise exception 'sponsorship is not active' using errcode = 'P0001'; end if;
  perform public._audit(auth.uid(), v.school_id, 'subscription.sponsorship_ended', 'sponsorship', v.id::text, 'Sponsorship ended', jsonb_build_object('reason', p_reason));
end $$;

/** School billing staff start an online payment for the full amount due. */
create or replace function public.create_subscription_intent(p_invoice uuid, p_reference text) returns numeric
language plpgsql security definer set search_path = '' as $$
declare v public.subscription_invoices;
begin
  select * into v from public.subscription_invoices where id = p_invoice;
  if not found or not public.has_school_permission(v.school_id, 'billing.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if v.status <> 'open' or v.amount_due <= 0 then raise exception 'invoice is not open for payment' using errcode = 'P0001'; end if;
  if p_reference !~ '^AISHS-SUB-[0-9a-f-]{36}$' then raise exception 'invalid reference' using errcode = '22023'; end if;
  insert into public.subscription_payment_intents (school_id, invoice_id, payer_user_id, amount, reference)
  values (v.school_id, v.id, auth.uid(), v.amount_due, p_reference);
  return v.amount_due;
end $$;

/**
 * Server only (after Paystack re-verification). Idempotent. Returns the invoice id, or null when the
 * payment can't be applied (amount mismatch or invoice no longer open) — recorded for follow-up/refund.
 */
create or replace function public.complete_subscription_payment(p_reference text, p_amount numeric, p_provider_reference text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_intent public.subscription_payment_intents; v_status text;
begin
  select * into v_intent from public.subscription_payment_intents where reference = p_reference for update;
  if not found then raise exception 'unknown payment reference' using errcode = 'P0002'; end if;
  if exists (select 1 from public.subscription_invoices where provider_reference = p_provider_reference) then return v_intent.invoice_id; end if;
  select status into v_status from public.subscription_invoices where id = v_intent.invoice_id for update;
  if p_amount <> v_intent.amount or v_status <> 'open' then
    update public.subscription_payment_intents set status = 'failed', completed_at = now() where id = v_intent.id;
    perform public._audit(v_intent.payer_user_id, v_intent.school_id, 'subscription.payment_unmatched', 'subscription_payment_intent', v_intent.id::text,
      'Payment received but not applied — needs follow-up', jsonb_build_object('reference', p_reference, 'amount', p_amount, 'invoice_status', v_status));
    return null;
  end if;
  perform public._settle_subscription_invoice(v_intent.invoice_id, 'paystack', p_reference, p_provider_reference, v_intent.payer_user_id);
  update public.subscription_payment_intents set status = 'succeeded', completed_at = now() where id = v_intent.id;
  return v_intent.invoice_id;
end $$;

/**
 * Daily job (server only): ends lapsed sponsorships, issues renewal invoices 7 days before the end
 * of a paid period, moves expired subscriptions into a 14-day grace period, then to past due.
 */
create or replace function public.subscription_lifecycle() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record; v_end date; v_ended int; v_renewals int := 0; v_grace int := 0; v_past_due int := 0;
begin
  update public.sponsorships set status = 'ended' where status = 'active' and ends_on is not null and ends_on < current_date;
  get diagnostics v_ended = row_count;

  for r in
    select s.* from public.subscriptions s join public.schools sc on sc.id = s.school_id
    where sc.status = 'active' and s.status in ('trialing', 'active', 'grace') and s.billing_cycle in ('monthly', 'annual')
      and s.current_period_end is not null and s.current_period_end <= now() + interval '7 days'
  loop
    v_end := (r.current_period_end at time zone 'Africa/Accra')::date;
    if public._plan_price(r.plan_id, r.billing_cycle) is not null
       and not exists (select 1 from public.subscription_invoices where school_id = r.school_id and (status = 'open' or (kind = 'renewal' and period_start = v_end))) then
      perform public._issue_subscription_invoice(r.school_id, r.plan_id, r.billing_cycle, 'renewal', v_end, null);
      v_renewals := v_renewals + 1;
    end if;
  end loop;

  for r in
    update public.subscriptions set status = 'grace'
    where status in ('trialing', 'active') and current_period_end is not null and current_period_end <= now()
    returning school_id
  loop
    v_grace := v_grace + 1;
    perform public._notify_holders(r.school_id, 'billing.manage', 'Subscription expired',
      'Your plan has ended. Pay the renewal invoice within 14 days to keep your plan''s features.', '/school/billing');
  end loop;

  for r in
    update public.subscriptions set status = 'past_due'
    where status = 'grace' and current_period_end < now() - interval '14 days'
    returning school_id
  loop
    v_past_due := v_past_due + 1;
    perform public._notify_holders(r.school_id, 'billing.manage', 'Subscription past due',
      'Your school now has the Free plan''s limits. Your records are safe — pay the renewal invoice to restore your plan.', '/school/billing');
  end loop;

  return jsonb_build_object('sponsorships_ended', v_ended, 'renewal_invoices', v_renewals, 'entered_grace', v_grace, 'past_due', v_past_due);
end $$;

/** Billing page data for one school. */
create or replace function public.school_billing_summary(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.school_role_has(p_school, 'billing.manage') or public.has_platform_permission('subscriptions.manage')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'subscription', (select jsonb_build_object('plan_code', p.code, 'plan_name', p.name, 'status', s.status, 'billing_cycle', s.billing_cycle,
                       'current_period_end', s.current_period_end, 'funding_model', s.funding_model)
                     from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id where s.school_id = p_school),
    'limits', public._effective_limits(p_school),
    'usage', jsonb_build_object(
      'active_students', (select count(*) from public.students where school_id = p_school and status = 'active'),
      'active_staff', (select count(*) from public.staff where school_id = p_school and employment_status = 'active'),
      'ai_requests_this_month', public._ai_requests_this_month(p_school)),
    'sponsorship', (select jsonb_build_object('sponsor', sp.name, 'kind', sp.kind, 'coverage_percent', x.coverage_percent, 'plan_name', p.name,
                      'starts_on', x.starts_on, 'ends_on', x.ends_on)
                    from public.sponsorships x join public.sponsors sp on sp.id = x.sponsor_id join public.subscription_plans p on p.id = x.plan_id
                    where x.school_id = p_school and x.status = 'active')
  );
end $$;

-- Plan limit: active students. Counts against the plan in good standing, or Free when lapsed.
create or replace function public._enforce_student_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_max text; v_count int;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then return new; end if;
  v_max := public._effective_limits(new.school_id) ->> 'max_students';
  if v_max is null then return new; end if;
  select count(*) into v_count from public.students where school_id = new.school_id and status = 'active';
  if v_count >= v_max::int then
    raise exception 'Your plan allows up to % active students. Upgrade under Billing & plan to add more.', v_max using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger students_plan_limit before insert or update of status on public.students for each row execute function public._enforce_student_limit();

-- =====================================================================================
-- SUPPORT
-- =====================================================================================
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default ('T-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  school_id uuid references public.schools (id) on delete set null,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (length(trim(subject)) between 3 and 160),
  category text not null check (category in ('technical', 'billing', 'account', 'data_protection', 'feature_request', 'other')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting_on_requester', 'resolved', 'closed')),
  assigned_to uuid references public.profiles (id) on delete set null,
  last_activity_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_tickets_status_idx on public.support_tickets (status, last_activity_at desc);
create index support_tickets_requester_idx on public.support_tickets (requester_id, created_at desc);
create trigger support_tickets_updated_at before update on public.support_tickets for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  from_staff boolean not null default false,
  is_internal boolean not null default false,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index support_messages_ticket_idx on public.support_messages (ticket_id, created_at);

create or replace function public.can_view_ticket(p_ticket uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.support_tickets t
    where t.id = p_ticket and (t.requester_id = auth.uid() or public.has_platform_permission('support.manage')
      or (t.school_id is not null and public.school_role_has(t.school_id, 'school.settings.manage')))
  )
$$;

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_tickets, public.support_messages from anon, authenticated;
grant select on public.support_tickets, public.support_messages to authenticated;
create policy support_tickets_select on public.support_tickets for select to authenticated
  using (requester_id = auth.uid() or public.has_platform_permission('support.manage')
    or (school_id is not null and public.school_role_has(school_id, 'school.settings.manage')));
create policy support_messages_select on public.support_messages for select to authenticated
  using (public.can_view_ticket(ticket_id) and (not is_internal or public.has_platform_permission('support.manage')));

create or replace function public._notify_support_staff(p_school uuid, p_title text, p_body text, p_link text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, school_id, title, body, link)
  select distinct pu.user_id, p_school, p_title, p_body, p_link
  from public.platform_users pu join public.role_permissions rp on rp.role_id = pu.role_id
  where rp.permission_key = 'support.manage'
$$;

/** Any signed-in user can ask for help; for a school, the role needs support.request (works while the school is suspended). */
create or replace function public.open_support_ticket(p_school uuid, p_subject text, p_category text, p_priority text, p_body text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_ref text;
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_school is not null and not public.school_role_has(p_school, 'support.request') then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_priority not in ('low', 'normal', 'high') then raise exception 'invalid priority' using errcode = '22023'; end if;
  if (select count(*) from public.support_tickets where requester_id = auth.uid() and status not in ('resolved', 'closed')) >= 10 then
    raise exception 'you have 10 open requests — please wait for a reply or close one' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (school_id, requester_id, subject, category, priority)
  values (p_school, auth.uid(), trim(p_subject), p_category, p_priority) returning id, reference into v_id, v_ref;
  insert into public.support_messages (ticket_id, author_id, from_staff, body) values (v_id, auth.uid(), false, trim(p_body));
  perform public._audit(auth.uid(), p_school, 'support.ticket_opened', 'support_ticket', v_id::text, v_ref || ': ' || trim(p_subject), jsonb_build_object('category', p_category));
  perform public._notify_support_staff(p_school, 'New support request ' || v_ref, trim(p_subject), '/platform/support/' || v_id);
  return v_id;
end $$;

create or replace function public.reply_support_ticket(p_ticket uuid, p_body text, p_internal boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets; v_staff boolean := public.has_platform_permission('support.manage'); v_id uuid;
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found or not public.can_view_ticket(p_ticket) then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_internal and not v_staff then raise exception 'permission denied' using errcode = '42501'; end if;
  if t.status = 'closed' then raise exception 'this request is closed — please open a new one' using errcode = 'P0001'; end if;
  insert into public.support_messages (ticket_id, author_id, from_staff, is_internal, body)
  values (p_ticket, auth.uid(), v_staff, coalesce(p_internal, false), trim(p_body)) returning id into v_id;
  if coalesce(p_internal, false) then
    update public.support_tickets set last_activity_at = now() where id = p_ticket;
  elsif v_staff then
    update public.support_tickets set last_activity_at = now(), status = 'waiting_on_requester', assigned_to = coalesce(assigned_to, auth.uid()) where id = p_ticket;
    perform public._notify(t.requester_id, t.school_id, 'Reply to ' || t.reference, t.subject, '/app/support/' || t.id);
  else
    update public.support_tickets set last_activity_at = now(), status = case when status in ('waiting_on_requester', 'resolved') then 'open' else status end, resolved_at = null where id = p_ticket;
    if t.assigned_to is not null then
      perform public._notify(t.assigned_to, t.school_id, 'Update on ' || t.reference, t.subject, '/platform/support/' || t.id);
    else
      perform public._notify_support_staff(t.school_id, 'Update on ' || t.reference, t.subject, '/platform/support/' || t.id);
    end if;
  end if;
  return v_id;
end $$;

/** Support staff change status/priority/assignee. Requesters may only close or mark their own request resolved. */
create or replace function public.update_support_ticket(p_ticket uuid, p_status text, p_priority text, p_assignee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.support_tickets; v_staff boolean := public.has_platform_permission('support.manage');
begin
  select * into t from public.support_tickets where id = p_ticket for update;
  if not found then raise exception 'permission denied' using errcode = '42501'; end if;
  if not v_staff then
    if t.requester_id <> auth.uid() or p_status not in ('resolved', 'closed') or p_priority is not null or p_assignee is not null then
      raise exception 'permission denied' using errcode = '42501';
    end if;
  end if;
  if p_status is not null and p_status not in ('open', 'in_progress', 'waiting_on_requester', 'resolved', 'closed') then raise exception 'invalid status' using errcode = '22023'; end if;
  if p_priority is not null and p_priority not in ('low', 'normal', 'high', 'urgent') then raise exception 'invalid priority' using errcode = '22023'; end if;
  if p_assignee is not null and not exists (
    select 1 from public.platform_users pu join public.role_permissions rp on rp.role_id = pu.role_id where pu.user_id = p_assignee and rp.permission_key = 'support.manage'
  ) then raise exception 'assignee must be support staff' using errcode = '22023'; end if;
  update public.support_tickets set
    status = coalesce(p_status, status),
    priority = coalesce(p_priority, priority),
    assigned_to = coalesce(p_assignee, assigned_to),
    resolved_at = case when coalesce(p_status, status) in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end,
    last_activity_at = now()
  where id = p_ticket;
  perform public._audit(auth.uid(), t.school_id, 'support.ticket_updated', 'support_ticket', t.id::text, t.reference || ' updated',
    jsonb_build_object('status', p_status, 'priority', p_priority, 'assignee', p_assignee));
  if v_staff and p_status in ('resolved', 'closed') and t.status not in ('resolved', 'closed') and t.requester_id <> auth.uid() then
    perform public._notify(t.requester_id, t.school_id, t.reference || ' resolved', t.subject, '/app/support/' || t.id);
  end if;
end $$;

-- Support staff can see the name and email of people who raised a ticket (and nothing else new).
create or replace function public.can_view_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user = auth.uid()
    or exists (
      select 1 from public.school_memberships target
      where target.user_id = p_user and target.status = 'active' and public.school_role_has(target.school_id, 'members.read')
    )
    or (
      public.has_platform_permission('schools.read_all')
      and (exists (select 1 from public.platform_users where user_id = p_user)
           or exists (select 1 from public.schools where registered_by = p_user))
    )
    or (public.has_platform_permission('platform.users.manage') and exists (select 1 from public.platform_users where user_id = p_user))
    or (public.has_platform_permission('support.manage') and exists (select 1 from public.support_tickets where requester_id = p_user))
$$;

-- =====================================================================================
-- NATIONAL ANALYTICS (aggregate only; groups of fewer than 3 schools are suppressed)
-- =====================================================================================
create or replace function public.national_analytics() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare k constant int := 3; v jsonb;
begin
  if not public.has_platform_permission('analytics.national') then raise exception 'permission denied' using errcode = '42501'; end if;
  with sch as (select id, region_code from public.schools where status = 'active' and not is_demo),
  stu as (select st.school_id, count(*) n, count(*) filter (where st.gender = 'female') f, count(*) filter (where st.gender = 'male') m
          from public.students st join sch on sch.id = st.school_id where st.status = 'active' group by 1),
  stf as (select sf.school_id, count(*) n from public.staff sf join sch on sch.id = sf.school_id where sf.employment_status = 'active' group by 1),
  att as (select a.school_id, count(*) total, count(*) filter (where a.status in ('present', 'late')) present
          from public.attendance a join sch on sch.id = a.school_id where a.attendance_date > current_date - 30 group by 1),
  reg as (select sch.region_code, count(*) schools, coalesce(sum(stu.n), 0) students, coalesce(sum(stu.f), 0) female, coalesce(sum(stu.m), 0) male,
                 coalesce(sum(stf.n), 0) staff, coalesce(sum(att.total), 0) att_total, coalesce(sum(att.present), 0) att_present, count(att.school_id) att_schools
          from sch left join stu on stu.school_id = sch.id left join stf on stf.school_id = sch.id left join att on att.school_id = sch.id group by 1)
  select jsonb_build_object(
    'min_group_size', k,
    'totals', (select jsonb_build_object(
        'schools', coalesce(sum(schools), 0),
        'students', case when coalesce(sum(schools), 0) >= k then sum(students) end,
        'female_students', case when coalesce(sum(schools), 0) >= k then sum(female) end,
        'male_students', case when coalesce(sum(schools), 0) >= k then sum(male) end,
        'staff', case when coalesce(sum(schools), 0) >= k then sum(staff) end,
        'attendance_rate_30d', case when coalesce(sum(att_schools), 0) >= k then round(100.0 * sum(att_present) / nullif(sum(att_total), 0), 1) end) from reg),
    'by_region', (select jsonb_agg(jsonb_build_object(
        'region', r.name, 'schools', coalesce(g.schools, 0), 'suppressed', coalesce(g.schools, 0) between 1 and k - 1,
        'students', case when g.schools >= k then g.students end,
        'staff', case when g.schools >= k then g.staff end,
        'students_per_staff', case when g.schools >= k and g.staff > 0 then round(g.students::numeric / g.staff, 1) end,
        'attendance_rate_30d', case when g.att_schools >= k then round(100.0 * g.att_present / nullif(g.att_total, 0), 1) end) order by r.sort)
      from public.regions r left join reg g on g.region_code = r.code),
    'adoption', jsonb_build_object(
        'active_schools', (select count(*) from sch),
        'attendance_30d', (select count(*) from att),
        'assignments_30d', (select count(distinct x.school_id) from public.assignments x join sch on sch.id = x.school_id where x.created_at > now() - interval '30 days'),
        'online_exams_30d', (select count(distinct x.school_id) from public.exams x join sch on sch.id = x.school_id where x.created_at > now() - interval '30 days'),
        'ai_30d', (select count(distinct x.school_id) from public.ai_usage_logs x join sch on sch.id = x.school_id where x.created_at > now() - interval '30 days' and x.status = 'ok'),
        'fee_invoices_90d', (select count(distinct x.school_id) from public.student_invoices x join sch on sch.id = x.school_id where x.created_at > now() - interval '90 days'),
        'parent_portal', (select count(distinct x.school_id) from public.guardians x join sch on sch.id = x.school_id where x.user_id is not null)),
    'plans', (select coalesce(jsonb_agg(jsonb_build_object('plan', p.name, 'funding_model', c.funding_model, 'schools', c.n) order by p.sort, c.funding_model), '[]')
      from (select s.plan_id, s.funding_model, count(*) n from public.subscriptions s join sch on sch.id = s.school_id
            where s.status in ('trialing', 'active', 'grace') group by 1, 2) c join public.subscription_plans p on p.id = c.plan_id),
    'growth', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
        'schools', (select count(*) from public.schools s where not s.is_demo and s.verified_at >= m and s.verified_at < m + interval '1 month')) order by m)
      from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m)
  ) into v;
  return v;
end $$;

create or replace function public.platform_revenue() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'by_month', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
        'collected', coalesce((select sum(i.amount_due) from public.subscription_invoices i join public.schools s on s.id = i.school_id
                               where not s.is_demo and i.status = 'paid' and i.payment_method not in ('waived', 'sponsor') and i.paid_at >= m and i.paid_at < m + interval '1 month'), 0),
        'sponsor_covered', coalesce((select sum(i.sponsor_amount) from public.subscription_invoices i join public.schools s on s.id = i.school_id
                               where not s.is_demo and i.status = 'paid' and i.paid_at >= m and i.paid_at < m + interval '1 month'), 0)) order by m)
      from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m),
    'open_invoices', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount_due), 0)) from public.subscription_invoices i
                      join public.schools s on s.id = i.school_id where not s.is_demo and i.status = 'open'),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select su.status, count(*) n from public.subscriptions su
                  join public.schools s on s.id = su.school_id where not s.is_demo group by 1) x),
    'by_plan', (select coalesce(jsonb_agg(jsonb_build_object('plan', p.name, 'schools', x.n) order by p.sort), '[]') from
                (select su.plan_id, count(*) n from public.subscriptions su join public.schools s on s.id = su.school_id
                 where not s.is_demo and su.status in ('trialing', 'active', 'grace') group by 1) x join public.subscription_plans p on p.id = x.plan_id),
    'sponsors', (select coalesce(jsonb_agg(jsonb_build_object('sponsor', sp.name,
        'active_schools', (select count(*) from public.sponsorships x where x.sponsor_id = sp.id and x.status = 'active'),
        'covered_total', coalesce((select sum(i.sponsor_amount) from public.subscription_invoices i join public.sponsorships x on x.id = i.sponsorship_id
                                   where x.sponsor_id = sp.id and i.status = 'paid'), 0)) order by sp.name), '[]') from public.sponsors sp)
  );
end $$;

-- -------------------------------------------------------------------------------------
-- Function privileges
-- -------------------------------------------------------------------------------------
revoke execute on function public._plan_guard(), public._notify_holders(uuid, text, text, text, text), public._plan_price(uuid, text),
  public._effective_limits(uuid), public._settle_subscription_invoice(uuid, text, text, text, uuid),
  public._issue_subscription_invoice(uuid, uuid, text, text, date, uuid), public._enforce_student_limit(), public._notify_support_staff(uuid, text, text, text),
  public.complete_subscription_payment(text, numeric, text), public.subscription_lifecycle() from public, anon, authenticated;
revoke execute on function public.request_subscription(uuid, text, text), public.void_subscription_invoice(uuid, text),
  public.record_subscription_payment(uuid, text, text), public.assign_plan(uuid, text, text, date, text, text),
  public.set_sponsorship(uuid, uuid, text, numeric, date, date, text), public.end_sponsorship(uuid, text),
  public.create_subscription_intent(uuid, text), public.school_billing_summary(uuid), public.can_view_ticket(uuid),
  public.open_support_ticket(uuid, text, text, text, text), public.reply_support_ticket(uuid, text, boolean),
  public.update_support_ticket(uuid, text, text, uuid), public.national_analytics(), public.platform_revenue() from public, anon;
grant execute on function public.complete_subscription_payment(text, numeric, text), public.subscription_lifecycle() to service_role;
