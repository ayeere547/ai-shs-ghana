-- =====================================================================================
-- AI SHS Ghana — Phase 3: learning management
-- Digital classroom (materials, announcements, moderated discussion), assignments and
-- submissions, digital library, question bank and online examinations.
--
-- Students never read answer keys: questions are only visible to teaching staff, and the
-- exam paper, answer saving, submission and review all go through SECURITY DEFINER RPCs.
-- =====================================================================================

-- -------------------------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------------------------
insert into public.permissions (key, scope, description) values
  ('classroom.teach',       'school', 'Run the digital classroom, assignments and exams for subjects you teach'),
  ('classroom.manage',      'school', 'Manage every class''s digital classroom, assignments and exams'),
  ('announcements.manage',  'school', 'Post school-wide announcements'),
  ('library.manage',        'school', 'Manage the digital library'),
  ('student.portal',        'school', 'Use the student portal');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.scope = 'school'
where p.key in ('classroom.teach', 'classroom.manage', 'announcements.manage', 'library.manage', 'student.portal')
  and (
    (r.key in ('headteacher', 'school_admin', 'assistant_headteacher') and p.key <> 'student.portal')
    or (r.key, p.key) in (
      ('academic_admin','classroom.manage'), ('academic_admin','classroom.teach'), ('academic_admin','library.manage'), ('academic_admin','announcements.manage'),
      ('exam_officer','classroom.manage'), ('exam_officer','classroom.teach'),
      ('head_of_department','classroom.teach'), ('teacher','classroom.teach'),
      ('librarian','library.manage'), ('counsellor','announcements.manage'),
      ('student','student.portal')
    )
  )
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- Helpers
-- -------------------------------------------------------------------------------------
/** The signed-in user's active student record in a school. */
create or replace function public.my_student_id(p_school uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s
  where s.school_id = p_school and s.user_id = auth.uid() and s.status = 'active' and public.is_school_member(p_school)
$$;

/** Caller is an active student currently in this class. */
create or replace function public.student_in_class(p_class uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
    where s.class_id = p_class and s.user_id = auth.uid() and s.status = 'active' and public.is_school_member(s.school_id)
  )
$$;

/** Caller is staff (any non-student, non-parent role) of the school. */
create or replace function public.is_staff_member(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_memberships m join public.roles r on r.id = m.role_id
    join public.profiles pr on pr.id = m.user_id and pr.status = 'active'
    where m.school_id = p_school and m.user_id = auth.uid() and m.status = 'active' and r.key not in ('student', 'parent')
  )
$$;

/** Caller may run teaching activities for this class + subject. */
create or replace function public.can_teach(p_school uuid, p_class uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_school_permission(p_school, 'classroom.manage')
      or (public.has_school_permission(p_school, 'classroom.teach') and public.teaches(p_school, p_class, p_subject))
$$;

/** Caller may manage the question bank for this subject (teaches it to any class, or manages classrooms). */
create or replace function public.can_teach_subject(p_school uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_school_permission(p_school, 'classroom.manage')
      or (public.has_school_permission(p_school, 'classroom.teach') and exists (
            select 1 from public.teacher_assignments ta where ta.school_id = p_school and ta.subject_id = p_subject and ta.staff_id = public.my_staff_id(p_school)))
$$;

create or replace function public.is_http_url(v text) returns boolean
language sql immutable set search_path = '' as $$ select v ~* '^https?://[^\s<>"]+$' $$;

-- -------------------------------------------------------------------------------------
-- Digital classroom
-- -------------------------------------------------------------------------------------
create table public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  class_id uuid not null,
  subject_id uuid not null,
  title text not null check (length(trim(title)) between 2 and 160),
  description text check (length(description) <= 2000),
  kind text not null check (kind in ('note', 'video', 'document', 'link')),
  body text check (length(body) <= 50000),
  url text check (url is null or public.is_http_url(url)),
  file_path text,
  is_published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade,
  check (body is not null or url is not null or file_path is not null)
);
create index learning_materials_class_idx on public.learning_materials (school_id, class_id, subject_id);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  class_id uuid,
  subject_id uuid,
  audience text not null default 'all' check (audience in ('all', 'staff', 'students')),
  title text not null check (length(trim(title)) between 2 and 160),
  body text not null check (length(body) between 1 and 5000),
  is_urgent boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade,
  check (subject_id is null or class_id is not null)
);
create index announcements_school_idx on public.announcements (school_id, created_at desc);

create table public.classroom_posts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  class_id uuid not null,
  subject_id uuid not null,
  parent_id uuid references public.classroom_posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 2000),
  is_hidden boolean not null default false,
  hidden_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade
);
create index classroom_posts_room_idx on public.classroom_posts (class_id, subject_id, created_at desc);

