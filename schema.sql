-- ======================================================================
-- منصة الامتحانات - قاعدة البيانات الكاملة (Supabase / PostgreSQL)
-- شغّل هذا الملف كامل في: Supabase Dashboard -> SQL Editor -> New query
-- ======================================================================

SET row_security = off;

-- ----------------------------------------------------------------------
-- 1) exams: الامتحانات
-- ----------------------------------------------------------------------
CREATE TABLE public.exams (
    id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name                  text NOT NULL,
    slug                  text NOT NULL UNIQUE,
    description           text,
    stage                 text,                         -- المرحلة (اختياري، يظهر بجانب اسم الامتحان)
    duration_seconds      integer NOT NULL DEFAULT 1800, -- مدة الامتحان بالثواني
    pass_threshold        integer NOT NULL DEFAULT 50,   -- نسبة النجاح %
    is_open               boolean NOT NULL DEFAULT true, -- مفتوح / مقفول
    result_visibility     text NOT NULL DEFAULT 'immediate' CHECK (result_visibility IN ('immediate','lookup_only')), -- إظهار النتيجة فور التسليم أو بالاستعلام فقط
    closed_message        text,                          -- رسالة مخصصة تظهر لو الامتحان مقفول (اختياري، فيه نص افتراضي لو فاضي)
    not_found_announcement text,                         -- الإعلان اللي بيظهر في صفحة الاستعلام لو الرقم مش موجود لهذا الامتحان
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------
-- 2) questions: أسئلة كل امتحان
-- ----------------------------------------------------------------------
CREATE TABLE public.questions (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_id        integer NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    order_index    integer NOT NULL DEFAULT 0,      -- ترتيب ظهور السؤال
    type           text NOT NULL CHECK (type IN ('true_false','multiple_choice','fill_in_the_blank','essay')),
    question       text NOT NULL,                   -- نص السؤال (فراغات إكمال تُكتب بثلاث نقاط متتالية "...")
    options        jsonb,                           -- صح/غلط أو اختيار من متعدد: مصفوفة نصوص. غير مستخدم لباقي الأنواع
    correct_answer jsonb,                            -- صح/غلط أو اختيار: نص. إكمال: مصفوفة إجابات مقبولة لكل فراغ. مقالي: null
    score          numeric(6,2) NOT NULL DEFAULT 1,  -- درجة السؤال (تقبل كسور عشرية: 0.5, 0.25, 1.5 ...)
    blank_scores   numeric(6,2)[],                   -- لإكمال الفراغ فقط: درجة كل فراغ على حدة (تقبل كسور عشرية)
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_questions_exam ON public.questions USING btree (exam_id, order_index);

-- ----------------------------------------------------------------------
-- 3) churches: قائمة الكنائس الرئيسية (تُدار من الأدمن)
-- ----------------------------------------------------------------------
CREATE TABLE public.churches (
    id         integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name       text NOT NULL UNIQUE,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ربط الكنائس بامتحان معين (اختياري: لو الامتحان مالوش صفوف هنا، تظهر كل الكنائس تلقائياً)
CREATE TABLE public.exam_churches (
    exam_id    integer NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    church_id  integer NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
    PRIMARY KEY (exam_id, church_id)
);

-- ----------------------------------------------------------------------
-- 4) package_categories / package_items: أقسام وعناصر "البكدجات" لكل امتحان
--    اختياري تماماً لكل امتحان (لو الامتحان معندوش أي قسم، شاشة الأنشطة بتتخطى تلقائياً)
-- ----------------------------------------------------------------------
CREATE TABLE public.package_categories (
    id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_id     integer NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
    name        text NOT NULL,             -- مثال: "أنشطة"
    min_select  integer NOT NULL DEFAULT 0, -- أقل عدد لازم يختاره (0 = اختياري تماماً)
    max_select  integer,                    -- أقصى عدد يقدر يختاره (NULL = بلا حد أقصى)
    sort_order  integer NOT NULL DEFAULT 0,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pkg_categories_exam ON public.package_categories USING btree (exam_id, sort_order);

CREATE TABLE public.package_items (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id  integer NOT NULL REFERENCES public.package_categories(id) ON DELETE CASCADE,
    name         text NOT NULL,
    sort_order   integer NOT NULL DEFAULT 0,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pkg_items_category ON public.package_items USING btree (category_id, sort_order);

-- ----------------------------------------------------------------------
-- 5) attempts: محاولات الطلاب
-- ----------------------------------------------------------------------
CREATE TABLE public.attempts (
    id                  integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    exam_id             integer NOT NULL REFERENCES public.exams(id),
    user_name           text NOT NULL,
    user_church         text,
    user_phone          text NOT NULL,
    start_time          timestamp without time zone DEFAULT now() NOT NULL,
    exam_started_at     timestamp without time zone,
    end_time            timestamp without time zone,
    status              text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','submitted','graded'])),
    total_score         numeric(6,2) DEFAULT 0,
    total_possible      numeric(6,2) DEFAULT 0,
    percentage          numeric(5,2) DEFAULT 0.00,
    grade_text          text,
    pass_fail           text CHECK (pass_fail = ANY (ARRAY['pass','fail'])),
    certificate_issued  boolean DEFAULT false,
    packages_confirmed  boolean DEFAULT false,
    created_at          timestamp without time zone DEFAULT now()
);

CREATE INDEX idx_exam_phone ON public.attempts USING btree (exam_id, user_phone);
CREATE INDEX idx_attempts_church ON public.attempts USING btree (user_church);
CREATE INDEX idx_attempts_status ON public.attempts USING btree (status);

-- ----------------------------------------------------------------------
-- 6) answers: إجابات كل سؤال داخل كل محاولة
-- ----------------------------------------------------------------------
CREATE TABLE public.answers (
    id             integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id     integer NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
    question_id    integer REFERENCES public.questions(id) ON DELETE SET NULL,
    question_index integer NOT NULL,
    question_type  text NOT NULL,
    user_answer    text,
    correct_answer text,
    auto_graded    boolean DEFAULT true,
    is_correct     boolean DEFAULT false,
    score          numeric(6,2) DEFAULT 0,
    max_score      numeric(6,2) DEFAULT 1,
    graded_by      text NOT NULL DEFAULT 'auto' CHECK (graded_by = ANY (ARRAY['auto','admin'])),
    UNIQUE (attempt_id, question_index)
);

