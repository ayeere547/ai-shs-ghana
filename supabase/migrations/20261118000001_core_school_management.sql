-- =====================================================================================
-- AI SHS Ghana — Phase 2: core school management
-- Students, guardians, staff, teaching assignments, subject registration, timetables,
-- attendance, grading schemes, assessments and results.
--
-- Same rules as Phase 1: every row carries school_id, composite foreign keys keep links
-- inside one school, and RLS decides access. Teachers are limited to the classes and
-- subjects they are assigned; students and parents see only their own / linked records.
-- =====================================================================================

-- Composite keys so child rows can only reference parents in the same school.
alter table public.school_classes add constraint school_classes_id_school_key unique (id, school_id);
alter table public.school_subjects add constraint school_subjects_id_school_key unique (id, school_id);
alter table public.school_houses add constraint school_houses_id_school_key unique (id, school_id);
alter table public.academic_terms add constraint academic_terms_id_school_key unique (id, school_id);

-- -------------------------------------------------------------------------------------
-- Permissions and role grants
-- -------------------------------------------------------------------------------------
insert into public.permissions (key, scope, description) values
  ('students.read',      'school', 'View student records'),
  ('students.manage',    'school', 'Admit, edit, import, transfer and graduate students'),
  ('staff.read',         'school', 'View the staff directory'),
  ('staff.manage',       'school', 'Add and edit staff records and teaching assignments'),
  ('timetable.manage',   'school', 'Configure periods and edit or generate timetables'),
  ('attendance.record',  'school', 'Take attendance for classes you teach'),
  ('attendance.manage',  'school', 'Take or correct attendance for any class'),
  ('assessments.record', 'school', 'Create assessments and enter scores for subjects you teach'),
  ('assessments.manage', 'school', 'Manage all assessments, scores and grading schemes'),
  ('results.read',       'school', 'View results for every class'),
  ('results.publish',    'school', 'Publish term results to students and parents');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.scope = 'school'
where p.key in ('students.read','students.manage','staff.read','staff.manage','timetable.manage','attendance.record','attendance.manage',
                'assessments.record','assessments.manage','results.read','results.publish')
  and (
    r.key in ('headteacher', 'school_admin', 'assistant_headteacher')
    or (r.key, p.key) in (
      ('academic_admin','students.read'), ('academic_admin','students.manage'), ('academic_admin','staff.read'), ('academic_admin','timetable.manage'),
      ('academic_admin','attendance.manage'), ('academic_admin','assessments.manage'), ('academic_admin','results.read'), ('academic_admin','results.publish'),
      ('hr_officer','staff.read'), ('hr_officer','staff.manage'),
      ('exam_officer','students.read'), ('exam_officer','assessments.manage'), ('exam_officer','results.read'), ('exam_officer','results.publish'),
      ('head_of_department','students.read'), ('head_of_department','staff.read'), ('head_of_department','results.read'),
      ('head_of_department','attendance.record'), ('head_of_department','assessments.record'),
      ('teacher','students.read'), ('teacher','staff.read'), ('teacher','attendance.record'), ('teacher','assessments.record'),
      ('counsellor','students.read'), ('housemaster','students.read'), ('accountant','students.read')
    )
  )
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- Per-school number sequences (student and staff IDs)
-- -------------------------------------------------------------------------------------
create table public.school_sequences (
  school_id uuid not null references public.schools (id) on delete cascade,
  kind text not null check (kind in ('student', 'staff')),
  next_value integer not null default 1,
  primary key (school_id, kind)
);
alter table public.school_sequences enable row level security; -- no policies: RPC access only
revoke all on public.school_sequences from anon, authenticated;

