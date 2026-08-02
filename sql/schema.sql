-- ============================================================
-- نظام الامتحانات - جداول قاعدة البيانات (Supabase / PostgreSQL)
-- شغّل هذا الملف كامل في: Supabase Dashboard > SQL Editor > New query
-- ============================================================

create extension if not exists "pgcrypto";

-- جدول الامتحانات
create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  duration_minutes integer not null check (duration_minutes > 0),
  pass_percentage numeric not null default 50,
  show_results_auto boolean not null default true,
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);

-- جدول الأسئلة
-- question_type: 'true_false' | 'mcq' | 'fill'
-- في حالة الأسئلة من نوع "أكمل" (fill) توضع علامة ___ داخل question_text
-- في المكان المطلوب فيه فراغ، وعدد العلامات = عدد الفراغات (يطابق جدول question_blanks)
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  order_index integer not null default 0,
  question_text text not null,
  question_type text not null check (question_type in ('true_false','mcq','fill')),
  points numeric not null default 1,
  created_at timestamptz not null default now()
);

-- خيارات الأسئلة (لأسئلة صح/غلط و اختر)
create table if not exists question_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  option_text text not null,
  is_correct boolean not null default false,
  order_index integer not null default 0
);

-- فراغات أسئلة "أكمل" (كل سؤال ممكن يحتوي أكثر من فراغ)
create table if not exists question_blanks (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references questions(id) on delete cascade,
  blank_index integer not null,
  correct_answer text not null
);

-- محاولات الطلاب (تُكتب مرة واحدة عند التسليم فقط)
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references exams(id) on delete cascade,
  student_name text not null,
  student_phone text not null,
  score numeric not null,
  max_score numeric not null,
  percentage numeric not null,
  is_passed boolean not null,
  answers jsonb not null default '[]'::jsonb,
  submitted_at timestamptz not null default now(),
  unique (exam_id, student_phone)
);

create index if not exists idx_questions_exam on questions(exam_id);
create index if not exists idx_options_question on question_options(question_id);
create index if not exists idx_blanks_question on question_blanks(question_id);
create index if not exists idx_attempts_exam on attempts(exam_id);
create index if not exists idx_attempts_phone on attempts(student_phone);

-- ============================================================
-- ملاحظة أمان مهمة:
-- بما أن طلب المشروع كان "بدون باسورد لصفحة الأدمن"، السياسات تحت
-- تسمح لأي شخص يعرف رابط الأدمن (mike213talaat510admin.html) بالتحكم
-- الكامل في البيانات عبر مفتاح anon. يعني حماية لوحة التحكم الوحيدة
-- هي "عدم مشاركة رابط صفحة الأدمن مع أحد". لو عايز حماية أقوى في
-- المستقبل ينفع نضيف تسجيل دخول Supabase Auth.
-- ============================================================

alter table exams enable row level security;
alter table questions enable row level security;
alter table question_options enable row level security;
alter table question_blanks enable row level security;
alter table attempts enable row level security;

drop policy if exists "public_all_exams" on exams;
create policy "public_all_exams" on exams for all using (true) with check (true);

drop policy if exists "public_all_questions" on questions;
create policy "public_all_questions" on questions for all using (true) with check (true);

drop policy if exists "public_all_options" on question_options;
create policy "public_all_options" on question_options for all using (true) with check (true);

drop policy if exists "public_all_blanks" on question_blanks;
create policy "public_all_blanks" on question_blanks for all using (true) with check (true);

drop policy if exists "public_all_attempts" on attempts;
create policy "public_all_attempts" on attempts for all using (true) with check (true);