CREATE INDEX idx_answers_attempt ON public.answers USING btree (attempt_id);

-- ----------------------------------------------------------------------
-- 7) attempt_packages: الأنشطة/الألعاب اللي اختارها كل طالب
-- ----------------------------------------------------------------------
CREATE TABLE public.attempt_packages (
    id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attempt_id   integer NOT NULL REFERENCES public.attempts(id) ON DELETE CASCADE,
    category_id  integer REFERENCES public.package_categories(id) ON DELETE SET NULL,
    item_id      integer REFERENCES public.package_items(id) ON DELETE SET NULL,
    category     text NOT NULL,  -- نسخة نصية وقت الاختيار (تفضل موجودة حتى لو القسم اتمسح بعدين)
    item         text NOT NULL,  -- نسخة نصية وقت الاختيار
    created_at   timestamp without time zone DEFAULT now()
);

CREATE INDEX idx_attempt ON public.attempt_packages USING btree (attempt_id);
CREATE INDEX idx_category_item ON public.attempt_packages USING btree (category, item);

-- ----------------------------------------------------------------------
-- 8) settings: إعدادات عامة (مفتاح/قيمة) - تستخدم مستقبلاً لأي إعداد إضافي
-- ----------------------------------------------------------------------
CREATE TABLE public.settings (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    setting_key   text UNIQUE,
    setting_value text
);

-- ======================================================================
-- Row Level Security + Policies
-- ملاحظة أمان مهمة: زي التصميم الأصلي، الموقع بيتكلم مع Supabase مباشرة
-- من المتصفح بمفتاح anon، وباسورد الأدمن هو حماية على مستوى الواجهة فقط
-- (مش حماية حقيقية على قاعدة البيانات). عشان كده الصلاحيات هنا مفتوحة
-- (USING true) لكل الجداول عشان لوحة الأدمن تقدر تشتغل من المتصفح.
-- ======================================================================

ALTER TABLE public.exams               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_churches       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_packages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings            ENABLE ROW LEVEL SECURITY;

-- exams
CREATE POLICY "public read exams"   ON public.exams FOR SELECT USING (true);
CREATE POLICY "public insert exams" ON public.exams FOR INSERT WITH CHECK (true);
CREATE POLICY "public update exams" ON public.exams FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete exams" ON public.exams FOR DELETE USING (true);

