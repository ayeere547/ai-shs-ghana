-- =====================================================================================
-- DEVELOPMENT SAMPLE DATA — every row here is fictional and flagged is_demo = true.
-- These are NOT real schools. The UI labels them "Sample data" wherever they appear and
-- they are excluded from platform statistics. Never load this file into production.
-- =====================================================================================

insert into public.schools (id, slug, name, school_code, category, ownership, boarding_type, region_code, district, address, email, phone,
  programmes_offered, headmaster_name, description, public_listing, status, verified_at, onboarding_completed_at, is_demo)
values
  ('a0000000-0000-4000-8000-000000000001', 'sample-ridge-shs', 'Sample Ridge SHS (Demo)', 'DEMO-001', 'A', 'public', 'day_and_boarding', 'AS', 'Sample District', 'P.O. Box 1, Sample Town',
   'info@sample-ridge.example', '+233 00 000 0001', array['General Science', 'General Arts', 'Business'], 'Demo Headteacher', 'Fictional school used to demonstrate the platform.', true, 'active', now(), now(), true),
  ('a0000000-0000-4000-8000-000000000002', 'sample-coastal-girls-shs', 'Sample Coastal Girls'' SHS (Demo)', 'DEMO-002', 'B', 'public', 'boarding', 'CP', 'Sample Coastal District', 'P.O. Box 2, Sample Bay',
   'info@sample-coastal.example', '+233 00 000 0002', array['General Science', 'Home Economics', 'Visual Arts'], 'Demo Headmistress', 'Fictional girls'' boarding school used for demonstrations.', true, 'active', now(), now(), true),
  ('a0000000-0000-4000-8000-000000000003', 'sample-savannah-technical-shs', 'Sample Savannah Technical SHS (Demo)', 'DEMO-003', 'C', 'private', 'day', 'UE', 'Sample Savannah District', 'P.O. Box 3, Sample Plains',
   'info@sample-savannah.example', '+233 00 000 0003', array['Technical', 'Agricultural Science'], 'Demo Headteacher', 'Fictional technical school used for demonstrations.', true, 'active', now(), null, true),
  ('a0000000-0000-4000-8000-000000000004', 'sample-valley-community-shs', 'Sample Valley Community SHS (Demo)', null, 'unclassified', 'private', 'day', 'TV', 'Sample Valley District', 'P.O. Box 4, Sample Valley',
   'info@sample-valley.example', '+233 00 000 0004', array['General Arts'], 'Demo Headteacher', 'Fictional registration awaiting verification.', false, 'pending_verification', null, null, true);

insert into public.school_settings (school_id) select id from public.schools where is_demo;
insert into public.school_branding (school_id, primary_color, secondary_color, motto) values
  ('a0000000-0000-4000-8000-000000000001', '#0b2545', '#1d4ed8', 'Knowledge and service (sample)'),
  ('a0000000-0000-4000-8000-000000000002', '#134e4a', '#c9a227', 'Grace and excellence (sample)'),
  ('a0000000-0000-4000-8000-000000000003', '#7c2d12', '#1d4ed8', 'Skill builds nations (sample)'),
  ('a0000000-0000-4000-8000-000000000004', '#0b2545', '#1d4ed8', null);

insert into public.subscriptions (school_id, plan_id)
select s.id, p.id from public.schools s cross join public.subscription_plans p where s.is_demo and s.status = 'active' and p.code = 'free';

-- Academic structure for Sample Ridge SHS
insert into public.academic_years (id, school_id, name, starts_on, ends_on, is_current) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', '2026/2027', '2026-09-01', '2027-07-31', true);
insert into public.academic_terms (school_id, academic_year_id, name, starts_on, ends_on, is_current) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Term 1', '2026-09-01', '2026-12-18', true),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Term 2', '2027-01-11', '2027-04-09', false),
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Term 3', '2027-04-26', '2027-07-31', false);
insert into public.school_departments (id, school_id, name, code) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Science', 'SCI'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'Languages', 'LANG'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Mathematics', 'MATH');
insert into public.school_programmes (id, school_id, name, code) values
  ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'General Science', 'SCI'),
  ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'General Arts', 'ART'),
  ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'Business', 'BUS');
insert into public.school_classes (school_id, programme_id, name, form_level, capacity) values
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '1 Science A', 1, 45),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000002', '1 Arts A', 1, 45),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000003', '1 Business A', 1, 45),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '2 Science A', 2, 45),
  ('a0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', '3 Science A', 3, 45);
