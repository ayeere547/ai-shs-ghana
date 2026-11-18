-- =====================================================================================
-- AI SHS Ghana — Phase 4: AI intelligence
-- Curriculum knowledge base (pgvector RAG), AI usage + quotas, AI tutor conversations
-- with safeguarding flags, teacher-assistant drafts, human-approved report comments,
-- and rule-based learning insights.
--
-- Trust boundary: tutor messages and usage logs are written ONLY by the server (service
-- role) after it has authenticated the user, moderated the input and called the model.
-- Users can read their own data; they cannot forge assistant replies, clear safety flags
-- or inflate/deflate usage.
-- =====================================================================================

create extension if not exists vector with schema extensions;

-- -------------------------------------------------------------------------------------
-- Permissions
-- -------------------------------------------------------------------------------------
insert into public.permissions (key, scope, description) values
  ('ai.tutor',          'school',   'Use the AI tutor'),
  ('ai.teacher_tools',  'school',   'Use AI lesson, notes, question, marking and report assistants'),
  ('knowledge.manage',  'school',   'Manage the school''s curriculum knowledge base'),
  ('ai.safeguarding',   'school',   'Review AI tutor messages flagged for safeguarding'),
  ('ai.settings',       'school',   'Turn AI features on or off and view AI usage'),
  ('content.manage',    'platform', 'Manage platform-wide curriculum knowledge'),
  ('ai.limits.manage',  'platform', 'Set schools'' AI usage limits');

insert into public.role_permissions (role_id, permission_key)
select r.id, p.key from public.roles r join public.permissions p on p.scope = r.scope
where p.key in ('ai.tutor','ai.teacher_tools','knowledge.manage','ai.safeguarding','ai.settings','content.manage','ai.limits.manage')
  and (
    (r.key = 'super_admin')
    or (r.key in ('headteacher', 'school_admin') and p.key in ('ai.teacher_tools', 'knowledge.manage', 'ai.safeguarding', 'ai.settings'))
    or (r.key, p.key) in (
      ('assistant_headteacher','ai.teacher_tools'), ('assistant_headteacher','knowledge.manage'), ('assistant_headteacher','ai.safeguarding'),
      ('academic_admin','ai.teacher_tools'), ('academic_admin','knowledge.manage'),
      ('exam_officer','ai.teacher_tools'), ('head_of_department','ai.teacher_tools'), ('head_of_department','knowledge.manage'),
      ('teacher','ai.teacher_tools'), ('counsellor','ai.safeguarding'),
      ('student','ai.tutor'),
      ('platform_admin','content.manage'), ('platform_admin','ai.limits.manage'), ('finance_admin','ai.limits.manage')
    )
  )
on conflict do nothing;

-- -------------------------------------------------------------------------------------
-- Per-school AI settings
-- -------------------------------------------------------------------------------------
create table public.ai_settings (
  school_id uuid primary key references public.schools (id) on delete cascade,
  tutor_enabled boolean not null default true,
  teacher_tools_enabled boolean not null default true,
  student_daily_messages smallint not null default 40 check (student_daily_messages between 0 and 500),
  request_limit_override integer check (request_limit_override >= 0), -- set by platform staff only
  updated_at timestamptz not null default now()
);
insert into public.ai_settings (school_id) select id from public.schools on conflict do nothing;

create or replace function public.create_ai_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ai_settings (school_id) values (new.id) on conflict do nothing;
  return new;
end $$;
create trigger schools_ai_settings after insert on public.schools for each row execute function public.create_ai_settings();
create trigger ai_settings_updated_at before update on public.ai_settings for each row execute function public.set_updated_at();

alter table public.ai_settings enable row level security;
create policy ai_settings_select on public.ai_settings for select to authenticated
  using (public.is_school_member(school_id) or public.has_platform_permission('ai.limits.manage'));
create policy ai_settings_update on public.ai_settings for update to authenticated
  using (public.has_school_permission(school_id, 'ai.settings')) with check (public.has_school_permission(school_id, 'ai.settings'));
revoke all on public.ai_settings from anon, authenticated;
grant select on public.ai_settings to authenticated;
grant update (tutor_enabled, teacher_tools_enabled, student_daily_messages) on public.ai_settings to authenticated;