-- questions
CREATE POLICY "public read questions"   ON public.questions FOR SELECT USING (true);
CREATE POLICY "public insert questions" ON public.questions FOR INSERT WITH CHECK (true);
CREATE POLICY "public update questions" ON public.questions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete questions" ON public.questions FOR DELETE USING (true);

-- churches
CREATE POLICY "public read churches"   ON public.churches FOR SELECT USING (true);
CREATE POLICY "public insert churches" ON public.churches FOR INSERT WITH CHECK (true);
CREATE POLICY "public update churches" ON public.churches FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete churches" ON public.churches FOR DELETE USING (true);

-- exam_churches
CREATE POLICY "public read exam_churches"   ON public.exam_churches FOR SELECT USING (true);
CREATE POLICY "public insert exam_churches" ON public.exam_churches FOR INSERT WITH CHECK (true);
CREATE POLICY "public delete exam_churches" ON public.exam_churches FOR DELETE USING (true);

-- package_categories
CREATE POLICY "public read pkg_categories"   ON public.package_categories FOR SELECT USING (true);
CREATE POLICY "public insert pkg_categories" ON public.package_categories FOR INSERT WITH CHECK (true);
CREATE POLICY "public update pkg_categories" ON public.package_categories FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete pkg_categories" ON public.package_categories FOR DELETE USING (true);

-- package_items
CREATE POLICY "public read pkg_items"   ON public.package_items FOR SELECT USING (true);
CREATE POLICY "public insert pkg_items" ON public.package_items FOR INSERT WITH CHECK (true);
CREATE POLICY "public update pkg_items" ON public.package_items FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete pkg_items" ON public.package_items FOR DELETE USING (true);

-- attempts
CREATE POLICY "public read attempts"   ON public.attempts FOR SELECT USING (true);
CREATE POLICY "public insert attempts" ON public.attempts FOR INSERT WITH CHECK (true);
CREATE POLICY "public update attempts" ON public.attempts FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete attempts" ON public.attempts FOR DELETE USING (true);

-- answers
CREATE POLICY "public read answers"   ON public.answers FOR SELECT USING (true);
CREATE POLICY "public insert answers" ON public.answers FOR INSERT WITH CHECK (true);
CREATE POLICY "public update answers" ON public.answers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete answers" ON public.answers FOR DELETE USING (true);

-- attempt_packages
CREATE POLICY "public read attempt_packages"   ON public.attempt_packages FOR SELECT USING (true);
CREATE POLICY "public insert attempt_packages" ON public.attempt_packages FOR INSERT WITH CHECK (true);
CREATE POLICY "public update attempt_packages" ON public.attempt_packages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete attempt_packages" ON public.attempt_packages FOR DELETE USING (true);

-- settings
CREATE POLICY "public read settings"   ON public.settings FOR SELECT USING (true);
CREATE POLICY "public insert settings" ON public.settings FOR INSERT WITH CHECK (true);
CREATE POLICY "public update settings" ON public.settings FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "public delete settings" ON public.settings FOR DELETE USING (true);

-- ======================================================================
-- Grants (لازمة عشان PostgREST/الـ API يقدر يوصل للجداول)
-- ======================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ======================================================================
-- باسورد لوحة الأدمن (محفوظ في قاعدة البيانات نفسها، لا يوجد في أي كود JS)
-- تقدر تغيّره في أي وقت من تبويب "الإعدادات" داخل لوحة التحكم، أو بتنفيذ:
-- UPDATE public.settings SET setting_value = 'باسورد-جديد' WHERE setting_key = 'admin_password';
-- ======================================================================
INSERT INTO public.settings (setting_key, setting_value)
VALUES ('admin_password', 'Miketalaat213510##')
ON CONFLICT (setting_key) DO NOTHING;

-- ======================================================================
-- بيانات تجريبية اختيارية (احذف هذا الجزء لو مش عايزه)
-- ======================================================================

-- امتحان تجريبي فاضي تقدر تعدل عليه من لوحة الأدمن مباشرة
-- INSERT INTO public.exams (name, slug, duration_seconds, pass_threshold, is_open)
-- VALUES ('امتحان تجريبي', 'demo-exam', 1800, 50, true);
