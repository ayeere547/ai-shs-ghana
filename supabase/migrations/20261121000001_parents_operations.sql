-- =====================================================================================
-- AI SHS Ghana — Phase 5: parents and school operations
-- Finance (fees in GHS, invoices, payments, receipts, online payments, expenditure,
-- budgets), boarding, library lending, inventory/assets/maintenance, restricted health
-- records, parent–school messages and the notification engine.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------------------------
insert into public.permissions (key, scope, description) values
  ('finance.read',        'school', 'View fees, invoices, payments and expenditure'),
  ('finance.manage',      'school', 'Set fees, issue invoices, record payments and expenditure'),
  ('boarding.manage',     'school', 'Manage dormitories, rooms and bed allocations'),
  ('library.circulation', 'school', 'Manage library books and lending'),
  ('inventory.manage',    'school', 'Manage stores, assets and maintenance'),
  ('health.manage',       'school', 'View and record student health information (authorised health personnel only)'),
  ('parents.message',     'school', 'Message any student''s parents (teachers can message parents of classes they teach)'),
  ('parent.portal',       'school', 'Use the parent portal');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.scope = 'school'
where p.key in ('finance.read','finance.manage','boarding.manage','library.circulation','inventory.manage','health.manage','parents.message','parent.portal')
  and (r.key, p.key) in (
    ('headteacher','finance.read'), ('headteacher','boarding.manage'), ('headteacher','library.circulation'), ('headteacher','inventory.manage'), ('headteacher','parents.message'),
    ('assistant_headteacher','finance.read'), ('assistant_headteacher','boarding.manage'), ('assistant_headteacher','parents.message'),
    ('school_admin','finance.read'), ('school_admin','finance.manage'), ('school_admin','boarding.manage'), ('school_admin','library.circulation'), ('school_admin','inventory.manage'), ('school_admin','parents.message'),
    ('accountant','finance.read'), ('accountant','finance.manage'),
    ('housemaster','boarding.manage'), ('librarian','library.circulation'), ('storekeeper','inventory.manage'),
    ('counsellor','parents.message'),
    -- Health records: the school nurse only. No administrator role receives this by default.
    ('nurse','health.manage'),
    ('parent','parent.portal')
  )
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- Generic tenant table setup helper (triggers + RLS enable + revoke anon)
-- -------------------------------------------------------------------------------------
create or replace function public._tenant_table(p_table text, p_updated boolean default true) returns void
language plpgsql set search_path = '' as $$
begin
  if p_updated then
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', p_table);
  end if;
  execute format('create trigger %1$s_school_lock before update on public.%1$s for each row execute function public.forbid_school_id_change()', p_table);
  execute format('alter table public.%1$s enable row level security', p_table);
  execute format('revoke all on public.%1$s from anon', p_table);
end $$;

-- =====================================================================================
-- FINANCE
-- =====================================================================================
create table public.fee_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  amount numeric(12, 2) not null check (amount > 0 and amount <= 1000000),
  term_id uuid,
  form_level smallint check (form_level between 1 and 6),
  programme_id uuid,
  residency text check (residency in ('day', 'boarding')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (term_id, school_id) references public.academic_terms (id, school_id) on delete cascade,
  foreign key (programme_id, school_id) references public.school_programmes (id, school_id) on delete cascade
);
select public._tenant_table('fee_items');

create table public.school_sequences_finance (
  school_id uuid not null references public.schools (id) on delete cascade,
  kind text not null check (kind in ('invoice', 'receipt')),
  next_value integer not null default 1,
  primary key (school_id, kind)
);
alter table public.school_sequences_finance enable row level security;
revoke all on public.school_sequences_finance from anon, authenticated;

create or replace function public._next_finance_number(p_school uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  insert into public.school_sequences_finance (school_id, kind) values (p_school, p_kind) on conflict do nothing;
  update public.school_sequences_finance set next_value = next_value + 1 where school_id = p_school and kind = p_kind returning next_value - 1 into v_n;
  return case p_kind when 'invoice' then 'INV-' else 'RCT-' end || to_char(now() at time zone 'Africa/Accra', 'YY') || '-' || lpad(v_n::text, 6, '0');
end $$;

create table public.student_invoices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  term_id uuid,
  invoice_number text not null,
  status text not null default 'issued' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'cancelled')),
  total numeric(12, 2) not null default 0 check (total >= 0),
  amount_paid numeric(12, 2) not null default 0,
  due_date date,
  notes text check (length(notes) <= 500),
  issued_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, invoice_number),
  unique (id, school_id),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (term_id, school_id) references public.academic_terms (id, school_id) on delete set null (term_id)
);
create unique index student_invoices_one_per_term on public.student_invoices (student_id, term_id) where term_id is not null and status <> 'cancelled';
create index student_invoices_school_idx on public.student_invoices (school_id, status);
select public._tenant_table('student_invoices');

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  invoice_id uuid not null,
  description text not null check (length(trim(description)) between 1 and 160),
  amount numeric(12, 2) not null check (amount <> 0),
  fee_item_id uuid references public.fee_items (id) on delete set null,
  foreign key (invoice_id, school_id) references public.student_invoices (id, school_id) on delete cascade
);
select public._tenant_table('invoice_lines', false);