-- -------------------------------------------------------------------------------------
-- AI usage (written by the server only)
-- -------------------------------------------------------------------------------------
create table public.ai_usage_logs (
  id bigint generated always as identity primary key,
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  feature text not null check (feature in ('tutor', 'lesson_plan', 'notes', 'questions', 'marking', 'report_comment', 'insights', 'embedding', 'moderation')),
  model text not null,
  prompt_version text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_usd numeric(12, 6) not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error', 'blocked')),
  created_at timestamptz not null default now()
);
create index ai_usage_logs_school_idx on public.ai_usage_logs (school_id, created_at desc);
create index ai_usage_logs_user_idx on public.ai_usage_logs (user_id, created_at desc);

alter table public.ai_usage_logs enable row level security;
create policy ai_usage_logs_select on public.ai_usage_logs for select to authenticated
  using (user_id = auth.uid() or public.school_role_has(school_id, 'ai.settings'));
revoke all on public.ai_usage_logs from anon, authenticated;
grant select on public.ai_usage_logs to authenticated;

/** Billable requests exclude embeddings and moderation calls. */
create or replace function public._ai_requests_this_month(p_school uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.ai_usage_logs
  where school_id = p_school and status = 'ok' and feature not in ('embedding', 'moderation')
    and created_at >= date_trunc('month', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra'
$$;

/** Quota and switches for the caller in one school. limit = null means unlimited. */
create or replace function public.ai_quota(p_school uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_settings public.ai_settings; v_limit integer; v_plan_limit text;
begin
  if not public.is_school_member(p_school) then raise exception 'permission denied' using errcode = '42501'; end if;
  select * into v_settings from public.ai_settings where school_id = p_school;
  select p.limits ->> 'ai_requests_per_month' into v_plan_limit
  from public.subscriptions s join public.subscription_plans p on p.id = s.plan_id
  where s.school_id = p_school and s.status in ('trialing', 'active', 'grace');
  v_limit := case
    when v_settings.request_limit_override is not null then v_settings.request_limit_override
    when not exists (select 1 from public.subscriptions where school_id = p_school and status in ('trialing', 'active', 'grace')) then 0
    else v_plan_limit::int end; -- null plan limit = unlimited
  return jsonb_build_object(
    'tutor_enabled', coalesce(v_settings.tutor_enabled, false),
    'teacher_tools_enabled', coalesce(v_settings.teacher_tools_enabled, false),
    'limit', v_limit,
    'used', public._ai_requests_this_month(p_school),
    'student_daily_limit', coalesce(v_settings.student_daily_messages, 0),
    'my_tutor_messages_today', (select count(*) from public.ai_usage_logs where school_id = p_school and user_id = auth.uid() and feature = 'tutor' and status = 'ok'
                                 and created_at >= date_trunc('day', now() at time zone 'Africa/Accra') at time zone 'Africa/Accra')
  );
end $$;

/** Platform staff set a school's monthly AI request allowance (null = use the plan's). */
create or replace function public.set_ai_limit(p_school uuid, p_limit integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_platform_permission('ai.limits.manage') then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_limit is not null and p_limit < 0 then raise exception 'limit must be 0 or more' using errcode = '22023'; end if;
  update public.ai_settings set request_limit_override = p_limit where school_id = p_school;
  perform public._audit(auth.uid(), p_school, 'ai.limit_set', 'school', p_school::text, coalesce('AI limit ' || p_limit || ' requests/month', 'AI limit reset to plan'), '{}');
end $$;

/** Aggregated AI usage across schools for the platform console (no user-level data). */
create or replace function public.platform_ai_usage() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.has_platform_permission('analytics.national') or public.has_platform_permission('ai.limits.manage')) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'by_feature', coalesce((select jsonb_agg(jsonb_build_object('feature', feature, 'requests', n, 'tokens', t, 'cost_usd', c) order by n desc) from (
        select feature, count(*) n, sum(input_tokens + output_tokens) t, round(sum(cost_usd), 4) c from public.ai_usage_logs
        where created_at >= date_trunc('month', now()) group by feature) f), '[]'),
    'by_school', coalesce((select jsonb_agg(jsonb_build_object('school_id', s.id, 'school', s.name, 'requests', u.n, 'cost_usd', u.c, 'limit_override', st.request_limit_override) order by u.n desc) from (
        select school_id, count(*) filter (where feature not in ('embedding','moderation')) n, round(sum(cost_usd), 4) c from public.ai_usage_logs
        where created_at >= date_trunc('month', now()) group by school_id) u
        join public.schools s on s.id = u.school_id left join public.ai_settings st on st.school_id = s.id), '[]'),
    'blocked_this_month', (select count(*) from public.ai_usage_logs where status = 'blocked' and created_at >= date_trunc('month', now()))
  );
end $$;

-- -------------------------------------------------------------------------------------
-- Knowledge base (RAG)
-- -------------------------------------------------------------------------------------
create table public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  school_id uuid references public.schools (id) on delete cascade, -- null = platform-wide approved content
  title text not null check (length(trim(title)) between 2 and 200),
  subject_name text check (length(subject_name) <= 80),
  form_level smallint check (form_level between 1 and 6),
  source_type text not null default 'teacher_notes' check (source_type in ('curriculum', 'teacher_notes', 'textbook', 'past_questions', 'other')),
  is_official boolean not null default false,
  licence_note text check (length(licence_note) <= 300),
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  chunk_count integer not null default 0,
  embedded boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (not is_official or licence_note is not null)
);
create index knowledge_documents_school_idx on public.knowledge_documents (school_id);

create table public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.knowledge_documents (id) on delete cascade,
  school_id uuid references public.schools (id) on delete cascade,
  chunk_index integer not null,
  heading text,
  content text not null check (length(content) between 1 and 8000),
  embedding extensions.vector(1536),
  tsv tsvector generated always as (to_tsvector('english', coalesce(heading, '') || ' ' || content)) stored,
  unique (document_id, chunk_index)
);
create index knowledge_chunks_doc_idx on public.knowledge_chunks (document_id);
create index knowledge_chunks_tsv_idx on public.knowledge_chunks using gin (tsv);
create index knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding extensions.vector_cosine_ops);