/** Issues the next ID, e.g. SRS/26/00042, for students.manage / staff.manage holders. */
create or replace function public.next_school_number(p_school uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_n integer; v_prefix text;
begin
  if not public.has_school_permission(p_school, case p_kind when 'student' then 'students.manage' when 'staff' then 'staff.manage' end) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  insert into public.school_sequences (school_id, kind) values (p_school, p_kind) on conflict do nothing;
  update public.school_sequences set next_value = next_value + 1 where school_id = p_school and kind = p_kind returning next_value - 1 into v_n;
  select upper(coalesce(nullif(regexp_replace(s.school_code, '[^A-Za-z0-9]', '', 'g'), ''),
                        (select string_agg(left(w, 1), '') from regexp_split_to_table(s.slug, '-') w)))
    into v_prefix from public.schools s where s.id = p_school;
  return left(v_prefix, 8) || '/' || case p_kind when 'staff' then 'ST/' else '' end || to_char(now() at time zone 'Africa/Accra', 'YY') || '/' || lpad(v_n::text, 5, '0');
end $$;

-- -------------------------------------------------------------------------------------
-- Students and guardians
-- -------------------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_number text not null,
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  middle_name text check (length(middle_name) <= 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  date_of_birth date check (date_of_birth > '1950-01-01' and date_of_birth < current_date),
  gender text not null check (gender in ('male', 'female')),
  admission_date date not null default current_date,
  programme_id uuid,
  class_id uuid,
  house_id uuid,
  residency text not null default 'day' check (residency in ('day', 'boarding')),
  status text not null default 'active' check (status in ('active', 'suspended', 'transferred', 'withdrawn', 'graduated')),
  previous_school text check (length(previous_school) <= 160),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, student_number),
  unique (id, school_id),
  foreign key (programme_id, school_id) references public.school_programmes (id, school_id) on delete set null (programme_id),
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete set null (class_id),
  foreign key (house_id, school_id) references public.school_houses (id, school_id) on delete set null (house_id)
);
create index students_school_class_idx on public.students (school_id, class_id) where status = 'active';
create index students_name_idx on public.students (school_id, lower(last_name), lower(first_name));
create unique index students_user_unique on public.students (school_id, user_id) where user_id is not null;

create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 2 and 160),
  phone text not null check (length(phone) between 9 and 32),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  occupation text check (length(occupation) <= 120),
  address text check (length(address) <= 300),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id)
);
create index guardians_school_idx on public.guardians (school_id);
create index guardians_user_idx on public.guardians (user_id) where user_id is not null;

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null check (relationship in ('mother', 'father', 'guardian', 'grandparent', 'sibling', 'other')),
  is_primary boolean not null default false,
  is_emergency_contact boolean not null default true,
  can_view_records boolean not null default true,
  created_at timestamptz not null default now(),
  unique (student_id, guardian_id),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (guardian_id, school_id) references public.guardians (id, school_id) on delete cascade
);
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

create table public.student_status_history (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  from_status text,
  to_status text not null,
  from_class_id uuid,
  to_class_id uuid,
  reason text check (length(reason) <= 500),
  effective_on date not null default current_date,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);
create index student_status_history_student_idx on public.student_status_history (student_id, created_at desc);

-- -------------------------------------------------------------------------------------
-- Staff and teaching assignments
-- -------------------------------------------------------------------------------------
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  staff_number text not null,
  title text check (title in ('Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Rev', 'Prof')),
  first_name text not null check (length(trim(first_name)) between 1 and 80),
  last_name text not null check (length(trim(last_name)) between 1 and 80),
  gender text check (gender in ('male', 'female')),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text check (length(phone) <= 32),
  job_title text not null default 'Teacher' check (length(job_title) <= 80),
  department_id uuid,
  is_teaching boolean not null default true,
  employment_type text not null default 'permanent' check (employment_type in ('permanent', 'contract', 'national_service', 'part_time', 'volunteer')),
  employment_status text not null default 'active' check (employment_status in ('active', 'on_leave', 'left')),
  date_joined date,
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, staff_number),
  unique (id, school_id),
  foreign key (department_id, school_id) references public.school_departments (id, school_id) on delete set null (department_id)
);
create index staff_school_idx on public.staff (school_id);
create unique index staff_user_unique on public.staff (school_id, user_id) where user_id is not null;

create table public.teacher_assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  staff_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  periods_per_week smallint not null default 4 check (periods_per_week between 0 and 20),
  created_at timestamptz not null default now(),
  unique (class_id, subject_id), -- one teacher per subject per class
  foreign key (staff_id, school_id) references public.staff (id, school_id) on delete cascade,
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade
);
create index teacher_assignments_staff_idx on public.teacher_assignments (staff_id);