insert into public.school_subjects (school_id, department_id, name, code, is_core) values
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000002', 'English Language', 'ENG', true),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Core Mathematics', 'CMATH', true),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Integrated Science', 'ISCI', true),
  ('a0000000-0000-4000-8000-000000000001', null, 'Social Studies', 'SOC', true),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000003', 'Elective Mathematics', 'EMATH', false),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Physics', 'PHY', false),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Chemistry', 'CHEM', false),
  ('a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'Biology', 'BIO', false);
insert into public.school_houses (school_id, name, gender) values
  ('a0000000-0000-4000-8000-000000000001', 'Sample House 1', 'boys'),
  ('a0000000-0000-4000-8000-000000000001', 'Sample House 2', 'girls');

-- ---------------------------------------------------------------------------------------
-- Phase 2 sample data (Sample Ridge SHS only). Names are obviously fictional placeholders.
-- ---------------------------------------------------------------------------------------
insert into public.school_sequences (school_id, kind, next_value) values
  ('a0000000-0000-4000-8000-000000000001', 'student', 41),
  ('a0000000-0000-4000-8000-000000000001', 'staff', 7);

insert into public.staff (id, school_id, staff_number, title, first_name, last_name, gender, job_title, department_id, is_teaching, date_joined) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'SRS/ST/26/00001', 'Mrs', 'Sample', 'Teacher One', 'female', 'Teacher', 'c0000000-0000-4000-8000-000000000003', true, '2020-09-01'),
  ('e0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 'SRS/ST/26/00002', 'Mr', 'Sample', 'Teacher Two', 'male', 'Teacher', 'c0000000-0000-4000-8000-000000000002', true, '2021-09-01'),
  ('e0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'SRS/ST/26/00003', 'Ms', 'Sample', 'Teacher Three', 'female', 'Teacher', 'c0000000-0000-4000-8000-000000000001', true, '2022-01-10'),
  ('e0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'SRS/ST/26/00004', 'Mr', 'Sample', 'Teacher Four', 'male', 'Teacher', 'c0000000-0000-4000-8000-000000000001', true, '2019-09-01'),
  ('e0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000001', 'SRS/ST/26/00005', 'Dr', 'Sample', 'Teacher Five', 'female', 'Head of Science', 'c0000000-0000-4000-8000-000000000001', true, '2015-09-01'),
  ('e0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'SRS/ST/26/00006', 'Mr', 'Sample', 'Bursar', 'male', 'Accounts Officer', null, false, '2018-03-01');

-- 40 fictional students spread over the five sample classes.
insert into public.students (school_id, student_number, first_name, last_name, gender, date_of_birth, admission_date, programme_id, class_id, residency)
select 'a0000000-0000-4000-8000-000000000001', 'SRS/26/' || lpad(n::text, 5, '0'), 'Sample', 'Student ' || lpad(n::text, 2, '0'),
       case when n % 2 = 0 then 'female' else 'male' end, date '2009-01-01' + (n * 23), date '2026-09-01',
       c.programme_id, c.id, case when n % 3 = 0 then 'day' else 'boarding' end
from generate_series(1, 40) n
join lateral (select id, programme_id from public.school_classes where school_id = 'a0000000-0000-4000-8000-000000000001' order by form_level, name offset (n % 5) limit 1) c on true;

insert into public.timetable_periods (school_id, name, starts_at, ends_at, is_break) values
  ('a0000000-0000-4000-8000-000000000001', 'Period 1', '07:30', '08:30', false),
  ('a0000000-0000-4000-8000-000000000001', 'Period 2', '08:30', '09:30', false),
  ('a0000000-0000-4000-8000-000000000001', 'Break', '09:30', '10:00', true),
  ('a0000000-0000-4000-8000-000000000001', 'Period 3', '10:00', '11:00', false),
  ('a0000000-0000-4000-8000-000000000001', 'Period 4', '11:00', '12:00', false),
  ('a0000000-0000-4000-8000-000000000001', 'Lunch', '12:00', '12:45', true),
  ('a0000000-0000-4000-8000-000000000001', 'Period 5', '12:45', '13:45', false),
  ('a0000000-0000-4000-8000-000000000001', 'Period 6', '13:45', '14:45', false);

-- Core subjects for every class; teachers by department.
insert into public.teacher_assignments (school_id, staff_id, class_id, subject_id, periods_per_week)
select 'a0000000-0000-4000-8000-000000000001',
       case sub.code when 'CMATH' then 'e0000000-0000-4000-8000-000000000001'::uuid when 'ENG' then 'e0000000-0000-4000-8000-000000000002'::uuid
                     when 'ISCI' then 'e0000000-0000-4000-8000-000000000003'::uuid else 'e0000000-0000-4000-8000-000000000004'::uuid end,
       c.id, sub.id, 4
from public.school_classes c
cross join public.school_subjects sub
where c.school_id = 'a0000000-0000-4000-8000-000000000001' and sub.school_id = c.school_id and sub.is_core;

insert into public.grading_schemes (id, school_id, name, is_default) values
  ('f0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Sample internal scheme', true);
insert into public.grading_bands (school_id, scheme_id, grade, min_score, max_score, remark, points) values
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'A', 80, 100, 'Excellent', 1),
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'B', 70, 79.99, 'Very good', 2),
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'C', 60, 69.99, 'Good', 3),
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'D', 50, 59.99, 'Credit', 4),
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'E', 40, 49.99, 'Pass', 5),
  ('a0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'F', 0, 39.99, 'Fail', 6);