/** Caller belongs to an active school (platform knowledge is available to every active school). */
create or replace function public.has_active_membership() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.school_memberships m join public.schools s on s.id = m.school_id and s.status = 'active'
    join public.profiles p on p.id = m.user_id and p.status = 'active'
    where m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function public.can_read_knowledge(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_school is null then public.has_active_membership() or public.has_platform_permission('content.manage')
              else public.is_school_member(p_school) end
$$;

create or replace function public.can_manage_knowledge(p_school uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_school is null then public.has_platform_permission('content.manage')
              else public.has_school_permission(p_school, 'knowledge.manage') end
$$;

alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
create policy knowledge_documents_select on public.knowledge_documents for select to authenticated using (public.can_read_knowledge(school_id));
create policy knowledge_documents_write on public.knowledge_documents for all to authenticated
  using (public.can_manage_knowledge(school_id)) with check (public.can_manage_knowledge(school_id) and (school_id is not null or not is_official or licence_note is not null));
create policy knowledge_chunks_select on public.knowledge_chunks for select to authenticated using (public.can_read_knowledge(school_id));
create policy knowledge_chunks_write on public.knowledge_chunks for all to authenticated
  using (public.can_manage_knowledge(school_id))
  with check (public.can_manage_knowledge(school_id) and exists (select 1 from public.knowledge_documents d where d.id = document_id and d.school_id is not distinct from knowledge_chunks.school_id));
revoke all on public.knowledge_documents, public.knowledge_chunks from anon;
create trigger knowledge_documents_creator before insert on public.knowledge_documents for each row execute function public.stamp_creator();
create trigger knowledge_documents_school_lock before update on public.knowledge_documents for each row execute function public.forbid_school_id_change();
create trigger knowledge_chunks_school_lock before update on public.knowledge_chunks for each row execute function public.forbid_school_id_change();

/**
 * Retrieval for one school: its own documents plus platform-wide ones, optionally filtered by
 * subject. Uses vector similarity when an embedding is given, otherwise full-text ranking.
 * SECURITY INVOKER — row-level security still decides which chunks are visible.
 */
create or replace function public.match_knowledge(p_school uuid, p_embedding extensions.vector(1536), p_query text, p_subject text default null, p_limit int default 5)
returns table (chunk_id uuid, document_id uuid, title text, heading text, content text, source_type text, is_official boolean, school_wide boolean, score double precision)
language sql stable security invoker set search_path = '' as $$
  select c.id, d.id, d.title, c.heading, c.content, d.source_type, d.is_official, d.school_id is null,
         case when p_embedding is not null then 1 - (c.embedding operator(extensions.<=>) p_embedding)
              else ts_rank(c.tsv, websearch_to_tsquery('english', coalesce(p_query, ''))) end as score
  from public.knowledge_chunks c
  join public.knowledge_documents d on d.id = c.document_id and d.status = 'ready'
  where (d.school_id = p_school or d.school_id is null)
    and (p_subject is null or d.subject_name is null or d.subject_name ilike p_subject)
    and (case when p_embedding is not null then c.embedding is not null
              else c.tsv @@ websearch_to_tsquery('english', coalesce(p_query, '')) end)
  order by case when p_embedding is not null then c.embedding operator(extensions.<=>) p_embedding end asc nulls last,
           case when p_embedding is null then ts_rank(c.tsv, websearch_to_tsquery('english', coalesce(p_query, ''))) end desc nulls last
  limit least(greatest(coalesce(p_limit, 5), 1), 20)
$$;

-- -------------------------------------------------------------------------------------
-- AI tutor
-- -------------------------------------------------------------------------------------
create table public.ai_tutor_conversations (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  subject_id uuid,
  title text not null default 'New conversation' check (length(title) <= 120),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  foreign key (subject_id, school_id) references public.school_subjects (id, school_id) on delete set null (subject_id)
);
create index ai_tutor_conversations_user_idx on public.ai_tutor_conversations (user_id, last_message_at desc);

create table public.ai_tutor_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_tutor_conversations (id) on delete cascade,
  school_id uuid not null references public.schools (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) <= 20000),
  citations jsonb not null default '[]',
  flagged boolean not null default false,
  flag_reason text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index ai_tutor_messages_conv_idx on public.ai_tutor_messages (conversation_id, created_at);
create index ai_tutor_messages_flagged_idx on public.ai_tutor_messages (school_id) where flagged and reviewed_at is null;

create or replace function public.conversation_has_flags(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ai_tutor_messages where conversation_id = p_conversation and flagged)
$$;

alter table public.ai_tutor_conversations enable row level security;
alter table public.ai_tutor_messages enable row level security;
create policy ai_tutor_conversations_select on public.ai_tutor_conversations for select to authenticated
  using ((user_id = auth.uid() and public.is_school_member(school_id))
         or (public.school_role_has(school_id, 'ai.safeguarding') and public.conversation_has_flags(id)));
create policy ai_tutor_conversations_insert on public.ai_tutor_conversations for insert to authenticated
  with check (user_id = auth.uid() and public.has_school_permission(school_id, 'ai.tutor'));
create policy ai_tutor_conversations_delete on public.ai_tutor_conversations for delete to authenticated using (user_id = auth.uid());
revoke update on public.ai_tutor_conversations from authenticated;
grant update (title) on public.ai_tutor_conversations to authenticated;
create policy ai_tutor_conversations_rename on public.ai_tutor_conversations for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.owns_conversation(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.ai_tutor_conversations c where c.id = p_conversation and c.user_id = auth.uid() and public.is_school_member(c.school_id))
$$;
create policy ai_tutor_messages_select on public.ai_tutor_messages for select to authenticated
  using (public.owns_conversation(conversation_id) or (flagged and public.school_role_has(school_id, 'ai.safeguarding')));
revoke insert, update, delete on public.ai_tutor_messages from authenticated, anon;

/** Safeguarding staff mark a flagged message as reviewed (audited). */
create or replace function public.review_flagged_message(p_message uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_m public.ai_tutor_messages;
begin
  select * into v_m from public.ai_tutor_messages where id = p_message;
  if not found or not v_m.flagged or not public.has_school_permission(v_m.school_id, 'ai.safeguarding') then raise exception 'permission denied' using errcode = '42501'; end if;
  update public.ai_tutor_messages set reviewed_by = auth.uid(), reviewed_at = now() where id = p_message;
  perform public._audit(auth.uid(), v_m.school_id, 'ai.flag_reviewed', 'ai_tutor_message', p_message::text, 'Flagged tutor message reviewed', '{}');
end $$;

-- -------------------------------------------------------------------------------------
-- Teacher assistant drafts and report comments
-- -------------------------------------------------------------------------------------
create table public.ai_drafts (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('lesson_plan', 'notes', 'questions', 'report_comment', 'insights')),
  title text not null check (length(title) <= 200),
  input jsonb not null default '{}',
  output jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'used', 'discarded')),
  created_at timestamptz not null default now()
);
create index ai_drafts_user_idx on public.ai_drafts (user_id, created_at desc);
alter table public.ai_drafts enable row level security;
create policy ai_drafts_own on public.ai_drafts for all to authenticated
  using (user_id = auth.uid() and public.is_school_member(school_id))
  with check (user_id = auth.uid() and public.has_school_permission(school_id, 'ai.teacher_tools'));
