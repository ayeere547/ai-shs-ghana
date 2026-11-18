-- =====================================================================================
-- AI SHS Ghana — Phase 1 foundation
-- Identity, RBAC (platform + school scopes), multi-tenant school registry, school
-- structure (years, terms, departments, programmes, classes, subjects, houses),
-- subscriptions catalogue, notifications and an append-only audit log.
--
-- Tenant isolation rule: every school-owned row has school_id, and Row Level Security
-- decides access from the caller's verified membership — never from client input.
-- =====================================================================================

create schema if not exists extensions;

-- -------------------------------------------------------------------------------------
-- Generic helpers
-- -------------------------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.forbid_school_id_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'school_id cannot be changed' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function public.try_uuid(v text) returns uuid
language sql immutable set search_path = '' as $$
  select case when v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then v::uuid end
$$;

-- -------------------------------------------------------------------------------------
-- Reference data
-- -------------------------------------------------------------------------------------
create table public.regions (
  code text primary key,
  name text not null unique,
  sort smallint not null
);

insert into public.regions (code, name, sort) values
  ('AH', 'Ahafo', 1), ('AS', 'Ashanti', 2), ('BE', 'Bono East', 3), ('BO', 'Bono', 4),
  ('CP', 'Central', 5), ('EP', 'Eastern', 6), ('AA', 'Greater Accra', 7), ('NE', 'North East', 8),
  ('NP', 'Northern', 9), ('OT', 'Oti', 10), ('SV', 'Savannah', 11), ('UE', 'Upper East', 12),
  ('UW', 'Upper West', 13), ('TV', 'Volta', 14), ('WP', 'Western', 15), ('WN', 'Western North', 16);

-- -------------------------------------------------------------------------------------
-- Profiles
-- -------------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  phone text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_lower_idx on public.profiles (lower(email));
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, lower(new.email), nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- -------------------------------------------------------------------------------------
-- RBAC catalogue (platform + school scopes)
-- -------------------------------------------------------------------------------------
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  scope text not null check (scope in ('platform', 'school')),
  label text not null,
  description text,
  rank smallint not null default 0, -- a member may only assign roles ranked at or below their own
  unique (id, scope)
);

create table public.permissions (
  key text primary key,
  scope text not null check (scope in ('platform', 'school')),
  description text not null
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

insert into public.roles (key, scope, label, rank, description) values
  ('super_admin',          'platform', 'Super Administrator',             100, 'Full platform control, including platform staff and settings'),
  ('platform_admin',       'platform', 'National Platform Administrator',  90, 'Verifies and manages schools, platform staff and support'),
  ('support_officer',      'platform', 'Platform Support Officer',         50, 'Handles school support requests'),
  ('finance_admin',        'platform', 'Platform Finance Administrator',   60, 'Manages plans and subscriptions'),
  ('data_analyst',         'platform', 'Platform Data Analyst',            40, 'Aggregated national analytics only'),
  ('headteacher',          'school',   'Headmaster / Headmistress',       100, 'Head of school'),
  ('assistant_headteacher','school',   'Assistant Headmaster',             90, 'Deputy head of school'),
  ('school_admin',         'school',   'School Administrator',             85, 'Runs the school''s platform configuration'),
  ('academic_admin',       'school',   'Academic Administrator',           70, 'Academic structure and records'),
  ('hr_officer',           'school',   'Human Resource Officer',           60, 'Staff records and access'),
  ('accountant',           'school',   'Accountant',                       60, 'School finances'),
  ('exam_officer',         'school',   'Examination Officer',              60, 'Examinations and results'),
  ('head_of_department',   'school',   'Head of Department',               50, 'Leads an academic department'),
  ('counsellor',           'school',   'Guidance & Counselling Officer',   40, 'Student guidance'),
  ('housemaster',          'school',   'Housemaster / Housemistress',      40, 'Boarding house'),
  ('librarian',            'school',   'School Librarian',                 40, 'Library'),
  ('storekeeper',          'school',   'Storekeeper',                      40, 'Stores and inventory'),
  ('nurse',                'school',   'School Nurse',                     40, 'Authorised health personnel'),
  ('teacher',              'school',   'Teacher',                          30, 'Teaching staff'),
  ('student',              'school',   'Student',                          10, 'Enrolled student'),
  ('parent',               'school',   'Parent / Guardian',                10, 'Verified parent or guardian');

insert into public.permissions (key, scope, description) values
  ('platform.dashboard',        'platform', 'Open the national platform dashboard'),
  ('schools.read_all',          'platform', 'View the registry of all schools (not their internal records)'),
  ('schools.verify',            'platform', 'Approve or reject school registrations'),
  ('schools.suspend',           'platform', 'Suspend or reactivate schools'),
  ('platform.users.manage',     'platform', 'Grant and revoke platform roles'),
  ('platform.audit.read',       'platform', 'Read the platform audit log'),
  ('platform.settings.manage',  'platform', 'Change platform configuration'),
  ('plans.manage',              'platform', 'Manage subscription plans'),
  ('subscriptions.manage',      'platform', 'Manage school subscriptions'),
  ('analytics.national',        'platform', 'View aggregated national analytics'),
  ('support.manage',            'platform', 'Handle support requests'),
  ('school.dashboard',          'school',   'Open the school dashboard'),
  ('school.settings.manage',    'school',   'Edit school profile and settings'),
  ('school.branding.manage',    'school',   'Edit school branding'),
  ('members.read',              'school',   'View school staff and member list'),
  ('members.manage',            'school',   'Invite members and change their roles'),
  ('academics.read',            'school',   'View academic structure'),
  ('academics.manage',          'school',   'Manage academic years, terms, programmes, classes, subjects, departments, houses'),
  ('school.audit.read',         'school',   'Read the school''s audit log');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.scope = r.scope
where (r.key, p.key) in (
  -- platform
  ('platform_admin','platform.dashboard'), ('platform_admin','schools.read_all'), ('platform_admin','schools.verify'),
  ('platform_admin','schools.suspend'), ('platform_admin','platform.users.manage'), ('platform_admin','platform.audit.read'),
  ('platform_admin','analytics.national'), ('platform_admin','support.manage'),
  ('support_officer','platform.dashboard'), ('support_officer','schools.read_all'), ('support_officer','support.manage'),
  ('finance_admin','platform.dashboard'), ('finance_admin','schools.read_all'), ('finance_admin','plans.manage'), ('finance_admin','subscriptions.manage'),
  ('data_analyst','platform.dashboard'), ('data_analyst','analytics.national'),
  -- school
  ('assistant_headteacher','school.dashboard'), ('assistant_headteacher','school.branding.manage'), ('assistant_headteacher','members.read'),
  ('assistant_headteacher','members.manage'), ('assistant_headteacher','academics.read'), ('assistant_headteacher','academics.manage'),
  ('assistant_headteacher','school.audit.read'),
  ('academic_admin','school.dashboard'), ('academic_admin','members.read'), ('academic_admin','academics.read'), ('academic_admin','academics.manage'),
  ('hr_officer','school.dashboard'), ('hr_officer','members.read'), ('hr_officer','members.manage'),
  ('accountant','school.dashboard'),
  ('exam_officer','school.dashboard'), ('exam_officer','academics.read'),
  ('head_of_department','school.dashboard'), ('head_of_department','members.read'), ('head_of_department','academics.read'),
  ('counsellor','school.dashboard'), ('counsellor','academics.read'),
  ('housemaster','school.dashboard'), ('housemaster','academics.read'),
  ('librarian','school.dashboard'), ('librarian','academics.read'),
  ('storekeeper','school.dashboard'),
  ('nurse','school.dashboard'),
  ('teacher','school.dashboard'), ('teacher','academics.read')
)
-- super_admin, headteacher and school_admin receive every permission of their scope
or r.key in ('super_admin', 'headteacher', 'school_admin');

-- -------------------------------------------------------------------------------------
-- Platform staff
-- -------------------------------------------------------------------------------------
create table public.platform_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role_id uuid not null,
  role_scope text not null default 'platform' check (role_scope = 'platform'),
  granted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (role_id, role_scope) references public.roles (id, scope)
);