-- -------------------------------------------------------------------------------------
-- Assignments
-- -------------------------------------------------------------------------------------
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  class_id uuid not null,
  subject_id uuid not null,
  title text not null check (length(trim(title)) between 2 and 160),
  instructions text not null check (length(instructions) between 1 and 10000),
  due_at timestamptz not null,
  max_score numeric(6, 2) not null default 10 check (max_score > 0 and max_score <= 1000),
  allow_late boolean not null default false,
  is_published boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade
);
create index assignments_class_idx on public.assignments (school_id, class_id, due_at);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  assignment_id uuid not null,
  student_id uuid not null,
  body text check (length(body) <= 20000),
  file_path text,
  submitted_at timestamptz not null default now(),
  is_late boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'returned')),
  score numeric(6, 2) check (score >= 0),
  feedback text check (length(feedback) <= 5000),
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz,
  unique (assignment_id, student_id),
  foreign key (assignment_id, school_id) references public.assignments (id, school_id) on delete cascade,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);

-- -------------------------------------------------------------------------------------
-- Digital library
-- -------------------------------------------------------------------------------------
create table public.library_resources (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  title text not null check (length(trim(title)) between 2 and 200),
  author text check (length(author) <= 160),
  description text check (length(description) <= 2000),
  kind text not null check (kind in ('ebook', 'document', 'video', 'link', 'past_questions')),
  subject_id uuid,
  form_level smallint check (form_level between 1 and 6),
  url text check (url is null or public.is_http_url(url)),
  file_path text,
  -- Honest provenance: only resources the school holds a licence for may be marked official.
  source text not null default 'school' check (source in ('school', 'licensed_official', 'open_licence')),
  licence_note text check (length(licence_note) <= 300),
  audience text not null default 'all' check (audience in ('all', 'staff')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete set null (subject_id),
  check (url is not null or file_path is not null),
  check (source <> 'licensed_official' or licence_note is not null)
);
create index library_resources_school_idx on public.library_resources (school_id, subject_id);

-- -------------------------------------------------------------------------------------
-- Question bank and examinations
-- -------------------------------------------------------------------------------------
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  subject_id uuid not null,
  form_level smallint check (form_level between 1 and 6),
  topic text check (length(topic) <= 120),
  type text not null check (type in ('mcq', 'true_false', 'short_answer', 'essay')),
  prompt text not null check (length(trim(prompt)) between 3 and 5000),
  options jsonb, -- mcq: [{"id":"a","text":"..."}]
  answer jsonb,  -- mcq: {"correct":"a"} · true_false: {"correct":true} · short_answer: {"accepted":["..."]} · essay: {"guide":"..."}
  marks numeric(5, 2) not null default 1 check (marks > 0 and marks <= 100),
  difficulty text not null default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  -- Never label generated questions as official past questions (brief §16).
  source text not null default 'teacher' check (source in ('teacher', 'ai_generated', 'licensed_past_question')),
  source_note text check (length(source_note) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, school_id),
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade,
  check (source <> 'licensed_past_question' or source_note is not null),
  check (
    (type = 'mcq' and jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 8 and answer ? 'correct')
    or (type = 'true_false' and jsonb_typeof(answer -> 'correct') = 'boolean')
    or (type = 'short_answer' and jsonb_typeof(answer -> 'accepted') = 'array' and jsonb_array_length(answer -> 'accepted') >= 1)
    or (type = 'essay')
  )
);
create index questions_subject_idx on public.questions (school_id, subject_id);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  term_id uuid,
  class_id uuid not null,
  subject_id uuid not null,
  title text not null check (length(trim(title)) between 2 and 160),
  kind text not null default 'class_test' check (kind in ('class_test', 'mid_term', 'end_of_term', 'mock', 'wassce_practice')),
  instructions text check (length(instructions) <= 5000),
  duration_minutes smallint not null check (duration_minutes between 5 and 360),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  shuffle_questions boolean not null default true,
  is_published boolean not null default false,
  results_released boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at > opens_at),
  unique (id, school_id),
  foreign key (term_id, school_id) references public.academic_terms (id, school_id) on delete set null (term_id),
  foreign key (class_id, school_id) references public.school_classes (id, school_id) on delete cascade,
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete cascade
);
create index exams_class_idx on public.exams (school_id, class_id, opens_at);

create table public.exam_questions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  exam_id uuid not null,
  question_id uuid not null,
  position smallint not null,
  marks numeric(5, 2) not null check (marks > 0),
  unique (exam_id, question_id),
  unique (id, school_id),
  foreign key (exam_id, school_id) references public.exams (id, school_id) on delete cascade,
  foreign key (question_id, school_id) references public.questions (id, school_id) on delete restrict
);

create table public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  exam_id uuid not null,
  student_id uuid not null,
  started_at timestamptz not null default now(),
  deadline_at timestamptz not null,
  submitted_at timestamptz,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'marked')),
  auto_score numeric(7, 2),
  total_score numeric(7, 2),
  max_score numeric(7, 2),
  unique (exam_id, student_id),
  unique (id, school_id),
  foreign key (exam_id, school_id) references public.exams (id, school_id) on delete cascade,
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade
);