revoke all on public.ai_drafts from anon;

create table public.report_comments (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools (id) on delete cascade,
  student_id uuid not null,
  term_id uuid not null,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  comment text not null check (length(trim(comment)) between 3 and 1500),
  ai_assisted boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'approved')),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, term_id, author_id),
  foreign key (student_id, school_id) references public.students (id, school_id) on delete cascade,
  foreign key (term_id, school_id) references public.academic_terms (id, school_id) on delete cascade
);
create trigger report_comments_updated_at before update on public.report_comments for each row execute function public.set_updated_at();
create trigger report_comments_school_lock before update on public.report_comments for each row execute function public.forbid_school_id_change();

/** Approval is stamped by the database, and editing an approved comment returns it to draft. */
create or replace function public.report_comment_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.status = 'approved' and new.comment <> old.comment then
    new.status := 'draft';
  end if;
  if new.status = 'approved' then
    if tg_op = 'INSERT' then new.approved_at := now();
    elsif old.status <> 'approved' then new.approved_at := now();
    end if;
  else
    new.approved_at := null;
  end if;
  return new;
end $$;
create trigger report_comments_status before insert or update on public.report_comments for each row execute function public.report_comment_status();

create or replace function public.can_comment_on(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s where s.id = p_student and (
      public.has_school_permission(s.school_id, 'results.publish') or public.has_school_permission(s.school_id, 'assessments.manage')
      or (public.has_school_permission(s.school_id, 'assessments.record') and public.teaches(s.school_id, s.class_id))
    )
  )