-- -------------------------------------------------------------------------------------
-- Schools (tenants)
-- -------------------------------------------------------------------------------------
create table public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (length(trim(name)) between 3 and 160),
  school_code text unique,
  category text not null default 'unclassified' check (category in ('A', 'B', 'C', 'D', 'E', 'unclassified')),
  ownership text not null check (ownership in ('public', 'private')),
  boarding_type text not null check (boarding_type in ('day', 'boarding', 'day_and_boarding')),
  region_code text not null references public.regions (code),
  district text not null,
  address text not null,
  email text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null,
  website text check (website is null or website ~* '^https?://[^\s]+$'),
  programmes_offered text[] not null default '{}',
  headmaster_name text not null,
  headmaster_email text,
  headmaster_phone text,
  description text,
  logo_path text,
  public_listing boolean not null default false,
  status text not null default 'pending_verification' check (status in ('pending_verification', 'active', 'suspended', 'rejected')),
  status_reason text,
  registered_by uuid references public.profiles (id) on delete set null,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  onboarding_completed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index schools_status_idx on public.schools (status);
create index schools_region_idx on public.schools (region_code);
create index schools_registered_by_idx on public.schools (registered_by);
create trigger schools_updated_at before update on public.schools for each row execute function public.set_updated_at();

create table public.school_memberships (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null,
  role_scope text not null default 'school' check (role_scope = 'school'),
  status text not null default 'active' check (status in ('active', 'removed')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id),
  foreign key (role_id, role_scope) references public.roles (id, scope)
);
create index school_memberships_user_idx on public.school_memberships (user_id) where status = 'active';
create trigger school_memberships_updated_at before update on public.school_memberships for each row execute function public.set_updated_at();
create trigger school_memberships_school_lock before update on public.school_memberships for each row execute function public.forbid_school_id_change();

-- -------------------------------------------------------------------------------------
-- Authorisation helpers (SECURITY DEFINER so policies can consult protected tables)
-- -------------------------------------------------------------------------------------
create or replace function public.has_platform_permission(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.platform_users pu
    join public.profiles pr on pr.id = pu.user_id and pr.status = 'active'
    join public.role_permissions rp on rp.role_id = pu.role_id
    where pu.user_id = auth.uid() and rp.permission_key = p_permission
  )
$$;

create or replace function public.is_platform_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.platform_users pu join public.profiles pr on pr.id = pu.user_id and pr.status = 'active'
    where pu.user_id = auth.uid()
  )
$$;