create table public.subject_registrations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  subject_id uuid not null,
  created_at timestamptz not null default now(),
  unique (student_id, subject_id),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade
);

-- -------------------------------------------------------------------------------------
-- Timetable
-- -------------------------------------------------------------------------------------
create table public.timetable_periods (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  starts_at time not null,
  ends_at time not null,
  is_break boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (school_id, name),
  unique (school_id, starts_at),
  unique (id, school_id)
);

create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  term_id uuid not null,
  class_id uuid not null,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  period_id uuid not null,
  subject_id uuid not null,
  staff_id uuid,
  room text check (length(trim(room)) between 1 and 40),
  created_at timestamptz not null default now(),
  foreign key (term_id, school_id) references public.academic_terms (id, school_id) on delete cascade,
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (period_id, school_id) references public.timetable_periods (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade,
  foreign key (staff_id, school_id) references public.staff (id, school_id) on delete set null (staff_id),
  -- Double-booking is impossible at the database level:
  constraint timetable_class_clash unique (term_id, class_id, day_of_week, period_id),
  constraint timetable_teacher_clash unique (term_id, staff_id, day_of_week, period_id),
  constraint timetable_room_clash unique (term_id, room, day_of_week, period_id)
);
create index timetable_slots_term_idx on public.timetable_slots (school_id, term_id);

-- -------------------------------------------------------------------------------------
-- Attendance
-- -------------------------------------------------------------------------------------
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  class_id uuid not null,
  attendance_date date not null check (attendance_date <= current_date + 1),
  status text not null check (status in ('present', 'absent', 'late', 'excused')),
  remark text check (length(remark) <= 200),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, attendance_date),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade
);
create index attendance_class_date_idx on public.attendance (school_id, class_id, attendance_date);

-- -------------------------------------------------------------------------------------
-- Grading, assessments, scores, publication
-- -------------------------------------------------------------------------------------
create table public.grading_schemes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  unique (id, school_id)
);
create unique index grading_schemes_one_default on public.grading_schemes (school_id) where is_default;

create table public.grading_bands (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  scheme_id uuid not null,
  grade text not null check (length(trim(grade)) between 1 and 8),
  min_score numeric(5, 2) not null check (min_score between 0 and 100),
  max_score numeric(5, 2) not null check (max_score between 0 and 100),
  remark text check (length(remark) <= 60),
  points numeric(4, 1),
  check (max_score >= min_score),
  unique (scheme_id, grade),
  foreign key (scheme_id, school_id) references public.grading_schemes (id, school_id) on delete cascade
);

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  term_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 80),
  kind text not null check (kind in ('class_test', 'assignment', 'project', 'mid_term', 'end_of_term', 'mock')),
  max_score numeric(6, 2) not null check (max_score > 0 and max_score <= 1000),
  weight numeric(5, 2) not null check (weight > 0 and weight <= 100),
  assessed_on date,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (term_id, school_id) references public.academic_terms (id, school_id) on delete cascade,
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade
);
create index assessments_lookup_idx on public.assessments (school_id, term_id, class_id, subject_id);

create table public.assessment_scores (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  assessment_id uuid not null,
  student_id uuid not null,
  score numeric(6, 2) check (score >= 0),
  remark text check (length(remark) <= 200),
  entered_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id),
  foreign key (assessment_id, school_id) references public.assessments (id, school_id) on delete cascade,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);

create table public.result_publications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  term_id uuid not null,
  class_id uuid not null,
  published_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz not null default now(),
  unique (term_id, class_id),
  foreign key (term_id, school_id) references public.academic_terms (id, school_id) on delete cascade,
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade
);

-- -------------------------------------------------------------------------------------
-- Integrity triggers
-- -------------------------------------------------------------------------------------
/** Attendance can only be recorded for a student currently in that class. */
create or replace function public.check_attendance_student() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.students s where s.id = new.student_id and s.class_id = new.class_id and s.status in ('active', 'suspended')) then
    raise exception 'student is not an active member of this class' using errcode = '23514';
  end if;
  new.recorded_by := coalesce(auth.uid(), new.recorded_by);
  return new;