$$;

alter table public.report_comments enable row level security;
create policy report_comments_select on public.report_comments for select to authenticated
  using (author_id = auth.uid() or public.school_role_has(school_id, 'results.read')
         or (status = 'approved' and (public.is_student_self(student_id) or public.is_guardian_of(student_id))
             and exists (select 1 from public.students s where s.id = student_id and public.results_published(term_id, s.class_id))));
create policy report_comments_write on public.report_comments for all to authenticated
  using (author_id = auth.uid() and public.can_comment_on(student_id))
  with check (author_id = auth.uid() and public.can_comment_on(student_id));
revoke all on public.report_comments from anon;

-- -------------------------------------------------------------------------------------
-- Learning insights (rule-based; supports human follow-up, never automatic decisions)
-- -------------------------------------------------------------------------------------
create or replace function public.class_insights(p_class uuid, p_term uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_school uuid; v_term public.academic_terms; v_from date; v_to date;
begin
  select school_id into v_school from public.school_classes where id = p_class;
  select * into v_term from public.academic_terms where id = p_term and school_id = v_school;
  if v_school is null or v_term.id is null then raise exception 'class or term not found' using errcode = 'P0002'; end if;
  if not (public.school_role_has(v_school, 'results.read') or public.school_role_has(v_school, 'assessments.manage') or public.teaches(v_school, p_class)) then
    raise exception 'permission denied' using errcode = '42501';
  end if;
  v_from := v_term.starts_on; v_to := least(v_term.ends_on, current_date);

  return (
    with st as (
      select id, first_name || ' ' || last_name as name from public.students where class_id = p_class and status = 'active'
    ),
    subj as (
      select s.id as student_id, a.subject_id,
             sum(sc.score / a.max_score * a.weight) / nullif(sum(a.weight) filter (where sc.score is not null), 0) * 100 as pct
      from st s
      join public.assessments a on a.class_id = p_class and a.term_id = p_term
      left join public.assessment_scores sc on sc.assessment_id = a.id and sc.student_id = s.id
      group by s.id, a.subject_id
    ),
    avg_st as (select student_id, avg(pct) as average, (array_agg(subject_id order by pct asc nulls last))[1] as weakest from subj where pct is not null group by student_id),
    att as (
      select s.id as student_id, count(a.*) as days, count(a.*) filter (where a.status in ('present', 'late')) as here
      from st s left join public.attendance a on a.student_id = s.id and a.attendance_date between v_from and v_to
      group by s.id
    ),
    miss as (
      select s.id as student_id, count(asg.*) filter (where sub.id is null) as missing
      from st s
      left join public.assignments asg on asg.class_id = p_class and asg.is_published and asg.due_at < now() and asg.due_at::date >= v_from
      left join public.assignment_submissions sub on sub.assignment_id = asg.id and sub.student_id = s.id
      group by s.id
    ),
    rows as (
      select s.id, s.name, round(av.average::numeric, 1) as average, av.weakest,
             case when att.days > 0 then round(att.here * 100.0 / att.days) end as attendance_rate,
             coalesce(m.missing, 0) as missing
      from st s left join avg_st av on av.student_id = s.id left join att on att.student_id = s.id left join miss m on m.student_id = s.id
    ),
    topic as (
      select q.topic, sub.name as subject, count(*) as answers,
             round(avg(case when ea.awarded_marks is null then 0 else ea.awarded_marks / eq.marks end) * 100) as success
      from public.exam_answers ea
      join public.exam_attempts xa on xa.id = ea.attempt_id and xa.status <> 'in_progress'
      join public.exams e on e.id = xa.exam_id and e.class_id = p_class and (e.term_id = p_term or e.term_id is null)
      join public.exam_questions eq on eq.id = ea.exam_question_id
      join public.questions q on q.id = eq.question_id and q.topic is not null
      join public.school_subjects sub on sub.id = q.subject_id
      group by q.topic, sub.name having count(*) >= 3
    )
    select jsonb_build_object(
      'students', coalesce((select jsonb_agg(jsonb_build_object(
          'student_id', r.id, 'name', r.name, 'average', r.average, 'attendance_rate', r.attendance_rate, 'missing_assignments', r.missing,
          'weakest_subject', (select name from public.school_subjects where id = r.weakest),
          'flags', to_jsonb(array_remove(array[
             case when r.average < 50 then 'low_average' end,
             case when r.attendance_rate < 80 then 'low_attendance' end,
             case when r.missing >= 3 then 'missing_work' end], null)))
        order by (r.average is null), r.average asc) from rows r), '[]'),
      'subjects', coalesce((select jsonb_agg(jsonb_build_object('subject', g.name, 'class_average', g.average, 'below_50', g.below, 'students', g.n) order by g.average)
          from (select sub.name, round(avg(s.pct)::numeric, 1) as average, count(*) filter (where s.pct < 50) as below, count(*) as n
                from subj s join public.school_subjects sub on sub.id = s.subject_id where s.pct is not null group by sub.name) g), '[]'),
      'topics', coalesce((select jsonb_agg(jsonb_build_object('topic', t.topic, 'subject', t.subject, 'success_rate', t.success, 'answers', t.answers) order by t.success asc) from topic t), '[]'),
      'class_attendance_rate', (select round(sum(here) * 100.0 / nullif(sum(days), 0)) from att)
    )
  );
end $$;

revoke execute on function public._ai_requests_this_month(uuid) from public, anon, authenticated;
revoke execute on function public.ai_quota(uuid), public.set_ai_limit(uuid, integer), public.platform_ai_usage(), public.review_flagged_message(uuid),
  public.class_insights(uuid, uuid), public.match_knowledge(uuid, extensions.vector, text, text, int) from public, anon;