create table public.student_payments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  invoice_id uuid,
  amount numeric(12, 2) not null check (amount > 0),
  method text not null check (method in ('cash', 'mobile_money', 'bank', 'cheque', 'card', 'online')),
  reference text check (length(reference) <= 120),
  receipt_number text not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'reversed')),
  reversal_reason text,
  provider text check (provider in ('paystack', 'hubtel')),
  provider_reference text unique,
  received_at timestamptz not null default now(),
  received_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (school_id, receipt_number),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (invoice_id, school_id) references public.student_invoices (id, school_id) on delete set null (invoice_id)
);
create index student_payments_school_idx on public.student_payments (school_id, received_at desc);
select public._tenant_table('student_payments', false);

/** Keeps invoice totals, amount paid and status consistent with lines and payments. */
create or replace function public._recalc_invoice(p_invoice uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_total numeric; v_paid numeric; v_status text;
begin
  select status into v_status from public.student_invoices where id = p_invoice;
  if v_status is null or v_status = 'cancelled' then return; end if;
  select coalesce(sum(amount), 0) into v_total from public.invoice_lines where invoice_id = p_invoice;
  select coalesce(sum(amount), 0) into v_paid from public.student_payments where invoice_id = p_invoice and status = 'confirmed';
  update public.student_invoices set total = greatest(v_total, 0), amount_paid = v_paid,
    status = case when v_status = 'draft' then 'draft' when v_paid <= 0 then 'issued' when v_paid < v_total then 'partially_paid' else 'paid' end
  where id = p_invoice;
end $$;

create or replace function public._invoice_lines_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public._recalc_invoice(coalesce(new.invoice_id, old.invoice_id));
  return null;
end $$;
create trigger invoice_lines_recalc after insert or update or delete on public.invoice_lines for each row execute function public._invoice_lines_changed();

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  invoice_id uuid not null,
  student_id uuid not null,
  payer_user_id uuid not null references public.profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  provider text not null default 'paystack' check (provider in ('paystack', 'hubtel')),
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed', 'abandoned')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (invoice_id, school_id) references public.student_invoices (id, school_id) on delete cascade,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);
alter table public.payment_intents enable row level security;
revoke all on public.payment_intents from anon, authenticated;
grant select on public.payment_intents to authenticated;
create policy payment_intents_select on public.payment_intents for select to authenticated
  using (payer_user_id = auth.uid() or public.school_role_has(school_id, 'finance.read'));

/** Platform-controlled online-payment settings (e.g. the school's Paystack subaccount). */
create table public.school_payment_settings (
  school_id uuid primary key references public.schools (id) on delete cascade,
  online_payments_enabled boolean not null default false,
  paystack_subaccount text check (paystack_subaccount ~ '^ACCT_[A-Za-z0-9]+$'),
  updated_at timestamptz not null default now()
);
alter table public.school_payment_settings enable row level security;
revoke all on public.school_payment_settings from anon, authenticated;
grant select on public.school_payment_settings to authenticated;
create policy school_payment_settings_select on public.school_payment_settings for select to authenticated
  using (public.is_school_member(school_id) or public.has_platform_permission('subscriptions.manage'));

create or replace function public.set_payment_settings(p_school uuid, p_enabled boolean, p_subaccount text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_platform_permission('subscriptions.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_enabled and coalesce(p_subaccount, '') = '' then raise exception 'A Paystack subaccount is required to enable online payments' using errcode = '22023'; end if;
  insert into public.school_payment_settings (school_id, online_payments_enabled, paystack_subaccount) values (p_school, p_enabled, nullif(trim(p_subaccount), ''))
  on conflict (school_id) do update set online_payments_enabled = excluded.online_payments_enabled, paystack_subaccount = excluded.paystack_subaccount, updated_at = now();
  perform public._audit(auth.uid(), p_school, 'finance.online_payments_' || case when p_enabled then 'enabled' else 'disabled' end, 'school', p_school::text, 'Online payment settings changed', '{}');
end $$;

create table public.expenditure_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  category text not null check (category in ('salaries', 'utilities', 'feeding', 'maintenance', 'teaching_materials', 'transport', 'administration', 'boarding', 'sports', 'other')),
  description text not null check (length(trim(description)) between 2 and 200),
  amount numeric(12, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  payee text check (length(payee) <= 120),
  reference text check (length(reference) <= 120),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenditure_records_school_idx on public.expenditure_records (school_id, spent_on desc);
select public._tenant_table('expenditure_records');

create table public.school_budgets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null,
  category text not null check (category in ('salaries', 'utilities', 'feeding', 'maintenance', 'teaching_materials', 'transport', 'administration', 'boarding', 'sports', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_year_id, category),
  foreign key (academic_year_id, school_id) references public.academic_years (id, school_id) on delete cascade
);
select public._tenant_table('school_budgets');

-- Finance RLS: readers see everything; managers write fee items, expenditure and budgets directly;
-- invoices, lines and payments change only through audited RPCs. Guardians see issued invoices
-- and payments for their linked children.
create policy fee_items_select on public.fee_items for select to authenticated using (public.school_role_has(school_id, 'finance.read'));
create policy fee_items_write on public.fee_items for all to authenticated using (public.has_school_permission(school_id, 'finance.manage')) with check (public.has_school_permission(school_id, 'finance.manage'));
create policy student_invoices_select on public.student_invoices for select to authenticated
  using (public.school_role_has(school_id, 'finance.read') or (status <> 'draft' and public.is_guardian_of(student_id)));
create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (public.school_role_has(school_id, 'finance.read')
         or exists (select 1 from public.student_invoices i where i.id = invoice_id and i.status <> 'draft' and public.is_guardian_of(i.student_id)));
create policy student_payments_select on public.student_payments for select to authenticated
  using (public.school_role_has(school_id, 'finance.read') or public.is_guardian_of(student_id));
revoke insert, update, delete on public.student_invoices, public.invoice_lines, public.student_payments from authenticated;
create policy expenditure_select on public.expenditure_records for select to authenticated using (public.school_role_has(school_id, 'finance.read'));
create policy expenditure_write on public.expenditure_records for all to authenticated using (public.has_school_permission(school_id, 'finance.manage')) with check (public.has_school_permission(school_id, 'finance.manage'));
create policy budgets_select on public.school_budgets for select to authenticated using (public.school_role_has(school_id, 'finance.read'));
create policy budgets_write on public.school_budgets for all to authenticated using (public.has_school_permission(school_id, 'finance.manage')) with check (public.has_school_permission(school_id, 'finance.manage'));
create trigger expenditure_records_creator before insert on public.expenditure_records for each row execute function public.stamp_creator();

/**
 * Issues one invoice per active student for a term from the fee items that apply to them
 * (term-specific or general items, filtered by form, programme and day/boarding). Students who
 * already have a term invoice are skipped. Returns the number of invoices created.
 */
create or replace function public.generate_term_invoices(p_term uuid, p_class uuid default null, p_due date default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_student record; v_invoice uuid; v_n integer := 0; v_lines integer;
begin
  select school_id into v_school from public.academic_terms where id = p_term;
  if v_school is null then raise exception 'term not found' using errcode = 'P0002'; end if;
  if not public.has_school_permission(v_school, 'finance.manage') then raise exception 'permission denied' using errcode = '42501'; end if;

  for v_student in
    select s.id, s.programme_id, s.residency, c.form_level from public.students s left join public.school_classes c on c.id = s.class_id
    where s.school_id = v_school and s.status = 'active' and (p_class is null or s.class_id = p_class)
      and not exists (select 1 from public.student_invoices i where i.student_id = s.id and i.term_id = p_term and i.status <> 'cancelled')
  loop
    select count(*) into v_lines from public.fee_items f
    where f.school_id = v_school and f.is_active and (f.term_id is null or f.term_id = p_term)
      and (f.form_level is null or f.form_level = v_student.form_level) and (f.programme_id is null or f.programme_id = v_student.programme_id)
      and (f.residency is null or f.residency = v_student.residency);
    continue when v_lines = 0;
    insert into public.student_invoices (school_id, student_id, term_id, invoice_number, due_date, created_by)
    values (v_school, v_student.id, p_term, public._next_finance_number(v_school, 'invoice'), p_due, auth.uid()) returning id into v_invoice;
    insert into public.invoice_lines (school_id, invoice_id, description, amount, fee_item_id)
    select v_school, v_invoice, f.name, f.amount, f.id from public.fee_items f
    where f.school_id = v_school and f.is_active and (f.term_id is null or f.term_id = p_term)
      and (f.form_level is null or f.form_level = v_student.form_level) and (f.programme_id is null or f.programme_id = v_student.programme_id)
      and (f.residency is null or f.residency = v_student.residency);
    v_n := v_n + 1;
  end loop;
  perform public._audit(auth.uid(), v_school, 'finance.invoices_generated', 'academic_term', p_term::text, v_n || ' invoices issued', jsonb_build_object('class', p_class));
  return v_n;
end $$;

/** Adds a line (charge, or negative for a discount/scholarship) to an invoice. */
create or replace function public.add_invoice_line(p_invoice uuid, p_description text, p_amount numeric) returns void
language plpgsql security definer set search_path = '' as $$
declare v_i public.student_invoices;
begin
  select * into v_i from public.student_invoices where id = p_invoice;
  if not found or not public.has_school_permission(v_i.school_id, 'finance.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_i.status = 'cancelled' then raise exception 'This invoice is cancelled' using errcode = 'P0001'; end if;
  if coalesce(trim(p_description), '') = '' or p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'invalid line' using errcode = '22023'; end if;
  insert into public.invoice_lines (school_id, invoice_id, description, amount) values (v_i.school_id, p_invoice, left(trim(p_description), 160), p_amount);
  perform public._audit(auth.uid(), v_i.school_id, 'finance.invoice_adjusted', 'student_invoice', p_invoice::text, trim(p_description) || ': ' || p_amount, '{}');
end $$;

create or replace function public.cancel_invoice(p_invoice uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_i public.student_invoices;
begin
  select * into v_i from public.student_invoices where id = p_invoice for update;
  if not found or not public.has_school_permission(v_i.school_id, 'finance.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required' using errcode = '22023'; end if;
  if exists (select 1 from public.student_payments where invoice_id = p_invoice and status = 'confirmed') then
    raise exception 'Reverse this invoice''s payments before cancelling it' using errcode = 'P0001';
  end if;
  update public.student_invoices set status = 'cancelled', notes = left(trim(p_reason), 500) where id = p_invoice;
  perform public._audit(auth.uid(), v_i.school_id, 'finance.invoice_cancelled', 'student_invoice', p_invoice::text, v_i.invoice_number, jsonb_build_object('reason', trim(p_reason)));
end $$;

/** Records an in-person payment (cash, mobile money, bank…) and issues a receipt number. */
create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_method text, p_reference text default null, p_received_at timestamptz default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_i public.student_invoices; v_id uuid;
begin
  select * into v_i from public.student_invoices where id = p_invoice for update;
  if not found or not public.has_school_permission(v_i.school_id, 'finance.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_i.status in ('cancelled', 'draft') then raise exception 'Payments can only be recorded on issued invoices' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'Enter a valid amount' using errcode = '22023'; end if;
  if p_method not in ('cash', 'mobile_money', 'bank', 'cheque', 'card') then raise exception 'invalid method' using errcode = '22023'; end if;
  insert into public.student_payments (school_id, student_id, invoice_id, amount, method, reference, receipt_number, received_at, received_by)
  values (v_i.school_id, v_i.student_id, p_invoice, round(p_amount, 2), p_method, nullif(trim(p_reference), ''), public._next_finance_number(v_i.school_id, 'receipt'),
          coalesce(p_received_at, now()), auth.uid())
  returning id into v_id;
  perform public._recalc_invoice(p_invoice);
  perform public._audit(auth.uid(), v_i.school_id, 'finance.payment_recorded', 'student_payment', v_id::text, 'GH₵' || round(p_amount, 2) || ' (' || p_method || ') on ' || v_i.invoice_number, '{}');
  return v_id;
end $$;

create or replace function public.reverse_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.student_payments;
begin
  select * into v_p from public.student_payments where id = p_payment for update;
  if not found or not public.has_school_permission(v_p.school_id, 'finance.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_p.status = 'reversed' then return; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required' using errcode = '22023'; end if;
  update public.student_payments set status = 'reversed', reversal_reason = left(trim(p_reason), 300) where id = p_payment;
  if v_p.invoice_id is not null then perform public._recalc_invoice(v_p.invoice_id); end if;
  perform public._audit(auth.uid(), v_p.school_id, 'finance.payment_reversed', 'student_payment', p_payment::text, v_p.receipt_number || ': ' || trim(p_reason), '{}');
end $$;

/** A guardian starts an online payment for their child's invoice (completed only by the verified webhook). */
create or replace function public.create_payment_intent(p_invoice uuid, p_amount numeric, p_reference text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_i public.student_invoices; v_id uuid; v_balance numeric;
begin
  select * into v_i from public.student_invoices where id = p_invoice;
  if not found or not public.is_guardian_of(v_i.student_id) then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_i.status not in ('issued', 'partially_paid') then raise exception 'This invoice is not open for payment' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.school_payment_settings where school_id = v_i.school_id and online_payments_enabled) then
    raise exception 'Your school does not accept online payments yet' using errcode = 'P0001';
  end if;
  v_balance := v_i.total - v_i.amount_paid;
  if p_amount is null or p_amount < 1 or p_amount > v_balance then raise exception 'Amount must be between GH₵1 and the balance of GH₵%', v_balance using errcode = '22023'; end if;
  insert into public.payment_intents (school_id, invoice_id, student_id, payer_user_id, amount, reference)
  values (v_i.school_id, p_invoice, v_i.student_id, auth.uid(), round(p_amount, 2), p_reference) returning id into v_id;
  return v_id;
end $$;

/**
 * Completes an online payment after the server has verified it with the provider.
 * Service role only (called from the webhook / verification handler). Idempotent on reference.
 */
create or replace function public.complete_online_payment(p_reference text, p_amount numeric, p_provider_reference text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_intent public.payment_intents; v_id uuid;
begin
  select * into v_intent from public.payment_intents where reference = p_reference for update;
  if not found then raise exception 'unknown payment reference' using errcode = 'P0002'; end if;
  select id into v_id from public.student_payments where provider_reference = p_provider_reference;
  if v_id is not null then return v_id; end if;
  if p_amount <> v_intent.amount then
    update public.payment_intents set status = 'failed', completed_at = now() where id = v_intent.id;
    raise exception 'amount mismatch' using errcode = '22023';
  end if;
  insert into public.student_payments (school_id, student_id, invoice_id, amount, method, reference, receipt_number, provider, provider_reference, received_by)
  values (v_intent.school_id, v_intent.student_id, v_intent.invoice_id, v_intent.amount, 'online', p_reference, public._next_finance_number(v_intent.school_id, 'receipt'), 'paystack', p_provider_reference, v_intent.payer_user_id)
  returning id into v_id;
  update public.payment_intents set status = 'succeeded', completed_at = now() where id = v_intent.id;
  perform public._recalc_invoice(v_intent.invoice_id);
  perform public._audit(v_intent.payer_user_id, v_intent.school_id, 'finance.online_payment', 'student_payment', v_id::text, 'Online payment GH₵' || v_intent.amount, jsonb_build_object('reference', p_reference));
  return v_id;
end $$;

-- =====================================================================================
-- BOARDING
-- =====================================================================================
create table public.dormitories (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  house_id uuid,
  name text not null check (length(trim(name)) between 2 and 80),
  gender text not null default 'mixed' check (gender in ('boys', 'girls', 'mixed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id),
  foreign key (house_id, school_id) references public.school_houses (id, school_id) on delete set null (house_id)
);
select public._tenant_table('dormitories');

create table public.dorm_rooms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  dormitory_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 40),
  beds smallint not null check (beds between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dormitory_id, name),
  unique (id, school_id),
  foreign key (dormitory_id, school_id) references public.dormitories (id, school_id) on delete cascade
);
select public._tenant_table('dorm_rooms');

create table public.boarding_allocations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  room_id uuid not null,
  bed_label text check (length(bed_label) <= 20),
  allocated_on date not null default current_date,
  released_on date,
  created_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (room_id, school_id) references public.dorm_rooms (id, school_id) on delete cascade,
  check (released_on is null or released_on >= allocated_on)
);
create unique index boarding_allocations_one_active on public.boarding_allocations (student_id) where released_on is null;
select public._tenant_table('boarding_allocations', false);

create or replace function public.check_room_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_beds int; v_used int; v_gender text; v_student_gender text; v_residency text;
begin
  if new.released_on is not null then return new; end if;
  select r.beds, d.gender into v_beds, v_gender from public.dorm_rooms r join public.dormitories d on d.id = r.dormitory_id where r.id = new.room_id;
  select count(*) into v_used from public.boarding_allocations where room_id = new.room_id and released_on is null and id <> new.id;
  if v_used >= v_beds then raise exception 'This room is full (% beds)', v_beds using errcode = '23514'; end if;
  select gender, residency into v_student_gender, v_residency from public.students where id = new.student_id;
  if v_residency <> 'boarding' then raise exception 'Only boarding students can be given a bed' using errcode = '23514'; end if;
  if (v_gender = 'boys' and v_student_gender <> 'male') or (v_gender = 'girls' and v_student_gender <> 'female') then
    raise exception 'This dormitory is for % only', v_gender using errcode = '23514';
  end if;
  return new;
end $$;
create trigger boarding_allocations_capacity before insert or update on public.boarding_allocations for each row execute function public.check_room_capacity();

do $$
declare t text;
begin
  foreach t in array array['dormitories', 'dorm_rooms', 'boarding_allocations'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.school_role_has(school_id, ''boarding.manage'') or public.school_role_has(school_id, ''students.read''))', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.has_school_permission(school_id, ''boarding.manage'')) with check (public.has_school_permission(school_id, ''boarding.manage''))', t);
  end loop;
end $$;
create policy boarding_allocations_family on public.boarding_allocations for select to authenticated using (public.is_student_self(student_id) or public.is_guardian_of(student_id));

-- =====================================================================================
-- LIBRARY LENDING
-- =====================================================================================
create table public.library_books (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  author text check (length(author) <= 160),
  isbn text check (isbn ~ '^[0-9Xx-]{10,17}$'),
  subject_id uuid,
  copies smallint not null default 1 check (copies between 0 and 2000),
  shelf text check (length(shelf) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete set null (subject_id)
);
select public._tenant_table('library_books');

create table public.library_loans (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  book_id uuid not null,
  student_id uuid,
  staff_id uuid,
  loaned_on date not null default current_date,
  due_on date not null,
  returned_on date,
  loaned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (book_id, school_id) references public.library_books (id, school_id) on delete cascade,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (staff_id, school_id) references public.staff (id, school_id) on delete cascade,
  check ((student_id is null) <> (staff_id is null)),
  check (due_on >= loaned_on),
  check (returned_on is null or returned_on >= loaned_on)
);
create index library_loans_open_idx on public.library_loans (school_id, due_on) where returned_on is null;
select public._tenant_table('library_loans', false);

create or replace function public.check_book_available() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_copies int; v_out int;
begin
  if new.returned_on is not null then return new; end if;
  if tg_op = 'UPDATE' and old.returned_on is null then return new; end if;
  select copies into v_copies from public.library_books where id = new.book_id;
  select count(*) into v_out from public.library_loans where book_id = new.book_id and returned_on is null and id <> new.id;
  if v_out >= v_copies then raise exception 'All % copies are on loan', v_copies using errcode = '23514'; end if;
  new.loaned_by := coalesce(auth.uid(), new.loaned_by);
  return new;
end $$;
create trigger library_loans_available before insert or update on public.library_loans for each row execute function public.check_book_available();

create policy library_books_select on public.library_books for select to authenticated using (public.is_school_member(school_id));
create policy library_books_write on public.library_books for all to authenticated using (public.has_school_permission(school_id, 'library.circulation')) with check (public.has_school_permission(school_id, 'library.circulation'));
create policy library_loans_select on public.library_loans for select to authenticated
  using (public.school_role_has(school_id, 'library.circulation') or public.is_student_self(student_id) or public.is_guardian_of(student_id)
         or (staff_id is not null and staff_id = public.my_staff_id(school_id)));
create policy library_loans_write on public.library_loans for all to authenticated using (public.has_school_permission(school_id, 'library.circulation')) with check (public.has_school_permission(school_id, 'library.circulation'));

-- =====================================================================================
-- INVENTORY, ASSETS, MAINTENANCE
-- =====================================================================================
create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null default 'general' check (category in ('general', 'stationery', 'food', 'cleaning', 'laboratory', 'sports', 'medical', 'uniform', 'other')),
  unit text not null default 'pieces' check (length(unit) <= 20),
  quantity numeric(12, 2) not null default 0 check (quantity >= 0),
  reorder_level numeric(12, 2) not null default 0 check (reorder_level >= 0),
  location text check (length(location) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id)
);
select public._tenant_table('inventory_items');

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  item_id uuid not null,
  kind text not null check (kind in ('in', 'out', 'adjust')),
  quantity numeric(12, 2) not null check (quantity > 0),
  note text check (length(note) <= 200),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (item_id, school_id) references public.inventory_items (id, school_id) on delete cascade
);
select public._tenant_table('inventory_transactions', false);

/** Stock moves update the item's quantity; issuing more than is in stock is refused. 'adjust' sets the count. */
create or replace function public.apply_stock_move() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_qty numeric;
begin
  select quantity into v_qty from public.inventory_items where id = new.item_id for update;
  if new.kind = 'out' and new.quantity > v_qty then raise exception 'Only % in stock', trim_scale(v_qty) using errcode = '23514'; end if;
  update public.inventory_items set quantity = case new.kind when 'in' then v_qty + new.quantity when 'out' then v_qty - new.quantity else new.quantity end where id = new.item_id;
  new.created_by := coalesce(auth.uid(), new.created_by);
  return new;
end $$;
create trigger inventory_transactions_apply before insert on public.inventory_transactions for each row execute function public.apply_stock_move();

create table public.school_assets (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  tag text not null check (length(trim(tag)) between 1 and 40),
  name text not null check (length(trim(name)) between 2 and 120),
  category text not null default 'equipment' check (category in ('equipment', 'furniture', 'ict', 'laboratory', 'vehicle', 'building', 'sports', 'other')),
  location text check (length(location) <= 80),
  condition text not null default 'good' check (condition in ('new', 'good', 'fair', 'poor', 'broken', 'disposed')),
  acquired_on date,
  value numeric(12, 2) check (value >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, tag),
  unique (id, school_id)
);
select public._tenant_table('school_assets');

create table public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  asset_id uuid,
  location text not null check (length(trim(location)) between 2 and 120),
  description text not null check (length(trim(description)) between 3 and 1000),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'cancelled')),
  assigned_to text check (length(assigned_to) <= 120),
  reported_by uuid default auth.uid() references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (asset_id, school_id) references public.school_assets (id, school_id) on delete set null (asset_id)
);
select public._tenant_table('maintenance_requests');

do $$
declare t text;
begin
  foreach t in array array['inventory_items', 'inventory_transactions', 'school_assets'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.school_role_has(school_id, ''inventory.manage''))', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated using (public.has_school_permission(school_id, ''inventory.manage'')) with check (public.has_school_permission(school_id, ''inventory.manage''))', t);
  end loop;
end $$;
revoke update, delete on public.inventory_transactions from authenticated; -- stock history is append-only
-- Quantity changes only via transactions: every other column stays editable.
revoke update on public.inventory_items from authenticated;
grant update (name, category, unit, reorder_level, location) on public.inventory_items to authenticated;

create policy maintenance_select on public.maintenance_requests for select to authenticated
  using (public.school_role_has(school_id, 'inventory.manage') or reported_by = auth.uid());
create policy maintenance_report on public.maintenance_requests for insert to authenticated
  with check (reported_by = auth.uid() and status = 'open' and public.is_staff_member(school_id)
              and exists (select 1 from public.schools s where s.id = school_id and s.status = 'active'));
create policy maintenance_manage on public.maintenance_requests for update to authenticated
  using (public.has_school_permission(school_id, 'inventory.manage')) with check (public.has_school_permission(school_id, 'inventory.manage'));

-- =====================================================================================
-- HEALTH (restricted)
-- =====================================================================================
create table public.health_records (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null unique,
  blood_group text check (blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  allergies text check (length(allergies) <= 1000),
  conditions text check (length(conditions) <= 1000),
  medications text check (length(medications) <= 1000),
  notes text check (length(notes) <= 2000),
  sickle_cell_status text check (sickle_cell_status in ('AA', 'AS', 'SS', 'SC', 'unknown')),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);
select public._tenant_table('health_records');

create table public.clinic_visits (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  visited_at timestamptz not null default now(),
  complaint text not null check (length(trim(complaint)) between 2 and 500),
  treatment text check (length(treatment) <= 1000),
  outcome text not null default 'returned_to_class' check (outcome in ('returned_to_class', 'rest_in_sickbay', 'sent_home', 'referred_to_hospital')),
  share_with_guardian boolean not null default false,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);
create index clinic_visits_student_idx on public.clinic_visits (student_id, visited_at desc);
select public._tenant_table('clinic_visits', false);

create or replace function public.stamp_health_author() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'health_records' then new.updated_by := auth.uid(); else new.recorded_by := coalesce(new.recorded_by, auth.uid()); end if;
  return new;
end $$;
create trigger health_records_author before insert or update on public.health_records for each row execute function public.stamp_health_author();
create trigger clinic_visits_author before insert on public.clinic_visits for each row execute function public.stamp_health_author();

create policy health_records_nurse on public.health_records for all to authenticated
  using (public.has_school_permission(school_id, 'health.manage')) with check (public.has_school_permission(school_id, 'health.manage'));
create policy clinic_visits_nurse on public.clinic_visits for all to authenticated
  using (public.has_school_permission(school_id, 'health.manage')) with check (public.has_school_permission(school_id, 'health.manage'));
-- Families see only visits the nurse chose to share.
create policy clinic_visits_family on public.clinic_visits for select to authenticated using (share_with_guardian and public.is_guardian_of(student_id));
revoke delete on public.clinic_visits from authenticated;

-- =====================================================================================
-- PARENT–SCHOOL MESSAGES (one thread per student)
-- =====================================================================================
create or replace function public.can_message_family(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s where s.id = p_student and (
      public.has_school_permission(s.school_id, 'parents.message')
      or (public.has_school_permission(s.school_id, 'classroom.teach') and public.teaches(s.school_id, s.class_id))
    )
  )
$$;

create table public.family_messages (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  from_family boolean not null,
  body text not null check (length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);
create index family_messages_student_idx on public.family_messages (student_id, created_at);
create index family_messages_school_idx on public.family_messages (school_id, created_at desc);
alter table public.family_messages enable row level security;
revoke all on public.family_messages from anon;
revoke update, delete on public.family_messages from authenticated;
create policy family_messages_select on public.family_messages for select to authenticated
  using (public.is_guardian_of(student_id) or public.can_message_family(student_id));
create policy family_messages_insert on public.family_messages for insert to authenticated
  with check (author_id = auth.uid() and (
    (from_family and public.is_guardian_of(student_id)) or (not from_family and public.can_message_family(student_id))));

-- =====================================================================================
-- NOTIFICATIONS: preferences and delivery outbox
-- =====================================================================================
create table public.notification_preferences (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  email_enabled boolean not null default true,
  sms_enabled boolean not null default false,
  sms_phone text check (sms_phone ~ '^\+233[0-9]{9}$'),
  categories jsonb not null default '{"announcements": true, "results": true, "payments": true, "attendance": true, "coursework": true, "messages": true}',
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();
alter table public.notification_preferences enable row level security;
revoke all on public.notification_preferences from anon;
create policy notification_preferences_own on public.notification_preferences for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  category text not null,
  destination text not null,
  subject text,
  body text not null check (length(body) <= 2000),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts smallint not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index notification_outbox_pending_idx on public.notification_outbox (created_at) where status = 'pending';
alter table public.notification_outbox enable row level security;
revoke all on public.notification_outbox from anon, authenticated; -- server (service role) only

-- -------------------------------------------------------------------------------------
-- Guardian overview of one child (portal). Families see published/returned work only.
-- -------------------------------------------------------------------------------------
create or replace function public.guardian_children() returns table (student_id uuid, school_id uuid, school_name text, first_name text, last_name text, class_name text, relationship text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.school_id, sc.name, s.first_name, s.last_name, c.name, sg.relationship
  from public.guardians g
  join public.student_guardians sg on sg.guardian_id = g.id and sg.can_view_records
  join public.students s on s.id = sg.student_id
  join public.schools sc on sc.id = s.school_id
  left join public.school_classes c on c.id = s.class_id
  where g.user_id = auth.uid() and public.is_school_member(g.school_id)
  order by s.first_name
$$;

create or replace function public.guardian_child_summary(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_s public.students;
begin
  select * into v_s from public.students where id = p_student;
  if not found or not public.is_guardian_of(p_student) then raise exception 'permission denied' using errcode = '42501'; end if;
  return jsonb_build_object(
    'attendance', (select jsonb_build_object('days', count(*), 'present', count(*) filter (where status in ('present', 'late')), 'absent', count(*) filter (where status = 'absent'),
                     'recent_absences', coalesce((select jsonb_agg(attendance_date order by attendance_date desc) from (select attendance_date from public.attendance where student_id = p_student and status = 'absent' order by attendance_date desc limit 5) x), '[]'))
                   from public.attendance where student_id = p_student and attendance_date > current_date - 60),
    'assignments', coalesce((select jsonb_agg(jsonb_build_object('title', a.title, 'subject', sub.name, 'due_at', a.due_at, 'max_score', a.max_score,
                       'status', coalesce(sm.status, case when a.due_at < now() then 'missed' else 'pending' end), 'score', case when sm.status = 'returned' then sm.score end) order by a.due_at desc)
                     from (select * from public.assignments where class_id = v_s.class_id and is_published and due_at > now() - interval '60 days' order by due_at desc limit 15) a
                     join public.school_subjects sub on sub.id = a.subject_id
                     left join public.assignment_submissions sm on sm.assignment_id = a.id and sm.student_id = p_student), '[]'),
    'exams', coalesce((select jsonb_agg(jsonb_build_object('title', e.title, 'subject', sub.name, 'opens_at', e.opens_at, 'released', e.results_released,
                       'score', case when e.results_released then xa.total_score end, 'max', case when e.results_released then xa.max_score end, 'attempted', xa.id is not null, 'attempt_id', case when e.results_released then xa.id end) order by e.opens_at desc)
                     from (select * from public.exams where class_id = v_s.class_id and is_published and opens_at > now() - interval '120 days' order by opens_at desc limit 10) e
                     join public.school_subjects sub on sub.id = e.subject_id
                     left join public.exam_attempts xa on xa.exam_id = e.id and xa.student_id = p_student), '[]'),
    'boarding', (select jsonb_build_object('dormitory', d.name, 'room', r.name, 'bed', b.bed_label) from public.boarding_allocations b
                 join public.dorm_rooms r on r.id = b.room_id join public.dormitories d on d.id = r.dormitory_id where b.student_id = p_student and b.released_on is null),
    'library_loans', coalesce((select jsonb_agg(jsonb_build_object('title', bk.title, 'due_on', l.due_on, 'overdue', l.due_on < current_date)) from public.library_loans l
                       join public.library_books bk on bk.id = l.book_id where l.student_id = p_student and l.returned_on is null), '[]')
  );
end $$;

-- -------------------------------------------------------------------------------------
-- Function privileges
-- -------------------------------------------------------------------------------------
revoke execute on function public._tenant_table(text, boolean), public._next_finance_number(uuid, text), public._recalc_invoice(uuid),
  public.complete_online_payment(text, numeric, text) from public, anon, authenticated;
revoke execute on function public.set_payment_settings(uuid, boolean, text), public.generate_term_invoices(uuid, uuid, date), public.add_invoice_line(uuid, text, numeric),
  public.cancel_invoice(uuid, text), public.record_payment(uuid, numeric, text, text, timestamptz), public.reverse_payment(uuid, text),
  public.create_payment_intent(uuid, numeric, text), public.guardian_children(), public.guardian_child_summary(uuid) from public, anon;
grant execute on function public.complete_online_payment(text, numeric, text) to service_role;