end $$;
create trigger attendance_student_check before insert or update on public.attendance for each row execute function public.check_attendance_student();

/** Scores must fit the assessment's maximum, and belong to a student of the assessed class. */
create or replace function public.check_assessment_score() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_a public.assessments;
begin
  select * into v_a from public.assessments where id = new.assessment_id;
  if new.score is not null and new.score > v_a.max_score then
    raise exception 'score exceeds the maximum of %', v_a.max_score using errcode = '23514';
  end if;
  if not exists (select 1 from public.students s where s.id = new.student_id and s.class_id = v_a.class_id) then
    raise exception 'student is not in the assessed class' using errcode = '23514';
  end if;
  new.entered_by := coalesce(auth.uid(), new.entered_by);
  return new;
end $$;
create trigger assessment_scores_check before insert or update on public.assessment_scores for each row execute function public.check_assessment_score();

-- updated_at + school_id immutability for every Phase 2 tenant table
do $$
declare t text;
begin
  foreach t in array array['students','guardians','staff','timetable_periods','attendance','grading_schemes','assessments','assessment_scores'] loop
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['students','guardians','student_guardians','student_status_history','staff','teacher_assignments','subject_registrations',
                           'timetable_periods','timetable_slots','attendance','grading_schemes','grading_bands','assessments','assessment_scores','result_publications'] loop
    execute format('create trigger %1$s_school_lock before update on public.%1$s for each row execute function public.forbid_school_id_change()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon', t);
  end loop;
end $$;