create table public.exam_answers (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  attempt_id uuid not null,
  exam_question_id uuid not null,
  response jsonb,
  is_correct boolean,
  awarded_marks numeric(5, 2),
  needs_marking boolean not null default false,
  feedback text check (length(feedback) <= 2000),
  updated_at timestamptz not null default now(),
  unique (attempt_id, exam_question_id),
  foreign key (attempt_id, school_id) references public.exam_attempts (id, school_id) on delete cascade,
  foreign key (exam_question_id, school_id) references public.exam_questions (id, school_id) on delete cascade
);

-- -------------------------------------------------------------------------------------
-- Triggers, RLS enablement
-- -------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['learning_materials','assignments','library_resources','questions','exams'] loop
    execute format('create trigger %1$s_updated_at before update on public.%1$s for each row execute function public.set_updated_at()', t);
  end loop;
  foreach t in array array['learning_materials','announcements','classroom_posts','assignments','assignment_submissions','library_resources',
                           'questions','exams','exam_questions','exam_attempts','exam_answers'] loop
    execute format('create trigger %1$s_school_lock before update on public.%1$s for each row execute function public.forbid_school_id_change()', t);
    execute format('alter table public.%1$s enable row level security', t);
    execute format('revoke all on public.%1$s from anon', t);
  end loop;
end $$;

create or replace function public.stamp_creator() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['learning_materials','announcements','assignments','library_resources','questions','exams'] loop
    execute format('create trigger %1$s_creator before insert on public.%1$s for each row execute function public.stamp_creator()', t);
  end loop;
end $$;

/** Questions in a published exam that has attempts are frozen (edits would change marked papers). */
create or replace function public.guard_question_edit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.exam_questions eq join public.exam_attempts a on a.exam_id = eq.exam_id where eq.question_id = old.id) then
    raise exception 'This question has been answered in an exam and can no longer be changed. Duplicate it instead.' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
create trigger questions_guard before update or delete on public.questions for each row execute function public.guard_question_edit();

/** Exam papers can't change once a student has started. */
create or replace function public.guard_exam_paper() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_exam uuid := coalesce(new.exam_id, old.exam_id);
begin
  if exists (select 1 from public.exam_attempts where exam_id = v_exam) then
    raise exception 'Students have already started this exam; its questions can no longer change.' using errcode = '55000';
  end if;
  return coalesce(new, old);
end $$;
create trigger exam_questions_guard before insert or update or delete on public.exam_questions for each row execute function public.guard_exam_paper();

-- -------------------------------------------------------------------------------------
-- RLS policies
-- -------------------------------------------------------------------------------------
create policy learning_materials_select on public.learning_materials for select to authenticated
  using (public.school_role_has(school_id, 'academics.read') or (is_published and public.student_in_class(class_id)));
create policy learning_materials_write on public.learning_materials for all to authenticated
  using (public.can_teach(school_id, class_id, subject_id)) with check (public.can_teach(school_id, class_id, subject_id));

create policy announcements_select on public.announcements for select to authenticated
  using (
    (class_id is null and public.is_school_member(school_id) and (
      audience = 'all' or (audience = 'staff' and public.is_staff_member(school_id)) or (audience = 'students' and (public.my_student_id(school_id) is not null or public.is_staff_member(school_id)))))
    or (class_id is not null and (public.school_role_has(school_id, 'academics.read') or public.student_in_class(class_id)))
  );