create or replace function public.is_school_member(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.school_memberships m
    join public.profiles pr on pr.id = m.user_id and pr.status = 'active'
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

-- Role grants the permission (regardless of school status) — used for READ checks.
create or replace function public.school_role_has(p_school uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.school_memberships m
    join public.profiles pr on pr.id = m.user_id and pr.status = 'active'
    join public.role_permissions rp on rp.role_id = m.role_id
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active' and rp.permission_key = p_permission
  )
$$;

-- Role grants the permission AND the school is active — used for every WRITE check.
create or replace function public.has_school_permission(p_school uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.school_role_has(p_school, p_permission)
     and exists (select 1 from public.schools s where s.id = p_school and s.status = 'active')
$$;

create or replace function public.school_role_rank(p_school uuid) returns smallint
language sql stable security definer set search_path = '' as $$
  select coalesce(max(r.rank), 0)::smallint
  from public.school_memberships m join public.roles r on r.id = m.role_id
  where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active'
$$;

-- -------------------------------------------------------------------------------------
-- Audit log (append-only) and notifications
-- -------------------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor_id uuid references public.profiles (id) on delete set null,
  school_id uuid references public.schools (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text,
  metadata jsonb not null default '{}'
);
create index audit_logs_school_idx on public.audit_logs (school_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  school_id uuid references public.schools (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Internal writers — NOT callable through the API.
create or replace function public._audit(p_actor uuid, p_school uuid, p_action text, p_entity_type text, p_entity_id text, p_summary text, p_metadata jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, school_id, action, entity_type, entity_id, summary, metadata)
  values (p_actor, p_school, p_action, p_entity_type, p_entity_id, p_summary, coalesce(p_metadata, '{}'))
$$;

create or replace function public._notify(p_user uuid, p_school uuid, p_title text, p_body text, p_link text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (user_id, school_id, title, body, link) values (p_user, p_school, p_title, p_body, p_link)
$$;

-- Callable by signed-in users for app-level events (sign-in, settings changes).
create or replace function public.log_audit(p_action text, p_entity_type text, p_entity_id text default null, p_summary text default null, p_school_id uuid default null, p_metadata jsonb default '{}')
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_school_id is not null and not (public.is_school_member(p_school_id) or public.is_platform_user()) then
    raise exception 'not a member of this school' using errcode = '42501';
  end if;
  perform public._audit(auth.uid(), p_school_id, left(p_action, 80), left(p_entity_type, 60), left(p_entity_id, 120), left(p_summary, 500), p_metadata);
end $$;

-- -------------------------------------------------------------------------------------
-- School configuration (1:1)
-- -------------------------------------------------------------------------------------
create table public.school_settings (
  school_id uuid primary key references public.schools (id) on delete cascade,
  timezone text not null default 'Africa/Accra',
  school_days smallint[] not null default '{1,2,3,4,5}',
  form_levels smallint not null default 3 check (form_levels between 1 and 6),
  period_minutes smallint not null default 60 check (period_minutes between 20 and 180),
  parent_portal_enabled boolean not null default true,
  student_portal_enabled boolean not null default true,
  confirmed_at timestamptz, -- set when an administrator reviews settings (onboarding step 9)
  updated_at timestamptz not null default now()
);
create trigger school_settings_updated_at before update on public.school_settings for each row execute function public.set_updated_at();
create trigger school_settings_school_lock before update on public.school_settings for each row execute function public.forbid_school_id_change();

create table public.school_branding (
  school_id uuid primary key references public.schools (id) on delete cascade,
  primary_color text not null default '#0b2545' check (primary_color ~ '^#[0-9a-fA-F]{6}$'),
  secondary_color text not null default '#1d4ed8' check (secondary_color ~ '^#[0-9a-fA-F]{6}$'),
  motto text check (length(motto) <= 160),
  logo_path text,
  updated_at timestamptz not null default now()
);
create trigger school_branding_updated_at before update on public.school_branding for each row execute function public.set_updated_at();
create trigger school_branding_school_lock before update on public.school_branding for each row execute function public.forbid_school_id_change();

-- -------------------------------------------------------------------------------------
-- School academic structure (tenant tables)
-- -------------------------------------------------------------------------------------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 40),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (school_id, name),
  unique (id, school_id)
);
create unique index academic_years_one_current on public.academic_years (school_id) where is_current;

create table public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  academic_year_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 40),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (academic_year_id, name),
  foreign key (academic_year_id, school_id) references public.academic_years (id, school_id) on delete cascade
);
create unique index academic_terms_one_current on public.academic_terms (school_id) where is_current;

create table public.school_departments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  code text check (length(code) <= 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id)
);

create table public.school_programmes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  code text check (length(code) <= 16),
  description text check (length(description) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id)
);

create table public.school_classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  programme_id uuid,
  name text not null check (length(trim(name)) between 1 and 40),
  form_level smallint not null check (form_level between 1 and 6),
  capacity smallint check (capacity between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  foreign key (programme_id, school_id) references public.school_programmes (id, school_id) on delete set null (programme_id)
);

create table public.school_subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  department_id uuid,
  name text not null check (length(trim(name)) between 2 and 80),
  code text check (length(code) <= 16),
  is_core boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  foreign key (department_id, school_id) references public.school_departments (id, school_id) on delete set null (department_id)
);