-- -------------------------------------------------------------------------------------
-- Relationship helpers (SECURITY DEFINER; each also requires an active school membership)
-- -------------------------------------------------------------------------------------
create or replace function public.my_staff_id(p_school uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.staff s
  where s.school_id = p_school and s.user_id = auth.uid() and s.employment_status <> 'left' and public.is_school_member(p_school)
$$;

/** Caller is assigned to teach this class (and subject, when given). */
create or replace function public.teaches(p_school uuid, p_class uuid, p_subject uuid default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_assignments ta
    where ta.school_id = p_school and ta.class_id = p_class and (p_subject is null or ta.subject_id = p_subject)
      and ta.staff_id = public.my_staff_id(p_school)
  )
$$;

create or replace function public.is_student_self(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.students s where s.id = p_student and s.user_id = auth.uid() and public.is_school_member(s.school_id))
$$;

/** Caller is a linked guardian with permission to view this student's records. */
create or replace function public.is_guardian_of(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p_student and sg.can_view_records and g.user_id = auth.uid() and public.is_school_member(g.school_id)
  )
$$;

create or replace function public.results_published(p_term uuid, p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.result_publications where term_id = p_term and class_id = p_class)
$$;

/** Results for this assessment's class and term have been published (checked without the caller's RLS). */
create or replace function public.assessment_published(p_assessment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assessments a join public.result_publications rp on rp.term_id = a.term_id and rp.class_id = a.class_id
    where a.id = p_assessment
  )
$$;

create or replace function public.can_enter_scores(p_assessment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assessments a where a.id = p_assessment and (
      public.has_school_permission(a.school_id, 'assessments.manage')
      or (public.has_school_permission(a.school_id, 'assessments.record') and public.teaches(a.school_id, a.class_id, a.subject_id))
    )
  )
$$;

-- -------------------------------------------------------------------------------------
-- RLS policies
-- -------------------------------------------------------------------------------------
-- Students: staff with students.read; the student themself; linked guardians.
create policy students_select on public.students for select to authenticated
  using (public.school_role_has(school_id, 'students.read') or public.is_student_self(id) or public.is_guardian_of(id));
create policy students_insert on public.students for insert to authenticated with check (public.has_school_permission(school_id, 'students.manage'));
create policy students_update on public.students for update to authenticated
  using (public.has_school_permission(school_id, 'students.manage')) with check (public.has_school_permission(school_id, 'students.manage'));
create policy students_delete on public.students for delete to authenticated using (public.has_school_permission(school_id, 'students.manage'));

create policy guardians_select on public.guardians for select to authenticated
  using (public.school_role_has(school_id, 'students.read') or (user_id = auth.uid() and public.is_school_member(school_id)));
create policy guardians_write on public.guardians for all to authenticated
  using (public.has_school_permission(school_id, 'students.manage')) with check (public.has_school_permission(school_id, 'students.manage'));

create policy student_guardians_select on public.student_guardians for select to authenticated
  using (public.school_role_has(school_id, 'students.read') or public.is_guardian_of(student_id) or public.is_student_self(student_id));
create policy student_guardians_write on public.student_guardians for all to authenticated
  using (public.has_school_permission(school_id, 'students.manage')) with check (public.has_school_permission(school_id, 'students.manage'));

create policy student_status_history_select on public.student_status_history for select to authenticated
  using (public.school_role_has(school_id, 'students.read'));

create policy subject_registrations_select on public.subject_registrations for select to authenticated
  using (public.school_role_has(school_id, 'students.read') or public.is_student_self(student_id) or public.is_guardian_of(student_id));
create policy subject_registrations_write on public.subject_registrations for all to authenticated
  using (public.has_school_permission(school_id, 'students.manage')) with check (public.has_school_permission(school_id, 'students.manage'));

-- Staff directory: staff.read, or your own record.
create policy staff_select on public.staff for select to authenticated
  using (public.school_role_has(school_id, 'staff.read') or (user_id = auth.uid() and public.is_school_member(school_id)));
create policy staff_write on public.staff for all to authenticated
  using (public.has_school_permission(school_id, 'staff.manage')) with check (public.has_school_permission(school_id, 'staff.manage'));

create policy teacher_assignments_select on public.teacher_assignments for select to authenticated using (public.is_school_member(school_id));
create policy teacher_assignments_write on public.teacher_assignments for all to authenticated
  using (public.has_school_permission(school_id, 'staff.manage') or public.has_school_permission(school_id, 'timetable.manage'))
  with check (public.has_school_permission(school_id, 'staff.manage') or public.has_school_permission(school_id, 'timetable.manage'));

-- Timetable: visible to every member; editable with timetable.manage.
create policy timetable_periods_select on public.timetable_periods for select to authenticated using (public.is_school_member(school_id));
create policy timetable_periods_write on public.timetable_periods for all to authenticated
  using (public.has_school_permission(school_id, 'timetable.manage')) with check (public.has_school_permission(school_id, 'timetable.manage'));
create policy timetable_slots_select on public.timetable_slots for select to authenticated using (public.is_school_member(school_id));
create policy timetable_slots_write on public.timetable_slots for all to authenticated
  using (public.has_school_permission(school_id, 'timetable.manage')) with check (public.has_school_permission(school_id, 'timetable.manage'));

-- Attendance: managers anywhere; teachers only for classes they teach; students/guardians read their own.
create policy attendance_select on public.attendance for select to authenticated
  using (public.school_role_has(school_id, 'attendance.manage') or public.school_role_has(school_id, 'students.read')
         or public.is_student_self(student_id) or public.is_guardian_of(student_id));
create policy attendance_write on public.attendance for all to authenticated
  using (public.has_school_permission(school_id, 'attendance.manage')
         or (public.has_school_permission(school_id, 'attendance.record') and public.teaches(school_id, class_id)))
  with check (public.has_school_permission(school_id, 'attendance.manage')
         or (public.has_school_permission(school_id, 'attendance.record') and public.teaches(school_id, class_id)));

-- Grading schemes: every member reads; assessments.manage edits.
create policy grading_schemes_select on public.grading_schemes for select to authenticated using (public.is_school_member(school_id));
create policy grading_schemes_write on public.grading_schemes for all to authenticated
  using (public.has_school_permission(school_id, 'assessments.manage')) with check (public.has_school_permission(school_id, 'assessments.manage'));
create policy grading_bands_select on public.grading_bands for select to authenticated using (public.is_school_member(school_id));
create policy grading_bands_write on public.grading_bands for all to authenticated
  using (public.has_school_permission(school_id, 'assessments.manage')) with check (public.has_school_permission(school_id, 'assessments.manage'));

-- Assessments and scores: results.read / managers; the subject teacher; students & guardians once published.
create policy assessments_select on public.assessments for select to authenticated
  using (public.school_role_has(school_id, 'results.read') or public.school_role_has(school_id, 'assessments.manage')
         or public.teaches(school_id, class_id, subject_id));
create policy assessments_write on public.assessments for all to authenticated
  using (public.has_school_permission(school_id, 'assessments.manage')
         or (public.has_school_permission(school_id, 'assessments.record') and public.teaches(school_id, class_id, subject_id)))
  with check (public.has_school_permission(school_id, 'assessments.manage')
         or (public.has_school_permission(school_id, 'assessments.record') and public.teaches(school_id, class_id, subject_id)));

create policy assessment_scores_select on public.assessment_scores for select to authenticated
  using (
    public.school_role_has(school_id, 'results.read') or public.school_role_has(school_id, 'assessments.manage')
    or public.can_enter_scores(assessment_id)
    or ((public.is_student_self(student_id) or public.is_guardian_of(student_id)) and public.assessment_published(assessment_id))
  );
create policy assessment_scores_write on public.assessment_scores for all to authenticated
  using (public.can_enter_scores(assessment_id)) with check (public.can_enter_scores(assessment_id));

create policy result_publications_select on public.result_publications for select to authenticated using (public.is_school_member(school_id));

-- Status history and publications are written only through audited RPCs.
revoke insert, update, delete on public.student_status_history, public.result_publications from authenticated;

-- -------------------------------------------------------------------------------------
-- RPCs
-- -------------------------------------------------------------------------------------
/** Transfer, withdraw, suspend, reinstate or graduate a student, or move them to another class. */
create or replace function public.change_student_status(p_student uuid, p_status text, p_class uuid default null, p_reason text default null, p_effective date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_s public.students;
begin
  select * into v_s from public.students where id = p_student for update;
  if not found then raise exception 'student not found' using errcode = 'P0002'; end if;
  if not public.has_school_permission(v_s.school_id, 'students.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_status not in ('active', 'suspended', 'transferred', 'withdrawn', 'graduated') then raise exception 'invalid status' using errcode = '22023'; end if;
  if p_class is not null and not exists (select 1 from public.school_classes where id = p_class and school_id = v_s.school_id) then
    raise exception 'class not found in this school' using errcode = '22023';
  end if;
  if p_status in ('transferred', 'withdrawn') and coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = '22023';
  end if;

  update public.students
     set status = p_status,
         class_id = case when p_status = 'active' then coalesce(p_class, class_id) else class_id end
   where id = p_student;
  insert into public.student_status_history (school_id, student_id, from_status, to_status, from_class_id, to_class_id, reason, effective_on, recorded_by)
  values (v_s.school_id, p_student, v_s.status, p_status, v_s.class_id, case when p_status = 'active' then coalesce(p_class, v_s.class_id) else v_s.class_id end,
          nullif(trim(p_reason), ''), coalesce(p_effective, current_date), auth.uid());
  perform public._audit(auth.uid(), v_s.school_id, 'student.status_changed', 'student', p_student::text,
    v_s.first_name || ' ' || v_s.last_name || ': ' || v_s.status || ' → ' || p_status, jsonb_build_object('reason', nullif(trim(p_reason), '')));
end $$;

/** End-of-year progression: move every active student of one class to another, or graduate them. Returns the number moved. */
create or replace function public.promote_class(p_from uuid, p_to uuid default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_n integer;
begin
  select school_id into v_school from public.school_classes where id = p_from;
  if v_school is null then raise exception 'class not found' using errcode = 'P0002'; end if;
  if not public.has_school_permission(v_school, 'students.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_to is not null and not exists (select 1 from public.school_classes where id = p_to and school_id = v_school) then
    raise exception 'target class not found in this school' using errcode = '22023';
  end if;
  if p_to = p_from then raise exception 'choose a different class' using errcode = '22023'; end if;

  insert into public.student_status_history (school_id, student_id, from_status, to_status, from_class_id, to_class_id, reason, recorded_by)
  select v_school, id, status, case when p_to is null then 'graduated' else 'active' end, class_id, coalesce(p_to, class_id),
         case when p_to is null then 'Graduated' else 'Promoted' end, auth.uid()
  from public.students where class_id = p_from and status = 'active';
  get diagnostics v_n = row_count;

  update public.students set status = case when p_to is null then 'graduated' else 'active' end, class_id = coalesce(p_to, class_id)
  where class_id = p_from and status = 'active';

  perform public._audit(auth.uid(), v_school, case when p_to is null then 'students.graduated' else 'students.promoted' end, 'school_class', p_from::text,
    v_n || ' students ' || case when p_to is null then 'graduated' else 'promoted' end, jsonb_build_object('to_class', p_to));
  return v_n;
end $$;

/** Links a student or guardian record to a sign-in account, adding the matching school membership. */
create or replace function public.link_account(p_kind text, p_record uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_user uuid; v_role uuid;
begin
  if p_kind = 'student' then select school_id into v_school from public.students where id = p_record;
  elsif p_kind = 'guardian' then select school_id into v_school from public.guardians where id = p_record;
  else raise exception 'invalid kind' using errcode = '22023'; end if;
  if v_school is null then raise exception 'record not found' using errcode = 'P0002'; end if;
  if not public.has_school_permission(v_school, 'students.manage') then raise exception 'permission denied' using errcode = '42501'; end if;

  select id into v_user from public.profiles where lower(email) = lower(trim(p_email));
  if v_user is null then raise exception 'no_account' using errcode = 'P0002'; end if;
  if exists (select 1 from public.school_memberships m join public.roles r on r.id = m.role_id
             where m.school_id = v_school and m.user_id = v_user and r.key not in ('student', 'parent')) then
    raise exception 'that account belongs to a staff member of this school' using errcode = '42501';
  end if;

  select id into v_role from public.roles where key = case p_kind when 'student' then 'student' else 'parent' end;
  insert into public.school_memberships (school_id, user_id, role_id, invited_by) values (v_school, v_user, v_role, auth.uid())
  on conflict (school_id, user_id) do update set status = 'active', role_id = case
    when (select key from public.roles where id = public.school_memberships.role_id) in ('student', 'parent') then excluded.role_id
    else public.school_memberships.role_id end;

  if p_kind = 'student' then update public.students set user_id = v_user where id = p_record;
  else update public.guardians set user_id = v_user where id = p_record; end if;
  perform public._audit(auth.uid(), v_school, p_kind || '.account_linked', p_kind, p_record::text, 'Linked account ' || lower(trim(p_email)), '{}');
end $$;

create or replace function public.publish_results(p_term uuid, p_class uuid, p_publish boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school uuid;
begin
  select school_id into v_school from public.school_classes where id = p_class;
  if v_school is null or not exists (select 1 from public.academic_terms where id = p_term and school_id = v_school) then
    raise exception 'class or term not found' using errcode = 'P0002';
  end if;
  if not public.has_school_permission(v_school, 'results.publish') then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_publish then
    insert into public.result_publications (school_id, term_id, class_id, published_by) values (v_school, p_term, p_class, auth.uid()) on conflict do nothing;
  else
    delete from public.result_publications where term_id = p_term and class_id = p_class;
  end if;
  perform public._audit(auth.uid(), v_school, case when p_publish then 'results.published' else 'results.unpublished' end, 'school_class', p_class::text,
    case when p_publish then 'Published' else 'Withdrew' end || ' term results', jsonb_build_object('term', p_term));
end $$;

/** Replaces a term's timetable for the given classes in one transaction (used by the generator). */
create or replace function public.replace_timetable(p_school uuid, p_term uuid, p_classes uuid[], p_slots jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_n integer;
begin
  if not public.has_school_permission(p_school, 'timetable.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  delete from public.timetable_slots where school_id = p_school and term_id = p_term and class_id = any (p_classes);
  insert into public.timetable_slots (school_id, term_id, class_id, day_of_week, period_id, subject_id, staff_id, room)
  select p_school, p_term, (s ->> 'class_id')::uuid, (s ->> 'day_of_week')::smallint, (s ->> 'period_id')::uuid, (s ->> 'subject_id')::uuid,
         nullif(s ->> 'staff_id', '')::uuid, nullif(s ->> 'room', '')
  from jsonb_array_elements(p_slots) s;
  get diagnostics v_n = row_count;
  perform public.log_audit('timetable.generated', 'academic_term', p_term::text, v_n || ' lessons scheduled', p_school);
  return v_n;
end $$;

revoke execute on function public.next_school_number(uuid, text), public.change_student_status(uuid, text, uuid, text, date), public.promote_class(uuid, uuid),
  public.link_account(text, uuid, text), public.publish_results(uuid, uuid, boolean), public.replace_timetable(uuid, uuid, uuid[], jsonb) from public, anon;

-- -------------------------------------------------------------------------------------
-- Account links (students.user_id, guardians.user_id, staff.user_id) change only via RPCs.
-- Column-level grants exclude user_id from direct inserts/updates.
-- -------------------------------------------------------------------------------------
revoke insert, update on public.students, public.guardians, public.staff from authenticated;
grant insert (school_id, student_number, first_name, middle_name, last_name, date_of_birth, gender, admission_date, programme_id, class_id, house_id, residency, status, previous_school),
      update (student_number, first_name, middle_name, last_name, date_of_birth, gender, admission_date, programme_id, class_id, house_id, residency, previous_school)
  on public.students to authenticated;
grant insert (school_id, full_name, phone, email, occupation, address), update (full_name, phone, email, occupation, address) on public.guardians to authenticated;
grant insert (school_id, staff_number, title, first_name, last_name, gender, email, phone, job_title, department_id, is_teaching, employment_type, employment_status, date_joined),
      update (staff_number, title, first_name, last_name, gender, email, phone, job_title, department_id, is_teaching, employment_type, employment_status, date_joined)
  on public.staff to authenticated;

/** Links a staff record to the sign-in account of an existing staff member of the same school. */
create or replace function public.link_staff_account(p_staff uuid, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school uuid; v_user uuid;
begin
  select school_id into v_school from public.staff where id = p_staff;
  if v_school is null then raise exception 'record not found' using errcode = 'P0002'; end if;
  if not public.has_school_permission(v_school, 'staff.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  select p.id into v_user from public.profiles p
    join public.school_memberships m on m.user_id = p.id and m.school_id = v_school and m.status = 'active'
    join public.roles r on r.id = m.role_id and r.key not in ('student', 'parent')
  where lower(p.email) = lower(trim(p_email));
  if v_user is null then raise exception 'not_staff_member' using errcode = 'P0002'; end if;
  update public.staff set user_id = null where school_id = v_school and user_id = v_user and id <> p_staff;
  update public.staff set user_id = v_user where id = p_staff;
  perform public._audit(auth.uid(), v_school, 'staff.account_linked', 'staff', p_staff::text, 'Linked account ' || lower(trim(p_email)), '{}');
end $$;

/** Removes an account link from a student, guardian or staff record. */
create or replace function public.unlink_account(p_kind text, p_record uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_school uuid;
begin
  if p_kind = 'student' then select school_id into v_school from public.students where id = p_record;
  elsif p_kind = 'guardian' then select school_id into v_school from public.guardians where id = p_record;
  elsif p_kind = 'staff' then select school_id into v_school from public.staff where id = p_record;
  else raise exception 'invalid kind' using errcode = '22023'; end if;
  if v_school is null then raise exception 'record not found' using errcode = 'P0002'; end if;
  if not public.has_school_permission(v_school, case p_kind when 'staff' then 'staff.manage' else 'students.manage' end) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if p_kind = 'student' then update public.students set user_id = null where id = p_record;
  elsif p_kind = 'guardian' then update public.guardians set user_id = null where id = p_record;
  else update public.staff set user_id = null where id = p_record; end if;
  perform public._audit(auth.uid(), v_school, p_kind || '.account_unlinked', p_kind, p_record::text, 'Account link removed', '{}');
end $$;

revoke execute on function public.link_staff_account(uuid, text), public.unlink_account(text, uuid) from public, anon;