create or replace function public.can_announce(p_school uuid, p_class uuid, p_subject uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when p_class is null then public.has_school_permission(p_school, 'announcements.manage')
    when p_subject is not null then public.can_teach(p_school, p_class, p_subject)
    else public.has_school_permission(p_school, 'classroom.manage')
         or (public.has_school_permission(p_school, 'classroom.teach') and public.teaches(p_school, p_class))
  end
$$;
create policy announcements_write on public.announcements for all to authenticated
  using (public.can_announce(school_id, class_id, subject_id)) with check (public.can_announce(school_id, class_id, subject_id));

create policy classroom_posts_select on public.classroom_posts for select to authenticated
  using (public.can_teach(school_id, class_id, subject_id) or public.school_role_has(school_id, 'classroom.manage')
         or (public.student_in_class(class_id) and (not is_hidden or author_id = auth.uid())));
create policy classroom_posts_insert on public.classroom_posts for insert to authenticated
  with check (author_id = auth.uid() and not is_hidden and (public.student_in_class(class_id) or public.can_teach(school_id, class_id, subject_id)));
create policy classroom_posts_delete on public.classroom_posts for delete to authenticated
  using (author_id = auth.uid() or public.can_teach(school_id, class_id, subject_id));
revoke update on public.classroom_posts from authenticated; -- hiding goes through moderate_post()

create policy assignments_select on public.assignments for select to authenticated
  using (public.school_role_has(school_id, 'academics.read') or (is_published and public.student_in_class(class_id)));
create policy assignments_write on public.assignments for all to authenticated
  using (public.can_teach(school_id, class_id, subject_id)) with check (public.can_teach(school_id, class_id, subject_id));

create or replace function public.can_mark_assignment(p_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.assignments a where a.id = p_assignment and public.can_teach(a.school_id, a.class_id, a.subject_id))
$$;
create policy assignment_submissions_select on public.assignment_submissions for select to authenticated
  using (public.is_student_self(student_id) or public.can_mark_assignment(assignment_id) or public.school_role_has(school_id, 'results.read')
         or (public.is_guardian_of(student_id) and status = 'returned'));
revoke insert, update, delete on public.assignment_submissions from authenticated;

create policy library_resources_select on public.library_resources for select to authenticated
  using (public.is_school_member(school_id) and (audience = 'all' or public.is_staff_member(school_id)));
create policy library_resources_write on public.library_resources for all to authenticated
  using (public.has_school_permission(school_id, 'library.manage')) with check (public.has_school_permission(school_id, 'library.manage'));

create policy questions_select on public.questions for select to authenticated using (public.can_teach_subject(school_id, subject_id));
create policy questions_write on public.questions for all to authenticated
  using (public.can_teach_subject(school_id, subject_id)) with check (public.can_teach_subject(school_id, subject_id));

create policy exams_select on public.exams for select to authenticated
  using (public.school_role_has(school_id, 'academics.read') or (is_published and public.student_in_class(class_id)));
create policy exams_write on public.exams for all to authenticated
  using (public.can_teach(school_id, class_id, subject_id)) with check (public.can_teach(school_id, class_id, subject_id));

create or replace function public.can_run_exam(p_exam uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exams e where e.id = p_exam and public.can_teach(e.school_id, e.class_id, e.subject_id))
$$;
create policy exam_questions_select on public.exam_questions for select to authenticated using (public.can_run_exam(exam_id));
create policy exam_questions_write on public.exam_questions for all to authenticated using (public.can_run_exam(exam_id)) with check (public.can_run_exam(exam_id));

create policy exam_attempts_select on public.exam_attempts for select to authenticated
  using (public.is_student_self(student_id) or public.can_run_exam(exam_id));
revoke insert, update, delete on public.exam_attempts from authenticated;

create or replace function public.can_mark_attempt(p_attempt uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.exam_attempts a where a.id = p_attempt and public.can_run_exam(a.exam_id))
$$;
create policy exam_answers_select on public.exam_answers for select to authenticated using (public.can_mark_attempt(attempt_id));
revoke insert, update, delete on public.exam_answers from authenticated;

-- -------------------------------------------------------------------------------------
-- Storage: private classroom bucket
--   {school}/materials/{uuid}-{file}           teachers
--   {school}/library/{uuid}-{file}             library managers
--   {school}/submissions/{assignment}/{student}/{uuid}-{file}   the student
-- Reads are allowed only when a visible row references the exact object path.
-- -------------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('classroom', 'classroom', false, 10485760, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create or replace function public.can_upload_classroom_object(p_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := string_to_array(p_name, '/'); v_school uuid := public.try_uuid(v_parts[1]); v_assignment public.assignments;
begin
  if v_school is null or array_length(v_parts, 1) < 3 then return false; end if;
  if v_parts[2] = 'materials' then
    return public.has_school_permission(v_school, 'classroom.manage') or public.has_school_permission(v_school, 'classroom.teach');
  elsif v_parts[2] = 'library' then
    return public.has_school_permission(v_school, 'library.manage');
  elsif v_parts[2] = 'submissions' and array_length(v_parts, 1) = 5 then
    select * into v_assignment from public.assignments where id = public.try_uuid(v_parts[3]) and school_id = v_school;
    return found and v_assignment.is_published and public.student_in_class(v_assignment.class_id)
       and public.my_student_id(v_school) = public.try_uuid(v_parts[4]);
  end if;
  return false;
end $$;

create or replace function public.can_read_classroom_object(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.learning_materials m where m.file_path = p_name
                   and (public.school_role_has(m.school_id, 'academics.read') or (m.is_published and public.student_in_class(m.class_id))))
      or exists (select 1 from public.library_resources r where r.file_path = p_name
                   and public.is_school_member(r.school_id) and (r.audience = 'all' or public.is_staff_member(r.school_id)))
      or exists (select 1 from public.assignment_submissions s where s.file_path = p_name
                   and (public.is_student_self(s.student_id) or public.can_mark_assignment(s.assignment_id)))
$$;

create policy classroom_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'classroom' and public.can_upload_classroom_object(name));
create policy classroom_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'classroom' and public.can_read_classroom_object(name));

-- -------------------------------------------------------------------------------------
-- RPCs: assignments and discussion
-- -------------------------------------------------------------------------------------
/** A student submits (or resubmits, until marked) an assignment for their class. */
create or replace function public.submit_assignment(p_assignment uuid, p_body text, p_file_path text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_a public.assignments; v_student uuid; v_existing public.assignment_submissions; v_id uuid; v_late boolean;
begin
  select * into v_a from public.assignments where id = p_assignment;
  if not found or not v_a.is_published or not public.student_in_class(v_a.class_id) then raise exception 'assignment not available' using errcode = '42501'; end if;
  v_student := public.my_student_id(v_a.school_id);
  v_late := now() > v_a.due_at;
  if v_late and not v_a.allow_late then raise exception 'The deadline has passed' using errcode = 'P0001'; end if;
  if coalesce(trim(p_body), '') = '' and p_file_path is null then raise exception 'Write an answer or attach a file' using errcode = '22023'; end if;
  if p_file_path is not null and p_file_path not like v_a.school_id || '/submissions/' || v_a.id || '/' || v_student || '/%' then
    raise exception 'invalid file' using errcode = '42501';
  end if;
  select * into v_existing from public.assignment_submissions where assignment_id = p_assignment and student_id = v_student for update;
  if found and v_existing.status = 'returned' then raise exception 'This work has already been marked' using errcode = 'P0001'; end if;
  insert into public.assignment_submissions (school_id, assignment_id, student_id, body, file_path, submitted_at, is_late)
  values (v_a.school_id, p_assignment, v_student, nullif(trim(p_body), ''), p_file_path, now(), v_late)
  on conflict (assignment_id, student_id) do update set body = excluded.body, file_path = coalesce(excluded.file_path, public.assignment_submissions.file_path),
    submitted_at = now(), is_late = excluded.is_late
  returning id into v_id;
  return v_id;
end $$;

/** Teacher marks and returns a submission. */
create or replace function public.mark_submission(p_submission uuid, p_score numeric, p_feedback text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s public.assignment_submissions; v_max numeric;
begin
  select * into v_s from public.assignment_submissions where id = p_submission for update;
  if not found or not public.can_mark_assignment(v_s.assignment_id) then raise exception 'permission denied' using errcode = '42501'; end if;
  select max_score into v_max from public.assignments where id = v_s.assignment_id;
  if p_score is null or p_score < 0 or p_score > v_max then raise exception 'score must be between 0 and %', v_max using errcode = '22023'; end if;
  update public.assignment_submissions set score = p_score, feedback = nullif(trim(p_feedback), ''), status = 'returned', marked_by = auth.uid(), marked_at = now()
  where id = p_submission;
end $$;

create or replace function public.moderate_post(p_post uuid, p_hidden boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_p public.classroom_posts;
begin
  select * into v_p from public.classroom_posts where id = p_post;
  if not found or not public.can_teach(v_p.school_id, v_p.class_id, v_p.subject_id) then raise exception 'permission denied' using errcode = '42501'; end if;
  update public.classroom_posts set is_hidden = p_hidden, hidden_by = case when p_hidden then auth.uid() end where id = p_post;
  perform public._audit(auth.uid(), v_p.school_id, case when p_hidden then 'discussion.post_hidden' else 'discussion.post_restored' end, 'classroom_post', p_post::text, left(v_p.body, 120), '{}');
end $$;

/** Display names (first name + initial for students; title + surname for teachers) of a classroom's participants. */
create or replace function public.classroom_names(p_class uuid, p_subject uuid) returns table (user_id uuid, display_name text, is_teacher boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_school uuid;
begin
  select school_id into v_school from public.school_classes where id = p_class;
  if v_school is null or not (public.student_in_class(p_class) or public.can_teach(v_school, p_class, p_subject)) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return query
    select s.user_id, s.first_name || ' ' || left(s.last_name, 1) || '.', false from public.students s
    where s.class_id = p_class and s.user_id is not null
    union all
    select st.user_id, coalesce(st.title || ' ', '') || st.last_name, true from public.staff st
    join public.teacher_assignments ta on ta.staff_id = st.id and ta.class_id = p_class and ta.subject_id = p_subject
    where st.user_id is not null;
end $$;

-- -------------------------------------------------------------------------------------
-- RPCs: online examinations
-- -------------------------------------------------------------------------------------
/** Marks objective answers of an attempt and closes it. Essays are left for the teacher. */
create or replace function public._finalise_attempt(p_attempt uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_auto numeric; v_pending int; v_max numeric;
begin
  -- Ensure every question has an answer row (unanswered = 0 marks).
  insert into public.exam_answers (school_id, attempt_id, exam_question_id)
  select a.school_id, a.id, eq.id from public.exam_attempts a join public.exam_questions eq on eq.exam_id = a.exam_id
  where a.id = p_attempt on conflict do nothing;

  update public.exam_answers ans set
    is_correct = m.correct,
    awarded_marks = case when m.qtype = 'essay' then ans.awarded_marks when m.correct then m.marks else 0 end,
    needs_marking = (m.qtype = 'essay' and ans.response is not null and ans.awarded_marks is null)
  from (
    select ea.id, q.type as qtype, eq.marks,
      case q.type
        when 'mcq' then (ea.response ->> 'choice') = (q.answer ->> 'correct')
        when 'true_false' then (ea.response -> 'value') = (q.answer -> 'correct')
        when 'short_answer' then exists (select 1 from jsonb_array_elements_text(q.answer -> 'accepted') acc
                                         where lower(regexp_replace(trim(acc), '\s+', ' ', 'g')) = lower(regexp_replace(trim(coalesce(ea.response ->> 'text', '')), '\s+', ' ', 'g')))
        else null end as correct
    from public.exam_answers ea join public.exam_questions eq on eq.id = ea.exam_question_id join public.questions q on q.id = eq.question_id
    where ea.attempt_id = p_attempt
  ) m
  where ans.id = m.id;

  select coalesce(sum(awarded_marks), 0), count(*) filter (where needs_marking) into v_auto, v_pending from public.exam_answers where attempt_id = p_attempt;
  select coalesce(sum(eq.marks), 0) into v_max from public.exam_attempts a join public.exam_questions eq on eq.exam_id = a.exam_id where a.id = p_attempt;
  update public.exam_attempts set submitted_at = coalesce(submitted_at, least(now(), deadline_at)), auto_score = v_auto, total_score = v_auto, max_score = v_max,
    status = case when v_pending > 0 then 'submitted' else 'marked' end
  where id = p_attempt;
end $$;

/** Starts (or resumes) the caller's attempt at an open, published exam for their class. */
create or replace function public.start_exam(p_exam uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_e public.exams; v_student uuid; v_attempt public.exam_attempts; v_id uuid;
begin
  select * into v_e from public.exams where id = p_exam;
  if not found or not v_e.is_published or not public.student_in_class(v_e.class_id) then raise exception 'exam not available' using errcode = '42501'; end if;
  v_student := public.my_student_id(v_e.school_id);
  select * into v_attempt from public.exam_attempts where exam_id = p_exam and student_id = v_student;
  if found then
    if v_attempt.status = 'in_progress' and now() > v_attempt.deadline_at then perform public._finalise_attempt(v_attempt.id); end if;
    return v_attempt.id;
  end if;
  if now() < v_e.opens_at then raise exception 'This exam has not opened yet' using errcode = 'P0001'; end if;
  if now() > v_e.closes_at then raise exception 'This exam has closed' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.exam_questions where exam_id = p_exam) then raise exception 'This exam has no questions yet' using errcode = 'P0001'; end if;
  insert into public.exam_attempts (school_id, exam_id, student_id, deadline_at)
  values (v_e.school_id, p_exam, v_student, least(now() + make_interval(mins => v_e.duration_minutes), v_e.closes_at))
  returning id into v_id;
  return v_id;
end $$;

/** The question paper for the caller's own attempt — never includes answer keys. */
create or replace function public.exam_paper(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_a public.exam_attempts; v_e public.exams;
begin
  select * into v_a from public.exam_attempts where id = p_attempt;
  if not found or not public.is_student_self(v_a.student_id) then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_a.status = 'in_progress' and now() > v_a.deadline_at then perform public._finalise_attempt(p_attempt); select * into v_a from public.exam_attempts where id = p_attempt; end if;
  select * into v_e from public.exams where id = v_a.exam_id;
  return jsonb_build_object(
    'attempt_id', v_a.id, 'status', v_a.status, 'deadline_at', v_a.deadline_at, 'server_now', now(),
    'exam', jsonb_build_object('title', v_e.title, 'instructions', v_e.instructions, 'kind', v_e.kind),
    'questions', case when v_a.status <> 'in_progress' then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', eq.id, 'type', q.type, 'prompt', q.prompt, 'marks', eq.marks,
          'options', case when q.type = 'mcq' then (select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text')) from jsonb_array_elements(q.options) o) end,
          'source', q.source,
          'response', ans.response)
        order by case when v_e.shuffle_questions then md5(p_attempt::text || eq.id::text) else lpad(eq.position::text, 5, '0') end)
      from public.exam_questions eq join public.questions q on q.id = eq.question_id
      left join public.exam_answers ans on ans.attempt_id = p_attempt and ans.exam_question_id = eq.id
      where eq.exam_id = v_e.id), '[]'::jsonb) end
  );
end $$;

create or replace function public.save_exam_answer(p_attempt uuid, p_exam_question uuid, p_response jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare v_a public.exam_attempts;
begin
  select * into v_a from public.exam_attempts where id = p_attempt;
  if not found or not public.is_student_self(v_a.student_id) then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_a.status <> 'in_progress' then raise exception 'This attempt has been submitted' using errcode = 'P0001'; end if;
  if now() > v_a.deadline_at + interval '30 seconds' then perform public._finalise_attempt(p_attempt); raise exception 'Time is up — your answers were submitted' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.exam_questions where id = p_exam_question and exam_id = v_a.exam_id) then raise exception 'invalid question' using errcode = '22023'; end if;
  if length(p_response::text) > 20000 then raise exception 'answer too long' using errcode = '22023'; end if;
  insert into public.exam_answers (school_id, attempt_id, exam_question_id, response) values (v_a.school_id, p_attempt, p_exam_question, p_response)
  on conflict (attempt_id, exam_question_id) do update set response = excluded.response, updated_at = now();
end $$;

create or replace function public.submit_exam(p_attempt uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_a public.exam_attempts;
begin
  select * into v_a from public.exam_attempts where id = p_attempt for update;
  if not found or not public.is_student_self(v_a.student_id) then raise exception 'permission denied' using errcode = '42501'; end if;
  if v_a.status <> 'in_progress' then return; end if;
  perform public._finalise_attempt(p_attempt);
end $$;

/** Teacher closes attempts whose time has run out (students who left without submitting). */
create or replace function public.finalise_expired_attempts(p_exam uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare r record; v_n integer := 0;
begin
  if not public.can_run_exam(p_exam) then raise exception 'permission denied' using errcode = '42501'; end if;
  for r in select id from public.exam_attempts where exam_id = p_exam and status = 'in_progress' and now() > deadline_at loop
    perform public._finalise_attempt(r.id); v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

/** Teacher marks a written answer (marks within the question's allocation). */
create or replace function public.mark_exam_answer(p_answer uuid, p_marks numeric, p_feedback text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ans public.exam_answers; v_max numeric; v_pending int;
begin
  select * into v_ans from public.exam_answers where id = p_answer for update;
  if not found or not public.can_mark_attempt(v_ans.attempt_id) then raise exception 'permission denied' using errcode = '42501'; end if;
  if (select status from public.exam_attempts where id = v_ans.attempt_id) = 'in_progress' then raise exception 'The student has not submitted yet' using errcode = 'P0001'; end if;
  select marks into v_max from public.exam_questions where id = v_ans.exam_question_id;
  if p_marks is null or p_marks < 0 or p_marks > v_max then raise exception 'marks must be between 0 and %', v_max using errcode = '22023'; end if;
  update public.exam_answers set awarded_marks = p_marks, needs_marking = false, feedback = nullif(trim(p_feedback), ''), updated_at = now() where id = p_answer;
  select count(*) filter (where needs_marking) into v_pending from public.exam_answers where attempt_id = v_ans.attempt_id;
  update public.exam_attempts set total_score = (select coalesce(sum(awarded_marks), 0) from public.exam_answers where attempt_id = v_ans.attempt_id),
    status = case when v_pending = 0 then 'marked' else 'submitted' end
  where id = v_ans.attempt_id;
end $$;

create or replace function public.release_exam_results(p_exam uuid, p_release boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_e public.exams;
begin
  select * into v_e from public.exams where id = p_exam;
  if not found or not public.can_run_exam(p_exam) then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_release and exists (select 1 from public.exam_attempts where exam_id = p_exam and status <> 'marked') then
    raise exception 'Finish marking every submitted script first' using errcode = 'P0001';
  end if;
  update public.exams set results_released = p_release where id = p_exam;
  perform public._audit(auth.uid(), v_e.school_id, case when p_release then 'exam.results_released' else 'exam.results_withdrawn' end, 'exam', p_exam::text, v_e.title, '{}');
end $$;

/** After release, a student reviews their own marked paper with correct answers and feedback. */
create or replace function public.exam_review(p_attempt uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_a public.exam_attempts; v_e public.exams;
begin
  select * into v_a from public.exam_attempts where id = p_attempt;
  if not found or not (public.is_student_self(v_a.student_id) or public.is_guardian_of(v_a.student_id)) then raise exception 'permission denied' using errcode = '42501'; end if;
  select * into v_e from public.exams where id = v_a.exam_id;
  if not v_e.results_released then raise exception 'Results have not been released yet' using errcode = 'P0001'; end if;
  return jsonb_build_object(
    'exam', jsonb_build_object('title', v_e.title), 'total_score', v_a.total_score, 'max_score', v_a.max_score,
    'questions', coalesce((select jsonb_agg(jsonb_build_object(
        'type', q.type, 'prompt', q.prompt, 'marks', eq.marks, 'options', q.options, 'answer', case when q.type = 'essay' then null else q.answer end,
        'source', q.source, 'response', ans.response, 'awarded_marks', ans.awarded_marks, 'is_correct', ans.is_correct, 'feedback', ans.feedback)
      order by eq.position)
      from public.exam_questions eq join public.questions q on q.id = eq.question_id
      left join public.exam_answers ans on ans.attempt_id = p_attempt and ans.exam_question_id = eq.id
      where eq.exam_id = v_e.id), '[]'::jsonb)
  );
end $$;

/** Copies marked exam totals into the Phase 2 results as an assessment (scored out of the exam maximum). */
create or replace function public.record_exam_in_results(p_exam uuid, p_weight numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_e public.exams; v_max numeric; v_assessment uuid;
begin
  select * into v_e from public.exams where id = p_exam;
  if not found or not public.can_run_exam(p_exam) then raise exception 'permission denied' using errcode = '42501'; end if;
  if not (public.has_school_permission(v_e.school_id, 'assessments.manage')
          or (public.has_school_permission(v_e.school_id, 'assessments.record') and public.teaches(v_e.school_id, v_e.class_id, v_e.subject_id))) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  if v_e.term_id is null then raise exception 'Set the exam''s term first' using errcode = 'P0001'; end if;
  if p_weight is null or p_weight <= 0 or p_weight > 100 then raise exception 'weight must be between 0 and 100' using errcode = '22023'; end if;
  if exists (select 1 from public.exam_attempts where exam_id = p_exam and status <> 'marked') then raise exception 'Finish marking every submitted script first' using errcode = 'P0001'; end if;
  select coalesce(sum(marks), 0) into v_max from public.exam_questions where exam_id = p_exam;
  if v_max = 0 then raise exception 'This exam has no questions' using errcode = 'P0001'; end if;

  insert into public.assessments (school_id, term_id, class_id, subject_id, name, kind, max_score, weight, assessed_on, created_by)
  values (v_e.school_id, v_e.term_id, v_e.class_id, v_e.subject_id, left(v_e.title, 80),
          case v_e.kind when 'class_test' then 'class_test' when 'mid_term' then 'mid_term' when 'end_of_term' then 'end_of_term' else 'mock' end,
          v_max, p_weight, v_e.opens_at::date, auth.uid())
  returning id into v_assessment;
  insert into public.assessment_scores (school_id, assessment_id, student_id, score, entered_by)
  select v_e.school_id, v_assessment, a.student_id, a.total_score, auth.uid()
  from public.exam_attempts a join public.students s on s.id = a.student_id and s.class_id = v_e.class_id
  where a.exam_id = p_exam and a.status = 'marked';
  perform public._audit(auth.uid(), v_e.school_id, 'exam.recorded_in_results', 'exam', p_exam::text, v_e.title, jsonb_build_object('assessment', v_assessment));
  return v_assessment;
end $$;

/** A student's (or linked guardian's) published assessment scores for a term, per subject. */
create or replace function public.student_term_results(p_student uuid, p_term uuid)
returns table (subject_id uuid, subject_name text, assessment_name text, kind text, max_score numeric, weight numeric, score numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_s public.students;
begin
  select * into v_s from public.students where id = p_student;
  if not found or not (public.is_student_self(p_student) or public.is_guardian_of(p_student)) then raise exception 'permission denied' using errcode = '42501'; end if;
  if not public.results_published(p_term, v_s.class_id) then return; end if;
  return query
    select a.subject_id, sub.name, a.name, a.kind, a.max_score, a.weight, sc.score
    from public.assessments a
    join public.school_subjects sub on sub.id = a.subject_id
    left join public.assessment_scores sc on sc.assessment_id = a.id and sc.student_id = p_student
    where a.term_id = p_term and a.class_id = v_s.class_id
    order by sub.name, a.created_at;
end $$;

/** Terms whose results have been published for the student's current class. */
create or replace function public.student_published_terms(p_student uuid)
returns table (term_id uuid, term_name text, year_name text, published_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare v_s public.students;
begin
  select * into v_s from public.students where id = p_student;
  if not found or not (public.is_student_self(p_student) or public.is_guardian_of(p_student)) then raise exception 'permission denied' using errcode = '42501'; end if;
  return query
    select t.id, t.name, y.name, rp.published_at from public.result_publications rp
    join public.academic_terms t on t.id = rp.term_id join public.academic_years y on y.id = t.academic_year_id
    where rp.class_id = v_s.class_id order by t.starts_on desc;
end $$;

revoke execute on function public._finalise_attempt(uuid) from public, anon, authenticated;
revoke execute on function public.student_term_results(uuid, uuid), public.student_published_terms(uuid), public.classroom_names(uuid, uuid), public.submit_assignment(uuid, text, text), public.mark_submission(uuid, numeric, text), public.moderate_post(uuid, boolean),
  public.start_exam(uuid), public.exam_paper(uuid), public.save_exam_answer(uuid, uuid, jsonb), public.submit_exam(uuid),
  public.finalise_expired_attempts(uuid), public.mark_exam_answer(uuid, numeric, text), public.release_exam_results(uuid, boolean),
  public.exam_review(uuid), public.record_exam_in_results(uuid, numeric) from public, anon;