create table public.school_houses (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  gender text not null default 'mixed' check (gender in ('boys', 'girls', 'mixed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name)
);

-- Shared triggers, indexes and RLS for the structure tables.
do $$
declare t text;
begin
  foreach t in array array['academic_years','academic_terms','school_departments','school_programmes','school_classes','school_subjects','school_houses'] loop
    execute format('create index %1$s_school_idx on public.%1$s (school_id)', t);
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
    execute format('create trigger %1$s_school_lock before update on public.%1$s for each row execute function public.forbid_school_id_change()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_school_member(school_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.has_school_permission(school_id, ''academics.manage''))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.has_school_permission(school_id, ''academics.manage'')) with check (public.has_school_permission(school_id, ''academics.manage''))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.has_school_permission(school_id, ''academics.manage''))', t);
    execute format('revoke all on public.%1$s from anon', t);
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- Platform settings, plans, subscriptions
-- -------------------------------------------------------------------------------------
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('registration_open', 'true'),
  ('max_pending_registrations_per_user', '3');

create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_monthly_ghs numeric(10, 2),
  price_annual_ghs numeric(10, 2),
  limits jsonb not null default '{}',
  features text[] not null default '{}',
  is_public boolean not null default true,
  is_active boolean not null default true,
  sort smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscription_plans_updated_at before update on public.subscription_plans for each row execute function public.set_updated_at();

-- Prices are left NULL ("set by the platform") until the business sets them in the admin dashboard.
insert into public.subscription_plans (code, name, description, limits, features, sort) values
  ('free', 'Free', 'Get a verified school profile and basic administration.', '{"max_students": 100, "max_staff": 10, "ai_requests_per_month": 0}',
   array['Verified school profile', 'Directory listing', 'Basic administration', 'Up to 100 student records'], 1),
  ('starter', 'Starter', 'Core school management for a single school.', '{"max_students": 1500, "max_staff": 120, "ai_requests_per_month": 0}',
   array['Student management', 'Teacher management', 'Attendance', 'Academic records', 'Basic reports'], 2),
  ('professional', 'Professional', 'AI-powered teaching and learning.', '{"max_students": 4000, "max_staff": 300, "ai_requests_per_month": 50000}',
   array['Everything in Starter', 'AI learning assistant', 'AI teacher tools', 'Digital classroom', 'Parent portal', 'Examination management'], 3),
  ('enterprise', 'Enterprise', 'For large schools and school networks.', '{"max_students": null, "max_staff": null, "ai_requests_per_month": null}',
   array['Everything in Professional', 'Advanced analytics', 'Advanced AI features', 'Custom integrations', 'Advanced reporting', 'Priority support'], 4);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null unique references public.schools (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status text not null default 'active' check (status in ('trialing', 'active', 'grace', 'past_due', 'cancelled')),
  funding_model text not null default 'self_funded' check (funding_model in ('self_funded', 'sponsored', 'subsidised', 'institution_funded')),
  billing_cycle text not null default 'none' check (billing_cycle in ('none', 'monthly', 'annual')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();
create trigger subscriptions_school_lock before update on public.subscriptions for each row execute function public.forbid_school_id_change();

-- -------------------------------------------------------------------------------------
-- RLS policies
-- -------------------------------------------------------------------------------------
alter table public.regions enable row level security;
create policy regions_read on public.regions for select to anon, authenticated using (true);

alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
create policy roles_read on public.roles for select to authenticated using (true);
create policy permissions_read on public.permissions for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

-- Profiles: yourself; co-members of schools where you may read members; platform staff and school registrants for platform reviewers.
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
$$;

alter table public.profiles enable row level security;
create policy profiles_select on public.profiles for select to authenticated using (public.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

alter table public.platform_users enable row level security;
create policy platform_users_select on public.platform_users for select to authenticated
  using (user_id = auth.uid() or public.has_platform_permission('platform.users.manage'));

alter table public.schools enable row level security;
create policy schools_select on public.schools for select to authenticated
  using (public.is_school_member(id) or registered_by = auth.uid() or public.has_platform_permission('schools.read_all'));
create policy schools_update on public.schools for update to authenticated
  using (public.has_school_permission(id, 'school.settings.manage'))
  with check (public.has_school_permission(id, 'school.settings.manage'));

alter table public.school_memberships enable row level security;
create policy school_memberships_select on public.school_memberships for select to authenticated
  using (user_id = auth.uid() or public.school_role_has(school_id, 'members.read') or public.has_platform_permission('schools.read_all'));

alter table public.school_settings enable row level security;
create policy school_settings_select on public.school_settings for select to authenticated using (public.is_school_member(school_id));
create policy school_settings_update on public.school_settings for update to authenticated
  using (public.has_school_permission(school_id, 'school.settings.manage'))
  with check (public.has_school_permission(school_id, 'school.settings.manage'));

alter table public.school_branding enable row level security;
create policy school_branding_select on public.school_branding for select to authenticated
  using (public.is_school_member(school_id) or public.has_platform_permission('schools.read_all'));
create policy school_branding_update on public.school_branding for update to authenticated
  using (public.has_school_permission(school_id, 'school.branding.manage'))
  with check (public.has_school_permission(school_id, 'school.branding.manage'));

alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.has_platform_permission('platform.audit.read') or (school_id is not null and public.school_role_has(school_id, 'school.audit.read')));

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.platform_settings enable row level security;
create policy platform_settings_select on public.platform_settings for select to authenticated using (public.is_platform_user());
create policy platform_settings_update on public.platform_settings for update to authenticated
  using (public.has_platform_permission('platform.settings.manage')) with check (public.has_platform_permission('platform.settings.manage'));

alter table public.subscription_plans enable row level security;
create policy plans_select on public.subscription_plans for select to anon, authenticated
  using ((is_active and is_public) or public.has_platform_permission('plans.manage'));
create policy plans_update on public.subscription_plans for update to authenticated
  using (public.has_platform_permission('plans.manage')) with check (public.has_platform_permission('plans.manage'));

alter table public.subscriptions enable row level security;
create policy subscriptions_select on public.subscriptions for select to authenticated
  using (public.school_role_has(school_id, 'school.settings.manage') or public.has_platform_permission('subscriptions.manage'));

-- -------------------------------------------------------------------------------------
-- Table privileges: state changes on sensitive tables go through audited RPCs only.
-- -------------------------------------------------------------------------------------
revoke all on public.profiles, public.platform_users, public.schools, public.school_memberships, public.roles, public.permissions,
  public.role_permissions, public.audit_logs, public.notifications, public.platform_settings, public.subscription_plans,
  public.subscriptions, public.school_settings, public.school_branding from anon, authenticated;

grant select on public.regions, public.subscription_plans to anon;
grant select on public.profiles, public.platform_users, public.schools, public.school_memberships, public.roles, public.permissions,
  public.role_permissions, public.audit_logs, public.notifications, public.platform_settings, public.subscription_plans,
  public.subscriptions, public.school_settings, public.school_branding to authenticated;

grant update (full_name, phone, last_seen_at) on public.profiles to authenticated;
grant update (read_at) on public.notifications to authenticated;
-- Schools may maintain contact/profile fields; official name, code, status and verification fields are platform-controlled.
grant update (address, district, email, phone, website, description, public_listing, logo_path, headmaster_name, headmaster_email, headmaster_phone)
  on public.schools to authenticated;
grant update (timezone, school_days, form_levels, period_minutes, parent_portal_enabled, student_portal_enabled, confirmed_at) on public.school_settings to authenticated;
grant update (primary_color, secondary_color, motto, logo_path) on public.school_branding to authenticated;
grant update (value, updated_by) on public.platform_settings to authenticated;
grant update (name, description, price_monthly_ghs, price_annual_ghs, limits, features, is_public, is_active, sort) on public.subscription_plans to authenticated;

-- -------------------------------------------------------------------------------------
-- RPCs
-- -------------------------------------------------------------------------------------
create or replace function public.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'))
$$;

/** Step 1 of onboarding: register a school for verification. The caller becomes its first administrator. */
create or replace function public.register_school(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_school uuid;
  v_slug text;
  v_role text := coalesce(nullif(p ->> 'registrant_role', ''), 'school_admin');
  v_pending int;
  v_limit int;
  v_reviewer record;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid and status = 'active') then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if coalesce((select value::text from public.platform_settings where key = 'registration_open'), 'true') <> 'true' then
    raise exception 'School registration is temporarily closed' using errcode = 'P0001';
  end if;
  if v_role not in ('headteacher', 'school_admin') then
    raise exception 'invalid registrant role' using errcode = '22023';
  end if;

  select coalesce((select (value #>> '{}')::int from public.platform_settings where key = 'max_pending_registrations_per_user'), 3) into v_limit;
  select count(*) into v_pending from public.schools where registered_by = v_uid and status = 'pending_verification';
  if v_pending >= v_limit then
    raise exception 'You already have % registrations awaiting verification', v_pending using errcode = 'P0001';
  end if;

  if coalesce(trim(p ->> 'name'), '') = '' or coalesce(trim(p ->> 'district'), '') = '' or coalesce(trim(p ->> 'address'), '') = ''
     or coalesce(trim(p ->> 'email'), '') = '' or coalesce(trim(p ->> 'phone'), '') = '' or coalesce(trim(p ->> 'headmaster_name'), '') = '' then
    raise exception 'missing required school details' using errcode = '22023';
  end if;
  if nullif(trim(p ->> 'school_code'), '') is not null and exists (select 1 from public.schools where school_code = upper(trim(p ->> 'school_code'))) then
    raise exception 'A school with this code is already registered' using errcode = '23505';
  end if;

  v_slug := left(public.slugify(p ->> 'name'), 60);
  if v_slug = '' then v_slug := 'school'; end if;
  if exists (select 1 from public.schools where slug = v_slug) then
    v_slug := v_slug || '-' || substr(md5(gen_random_uuid()::text), 1, 5);
  end if;

  insert into public.schools (slug, name, school_code, category, ownership, boarding_type, region_code, district, address, email, phone, website,
    programmes_offered, headmaster_name, headmaster_email, headmaster_phone, description, registered_by)
  values (
    v_slug, trim(p ->> 'name'), nullif(upper(trim(p ->> 'school_code')), ''), coalesce(nullif(p ->> 'category', ''), 'unclassified'),
    p ->> 'ownership', p ->> 'boarding_type', p ->> 'region_code', trim(p ->> 'district'), trim(p ->> 'address'), lower(trim(p ->> 'email')),
    trim(p ->> 'phone'), nullif(trim(p ->> 'website'), ''),
    coalesce((select array_agg(trim(x)) from jsonb_array_elements_text(coalesce(p -> 'programmes_offered', '[]')) x where trim(x) <> ''), '{}'),
    trim(p ->> 'headmaster_name'), nullif(lower(trim(p ->> 'headmaster_email')), ''), nullif(trim(p ->> 'headmaster_phone'), ''),
    nullif(trim(p ->> 'description'), ''), v_uid)
  returning id into v_school;

  insert into public.school_settings (school_id) values (v_school);
  insert into public.school_branding (school_id) values (v_school);
  insert into public.school_memberships (school_id, user_id, role_id)
  select v_school, v_uid, r.id from public.roles r where r.key = v_role;

  perform public._audit(v_uid, v_school, 'school.registered', 'school', v_school::text, 'Registered ' || trim(p ->> 'name') || ' for verification', '{}');

  for v_reviewer in
    select distinct pu.user_id from public.platform_users pu
    join public.role_permissions rp on rp.role_id = pu.role_id and rp.permission_key = 'schools.verify'
  loop
    perform public._notify(v_reviewer.user_id, null, 'New school awaiting verification', trim(p ->> 'name'), '/platform/schools/' || v_school);
  end loop;

  return v_school;
end $$;

/** Step 2: platform verification. */
create or replace function public.review_school(p_school uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school public.schools;
begin
  if not public.has_platform_permission('schools.verify') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_school from public.schools where id = p_school for update;
  if not found then raise exception 'school not found' using errcode = 'P0002'; end if;
  if v_school.status <> 'pending_verification' then
    raise exception 'school is not awaiting verification' using errcode = 'P0001';
  end if;

  if p_decision = 'approve' then
    update public.schools set status = 'active', status_reason = null, verified_by = auth.uid(), verified_at = now() where id = p_school;
    insert into public.subscriptions (school_id, plan_id)
    select p_school, id from public.subscription_plans where code = 'free'
    on conflict (school_id) do nothing;
    perform public._audit(auth.uid(), p_school, 'school.approved', 'school', p_school::text, 'Verified and activated ' || v_school.name, '{}');
    if v_school.registered_by is not null then
      perform public._notify(v_school.registered_by, p_school, 'Your school has been verified', v_school.name || ' is active. Continue the onboarding wizard.', '/school/onboarding');
    end if;
  elsif p_decision = 'reject' then
    if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required' using errcode = '22023'; end if;
    update public.schools set status = 'rejected', status_reason = trim(p_reason) where id = p_school;
    perform public._audit(auth.uid(), p_school, 'school.rejected', 'school', p_school::text, 'Rejected ' || v_school.name, jsonb_build_object('reason', trim(p_reason)));
    if v_school.registered_by is not null then
      perform public._notify(v_school.registered_by, p_school, 'School registration not approved', trim(p_reason), '/app');
    end if;
  else
    raise exception 'decision must be approve or reject' using errcode = '22023';
  end if;
end $$;

/** Suspend or reactivate an active school (defined procedure: reason required, audited, members notified). */
create or replace function public.set_school_status(p_school uuid, p_status text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school public.schools; v_member record;
begin
  if not public.has_platform_permission('schools.suspend') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_school from public.schools where id = p_school for update;
  if not found then raise exception 'school not found' using errcode = 'P0002'; end if;
  if not ((v_school.status = 'active' and p_status = 'suspended') or (v_school.status = 'suspended' and p_status = 'active')) then
    raise exception 'invalid status change from % to %', v_school.status, p_status using errcode = 'P0001';
  end if;
  if p_status = 'suspended' and coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  update public.schools set status = p_status, status_reason = nullif(trim(p_reason), '') where id = p_school;
  perform public._audit(auth.uid(), p_school, case when p_status = 'suspended' then 'school.suspended' else 'school.reactivated' end,
    'school', p_school::text, v_school.name, jsonb_build_object('reason', nullif(trim(p_reason), '')));

  for v_member in
    select m.user_id from public.school_memberships m join public.role_permissions rp on rp.role_id = m.role_id and rp.permission_key = 'school.settings.manage'
    where m.school_id = p_school and m.status = 'active'
  loop
    perform public._notify(v_member.user_id, p_school,
      case when p_status = 'suspended' then 'School account suspended' else 'School account reactivated' end,
      coalesce(nullif(trim(p_reason), ''), v_school.name), '/school');
  end loop;
end $$;

/** Add an existing account to a school with a role. Raises 'no_account' when no profile has that email. */
create or replace function public.add_school_member(p_school uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_role public.roles; v_user uuid; v_existing public.school_memberships; v_id uuid;
begin
  if not public.has_school_permission(p_school, 'members.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_role from public.roles where key = p_role and scope = 'school';
  if not found then raise exception 'invalid role' using errcode = '22023'; end if;
  if v_role.rank > public.school_role_rank(p_school) then
    raise exception 'you cannot assign a role above your own' using errcode = '42501';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'no_account' using errcode = 'P0002'; end if;
  if v_user = auth.uid() then raise exception 'you cannot change your own membership' using errcode = '42501'; end if;

  select * into v_existing from public.school_memberships where school_id = p_school and user_id = v_user for update;
  if found and v_existing.status = 'active' then
    raise exception 'already_member' using errcode = '23505';
  elsif found then
    update public.school_memberships set status = 'active', role_id = v_role.id, invited_by = auth.uid() where id = v_existing.id returning id into v_id;
  else
    insert into public.school_memberships (school_id, user_id, role_id, invited_by) values (p_school, v_user, v_role.id, auth.uid()) returning id into v_id;
  end if;

  perform public._audit(auth.uid(), p_school, 'member.added', 'school_membership', v_id::text, 'Added ' || lower(trim(p_email)) || ' as ' || v_role.label, '{}');
  perform public._notify(v_user, p_school, 'You have been added to a school', 'Role: ' || v_role.label, '/school');
  return v_id;
end $$;

/** Change a member's role or remove them. */
create or replace function public.update_school_member(p_membership uuid, p_role text default null, p_status text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.school_memberships; v_current_rank smallint; v_new public.roles; v_my_rank smallint;
begin
  select * into v_m from public.school_memberships where id = p_membership for update;
  if not found then raise exception 'membership not found' using errcode = 'P0002'; end if;
  if not public.has_school_permission(v_m.school_id, 'members.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_m.user_id = auth.uid() then raise exception 'you cannot change your own membership' using errcode = '42501'; end if;

  v_my_rank := public.school_role_rank(v_m.school_id);
  select rank into v_current_rank from public.roles where id = v_m.role_id;
  if v_current_rank > v_my_rank then raise exception 'you cannot change a member ranked above you' using errcode = '42501'; end if;

  if p_role is not null then
    select * into v_new from public.roles where key = p_role and scope = 'school';
    if not found then raise exception 'invalid role' using errcode = '22023'; end if;
    if v_new.rank > v_my_rank then raise exception 'you cannot assign a role above your own' using errcode = '42501'; end if;
    update public.school_memberships set role_id = v_new.id where id = p_membership;
    perform public._audit(auth.uid(), v_m.school_id, 'member.role_changed', 'school_membership', p_membership::text, 'Role changed to ' || v_new.label, '{}');
  end if;
  if p_status is not null then
    if p_status not in ('active', 'removed') then raise exception 'invalid status' using errcode = '22023'; end if;
    update public.school_memberships set status = p_status where id = p_membership;
    perform public._audit(auth.uid(), v_m.school_id, 'member.' || p_status, 'school_membership', p_membership::text, 'Membership ' || p_status, '{}');
  end if;
end $$;

create or replace function public.complete_school_onboarding(p_school uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_school_permission(p_school, 'school.settings.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  update public.schools set onboarding_completed_at = coalesce(onboarding_completed_at, now()) where id = p_school;
  perform public._audit(auth.uid(), p_school, 'school.onboarding_completed', 'school', p_school::text, 'Onboarding completed', '{}');
end $$;

/** Platform staff management. Only super admins may grant super_admin; nobody may change their own platform role. */
create or replace function public.grant_platform_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.roles; v_user uuid; v_my_rank smallint;
begin
  if not public.has_platform_permission('platform.users.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  select * into v_role from public.roles where key = p_role and scope = 'platform';
  if not found then raise exception 'invalid role' using errcode = '22023'; end if;
  select r.rank into v_my_rank from public.platform_users pu join public.roles r on r.id = pu.role_id where pu.user_id = auth.uid();
  if v_role.rank > v_my_rank or (v_role.key = 'super_admin' and v_my_rank < 100) then
    raise exception 'you cannot grant a role above your own' using errcode = '42501';
  end if;
  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'no_account' using errcode = 'P0002'; end if;
  if v_user = auth.uid() then raise exception 'you cannot change your own platform role' using errcode = '42501'; end if;
  if exists (select 1 from public.platform_users pu join public.roles r on r.id = pu.role_id where pu.user_id = v_user and r.rank > v_my_rank) then
    raise exception 'you cannot change a user ranked above you' using errcode = '42501';
  end if;

  insert into public.platform_users (user_id, role_id, granted_by) values (v_user, v_role.id, auth.uid())
  on conflict (user_id) do update set role_id = excluded.role_id, granted_by = excluded.granted_by;
  perform public._audit(auth.uid(), null, 'platform.role_granted', 'platform_user', v_user::text, lower(trim(p_email)) || ' → ' || v_role.label, '{}');
end $$;

create or replace function public.revoke_platform_role(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_my_rank smallint; v_target_rank smallint;
begin
  if not public.has_platform_permission('platform.users.manage') then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_user = auth.uid() then raise exception 'you cannot revoke your own platform role' using errcode = '42501'; end if;
  select r.rank into v_my_rank from public.platform_users pu join public.roles r on r.id = pu.role_id where pu.user_id = auth.uid();
  select r.rank into v_target_rank from public.platform_users pu join public.roles r on r.id = pu.role_id where pu.user_id = p_user;
  if v_target_rank is null then raise exception 'not a platform user' using errcode = 'P0002'; end if;
  if v_target_rank > v_my_rank then raise exception 'you cannot revoke a user ranked above you' using errcode = '42501'; end if;
  delete from public.platform_users where user_id = p_user;
  perform public._audit(auth.uid(), null, 'platform.role_revoked', 'platform_user', p_user::text, 'Platform access revoked', '{}');
end $$;

/** Aggregate-only national figures for the platform dashboard. Contains no identifiable records. */
create or replace function public.platform_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_platform_permission('platform.dashboard')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'schools_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.schools where not is_demo group by status) s), '{}'),
    'active_by_ownership', coalesce((select jsonb_object_agg(ownership, n) from (select ownership, count(*) n from public.schools where status = 'active' and not is_demo group by ownership) s), '{}'),
    'active_by_boarding', coalesce((select jsonb_object_agg(boarding_type, n) from (select boarding_type, count(*) n from public.schools where status = 'active' and not is_demo group by boarding_type) s), '{}'),
    'active_by_region', coalesce((select jsonb_agg(jsonb_build_object('region', r.name, 'count', coalesce(c.n, 0)) order by r.sort)
        from public.regions r left join (select region_code, count(*) n from public.schools where status = 'active' and not is_demo group by region_code) c on c.region_code = r.code), '[]'),
    'members_by_group', coalesce((select jsonb_object_agg(grp, n) from (
        select case r.key when 'student' then 'students' when 'parent' then 'parents' when 'teacher' then 'teachers' else 'other_staff' end grp, count(*) n
        from public.school_memberships m join public.roles r on r.id = m.role_id join public.schools s on s.id = m.school_id
        where m.status = 'active' and not s.is_demo group by 1) g), '{}'),
    'registrations_last_30_days', (select count(*) from public.schools where created_at > now() - interval '30 days' and not is_demo),
    'demo_schools', (select count(*) from public.schools where is_demo)
  );
end $$;

/** Public directory: only verified, active schools that opted in to listing. Exposes approved public fields only. */
create or replace function public.public_school_directory(
  p_query text default null, p_region text default null, p_ownership text default null, p_boarding text default null,
  p_programme text default null, p_limit int default 24, p_offset int default 0
) returns table (
  slug text, name text, region text, district text, ownership text, boarding_type text, programmes_offered text[],
  description text, website text, email text, phone text, logo_path text, is_demo boolean, total_count bigint
)
language sql stable security definer set search_path = '' as $$
  select s.slug, s.name, r.name, s.district, s.ownership, s.boarding_type, s.programmes_offered, s.description, s.website, s.email, s.phone,
         coalesce(b.logo_path, s.logo_path), s.is_demo, count(*) over ()
  from public.schools s
  join public.regions r on r.code = s.region_code
  left join public.school_branding b on b.school_id = s.id
  where s.status = 'active' and s.public_listing
    and (p_query is null or s.name ilike '%' || p_query || '%' or s.district ilike '%' || p_query || '%')
    and (p_region is null or s.region_code = p_region)
    and (p_ownership is null or s.ownership = p_ownership)
    and (p_boarding is null or s.boarding_type = p_boarding)
    and (p_programme is null or exists (select 1 from unnest(s.programmes_offered) x where x ilike '%' || p_programme || '%'))
  order by s.is_demo, s.name
  limit least(greatest(coalesce(p_limit, 24), 1), 100) offset greatest(coalesce(p_offset, 0), 0)
$$;

/** One public school profile by slug — same visibility rule and fields as the directory. */
create or replace function public.public_school_profile(p_slug text) returns table (
  slug text, name text, region text, district text, ownership text, boarding_type text, programmes_offered text[],
  description text, website text, email text, phone text, logo_path text, motto text, primary_color text, is_demo boolean
)
language sql stable security definer set search_path = '' as $$
  select s.slug, s.name, r.name, s.district, s.ownership, s.boarding_type, s.programmes_offered, s.description, s.website, s.email, s.phone,
         coalesce(b.logo_path, s.logo_path), b.motto, b.primary_color, s.is_demo
  from public.schools s
  join public.regions r on r.code = s.region_code
  left join public.school_branding b on b.school_id = s.id
  where s.slug = p_slug and s.status = 'active' and s.public_listing
$$;

/** Public headline figures: verified, active, non-sample schools only. */
create or replace function public.public_platform_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'active_schools', (select count(*) from public.schools where status = 'active' and not is_demo),
    'regions_covered', (select count(distinct region_code) from public.schools where status = 'active' and not is_demo)
  )
$$;

-- -------------------------------------------------------------------------------------
-- Storage: public logo bucket, writes restricted to the uploader's own school folder
-- -------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-logos', 'school-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy school_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'school-logos' and public.has_school_permission(public.try_uuid((storage.foldername(name))[1]), 'school.branding.manage'));
create policy school_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'school-logos' and public.has_school_permission(public.try_uuid((storage.foldername(name))[1]), 'school.branding.manage'));
create policy school_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'school-logos' and public.has_school_permission(public.try_uuid((storage.foldername(name))[1]), 'school.branding.manage'));

-- -------------------------------------------------------------------------------------
-- Function privileges: internal helpers are not part of the API.
-- -------------------------------------------------------------------------------------
revoke execute on function public._audit(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public._notify(uuid, uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.register_school(jsonb), public.review_school(uuid, text, text), public.set_school_status(uuid, text, text),
  public.add_school_member(uuid, text, text), public.update_school_member(uuid, text, text), public.complete_school_onboarding(uuid),
  public.grant_platform_role(text, text), public.revoke_platform_role(uuid), public.platform_overview(), public.log_audit(text, text, text, text, uuid, jsonb)
  from public, anon;
grant execute on function public.public_school_directory(text, text, text, text, text, int, int) to anon, authenticated;
grant execute on function public.public_platform_stats() to anon, authenticated;
grant execute on function public.public_school_profile(text) to anon, authenticated;
