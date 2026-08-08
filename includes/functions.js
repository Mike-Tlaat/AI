import { supabase } from "./db.js";

/* =======================================================================
   ملاحظة عامة: كل البيانات (امتحانات - أسئلة - كنائس - أنشطة) بقت جوه
   قاعدة البيانات بالكامل، مفيش أي فتح لملفات JSON تاني.
   ======================================================================= */

/* =======================================
   الامتحانات (exams)
======================================= */
export async function getExamBySlug(slug) {
  const { data } = await supabase
    .from("exams")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return data || null;
}

export async function getExamById(examId) {
  const { data } = await supabase
    .from("exams")
    .select("*")
    .eq("id", examId)
    .maybeSingle();
  return data || null;
}

export async function getAllExams() {
  const { data } = await supabase.from("exams").select("*").order("id");
  return data || [];
}

export async function createExam(examData) {
  const payload = {
    name: examData.name,
    slug: examData.slug,
    description: examData.description || null,
    stage: examData.stage || null,
    duration_seconds: Number(examData.duration_seconds) || 1800,
    pass_threshold: Number(examData.pass_threshold ?? 50),
    is_open: examData.is_open !== undefined ? !!examData.is_open : true,
    not_found_announcement: examData.not_found_announcement || null,
  };
  const { data, error } = await supabase
    .from("exams")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExam(examId, patch) {
  const allowed = [
    "name",
    "slug",
    "description",
    "stage",
    "duration_seconds",
    "pass_threshold",
    "is_open",
    "not_found_announcement",
  ];
  const payload = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) payload[k] = patch[k];
  });
  payload.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("exams")
    .update(payload)
    .eq("id", examId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExamStatus(examId, isOpen) {
  return updateExam(examId, { is_open: isOpen });
}

export async function deleteExam(examId) {
  const { error } = await supabase.from("exams").delete().eq("id", examId);
  if (error) throw error;
  return true;
}

/* =======================================
   الأسئلة (questions)
======================================= */

// إرجاع الأسئلة بشكل جاهز للاستخدام في exam.js (نفس شكل الأسئلة القديم من JSON)
export async function getQuestionsByExam(examId) {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("exam_id", examId)
    .order("order_index", { ascending: true });
  if (error) {
    console.error("Error loading questions:", error);
    return [];
  }
  return data || [];
}

export async function createQuestion(examId, q) {
  // نحدد order_index تلقائي = آخر رقم + 1
  const { data: existing } = await supabase
    .from("questions")
    .select("order_index")
    .eq("exam_id", examId)
    .order("order_index", { ascending: false })
    .limit(1);
  const nextOrder = existing && existing.length ? existing[0].order_index + 1 : 0;

  const payload = {
    exam_id: examId,
    order_index: q.order_index ?? nextOrder,
    type: q.type,
    question: q.question,
    options: q.options ?? null,
    correct_answer: q.correct_answer ?? null,
    score: Number(q.score ?? 1),
    blank_scores: q.blank_scores ?? null,
  };
  const { data, error } = await supabase
    .from("questions")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateQuestion(questionId, patch) {
  const allowed = [
    "type",
    "question",
    "options",
    "correct_answer",
    "score",
    "blank_scores",
    "order_index",
  ];
  const payload = {};
  allowed.forEach((k) => {
    if (patch[k] !== undefined) payload[k] = patch[k];
  });
  const { data, error } = await supabase
    .from("questions")
    .update(payload)
    .eq("id", questionId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteQuestion(questionId) {
  const { error } = await supabase.from("questions").delete().eq("id", questionId);
  if (error) throw error;
  return true;
}

export async function reorderQuestions(examId, orderedQuestionIds) {
  // orderedQuestionIds: مصفوفة IDs بالترتيب المطلوب
  const updates = orderedQuestionIds.map((id, index) =>
    supabase.from("questions").update({ order_index: index }).eq("id", id).eq("exam_id", examId),
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  return true;
}

/* =======================================
   التصحيح التلقائي (يدعم درجة لكل سؤال ودرجة لكل فراغ)
======================================= */
function normalize(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isAnswerCorrect(userAnswer, correctAnswer) {
  const u = normalize(userAnswer);
  if (u === "") return false;
  if (Array.isArray(correctAnswer)) {
    return correctAnswer.some((accepted) => normalize(accepted) === u);
  }
  return normalize(correctAnswer) === u;
}

function normalizeBlanksCorrectAnswer(correctAnswer) {
  if (!Array.isArray(correctAnswer)) return [[String(correctAnswer)]];
  const isNested = correctAnswer.some((v) => Array.isArray(v));
  if (isNested) return correctAnswer.map((v) => (Array.isArray(v) ? v : [String(v)]));
  return [correctAnswer];
}

// تصحيح سؤال إكمال الفراغ مع دعم درجة مستقلة لكل فراغ (Partial credit)
function gradeFillInTheBlankDetailed(userAnswer, correctAnswer, blankScores) {
  const blanks = normalizeBlanksCorrectAnswer(correctAnswer);
  const userBlanks = Array.isArray(userAnswer) ? userAnswer : [userAnswer];

  const scores =
    Array.isArray(blankScores) && blankScores.length === blanks.length
      ? blankScores.map((s) => Number(s) || 0)
      : blanks.map(() => 1); // fallback: درجة واحدة لكل فراغ لو مفيش تحديد

  let score = 0;
  let maxScore = 0;
  let allCorrect = true;

  blanks.forEach((accepted, i) => {
    const pts = scores[i] ?? 0;
    maxScore += pts;
    const correct = isAnswerCorrect(userBlanks[i] ?? "", accepted);
    if (correct) score += pts;
    else allCorrect = false;
  });

  return { isCorrect: allCorrect, score, maxScore };
}

// تصحيح أي سؤال (يرجع النتيجة والدرجة القصوى)
export function gradeQuestion(question, userAnswer) {
  const type = question.type;
  const correctAnswer = question.correct_answer;

  if (type === "essay") {
    // مقالي: يحتاج تصحيح يدوي من الأدمن
    return { autoGraded: false, isCorrect: false, score: 0, maxScore: Number(question.score) || 0 };
  }

  if (type === "fill_in_the_blank") {
    const result = gradeFillInTheBlankDetailed(userAnswer, correctAnswer, question.blank_scores);
    return { autoGraded: true, ...result };
  }

  // true_false / multiple_choice
  const maxScore = Number(question.score) || 1;
  const correct = isAnswerCorrect(userAnswer, correctAnswer);
  return { autoGraded: true, isCorrect: correct, score: correct ? maxScore : 0, maxScore };
}

/* =======================================
   التقديرات وحد النجاح
======================================= */
export function getGradeText(percentage) {
  const p = Number(percentage) || 0;
  if (p >= 91) return "ممتاز";
  if (p >= 76) return "جيد جداً";
  if (p >= 61) return "جيد";
  if (p >= 50) return "مقبول";
  return "ضعيف";
}

/* =======================================
   المحاولات (Attempts)
======================================= */
export async function checkExistingAttempt(examId, phone) {
  const { count } = await supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .eq("exam_id", examId)
    .eq("user_phone", phone)
    .in("status", ["submitted", "graded"]);
  return (count || 0) > 0;
}

export async function createAttempt(examId, name, church, phone) {
  const { data, error } = await supabase
    .from("attempts")
    .insert({
      exam_id: examId,
      user_name: name,
      user_church: church,
      user_phone: phone,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getAttempt(attemptId) {
  const { data } = await supabase
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .maybeSingle();
  return data || null;
}

export async function ensureExamStarted(attemptId) {
  const attempt = await getAttempt(attemptId);
  if (attempt && !attempt.exam_started_at) {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("attempts")
      .update({ exam_started_at: nowIso })
      .eq("id", attemptId)
      .is("exam_started_at", null)
      .select("exam_started_at")
      .maybeSingle();
    return data?.exam_started_at || nowIso;
  }
  return attempt?.exam_started_at || null;
}

export async function submitExamAttempt(attemptId, questions, postedAnswers) {
  const rows = [];
  let totalScore = 0;
  let totalPossible = 0;

  questions.forEach((q, index) => {
    const type = q.type;
    const rawAnswer = postedAnswers[index] ?? "";

    let storedAnswer;
    if (type === "fill_in_the_blank" && Array.isArray(rawAnswer)) {
      storedAnswer = JSON.stringify(rawAnswer.map((v) => String(v ?? "").trim()));
    } else {
      storedAnswer = Array.isArray(rawAnswer) ? "" : String(rawAnswer ?? "").trim();
    }

    const cleanAnswer =
      type === "fill_in_the_blank" && Array.isArray(rawAnswer)
        ? rawAnswer.map((v) => String(v ?? "").trim())
        : String(rawAnswer ?? "").trim();

    const result = gradeQuestion(q, cleanAnswer);

    if (result.autoGraded) {
      totalPossible += result.maxScore;
      totalScore += result.score;
    }

    rows.push({
      attempt_id: attemptId,
      question_id: q.id ?? null,
      question_index: index,
      question_type: type,
      user_answer: storedAnswer,
      correct_answer: Array.isArray(q.correct_answer)
        ? JSON.stringify(q.correct_answer)
        : String(q.correct_answer ?? ""),
      auto_graded: result.autoGraded,
      is_correct: result.isCorrect,
      score: result.score,
      max_score: result.maxScore,
      graded_by: "auto",
    });
  });

  const percentage = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0;
  const gradeText = getGradeText(percentage);
  // ملحوظة: نسبة النجاح المبدئية بتتحسب من الأسئلة اللي بتتصحح أوتوماتيك فقط.
  // لو الامتحان فيه أسئلة مقالية، هتفضل "قيد المراجعة" لحد ما الأدمن يصححها
  // (انظر recalcAttemptTotals بعد تصحيح المقالي).
  const hasEssay = questions.some((q) => q.type === "essay");
  const status = hasEssay ? "submitted" : "submitted";

  if (rows.length) {
    const { error: ansErr } = await supabase
      .from("answers")
      .upsert(rows, { onConflict: "attempt_id,question_index" });
    if (ansErr) throw ansErr;
  }

  const passThreshold = await getExamPassThreshold(questions);

  const { error: attErr } = await supabase
    .from("attempts")
    .update({
      end_time: new Date().toISOString(),
      status,
      total_score: totalScore,
      total_possible: totalPossible,
      percentage,
      grade_text: gradeText,
      pass_fail: percentage >= passThreshold ? "pass" : "fail",
    })
    .eq("id", attemptId);
  if (attErr) throw attErr;

  return true;
}

// نجيب حد النجاح الفعلي بتاع الامتحان (كل الأسئلة بتحمل exam_id واحد)
async function getExamPassThreshold(questions) {
  if (!questions || !questions.length) return 50;
  const examId = questions[0].exam_id;
  if (!examId) return 50;
  const exam = await getExamById(examId);
  return exam?.pass_threshold ?? 50;
}

export async function deleteAttempt(attemptId) {
  const { error } = await supabase.from("attempts").delete().eq("id", attemptId);
  if (error) throw error;
  return true;
}

/* =======================================
   إعادة احتساب مجموع المحاولة (تُستخدم بعد أي تعديل يدوي على إجابة)
======================================= */
export async function recalcAttemptTotals(attemptId) {
  const { data: answersRows, error } = await supabase
    .from("answers")
    .select("score, max_score")
    .eq("attempt_id", attemptId);
  if (error) throw error;

  const totalScore = (answersRows || []).reduce((s, a) => s + (Number(a.score) || 0), 0);
  const totalPossible = (answersRows || []).reduce((s, a) => s + (Number(a.max_score) || 0), 0);
  const percentage = totalPossible > 0 ? (totalScore / totalPossible) * 100 : 0;
  const gradeText = getGradeText(percentage);

  const attempt = await getAttempt(attemptId);
  const exam = attempt ? await getExamById(attempt.exam_id) : null;
  const passThreshold = exam?.pass_threshold ?? 50;

  const { error: updErr } = await supabase
    .from("attempts")
    .update({
      total_score: totalScore,
      total_possible: totalPossible,
      percentage,
      grade_text: gradeText,
      pass_fail: percentage >= passThreshold ? "pass" : "fail",
      status: "graded",
    })
    .eq("id", attemptId);
  if (updErr) throw updErr;

  return { totalScore, totalPossible, percentage, gradeText };
}

// تعديل إجابة معينة يدوياً من الأدمن (تصحيح/تغليط أي سؤال، أو تصحيح مقالي)
export async function adminUpdateAnswer(answerId, { isCorrect, score, maxScore }) {
  const patch = { graded_by: "admin" };
  if (isCorrect !== undefined) patch.is_correct = isCorrect;
  if (score !== undefined) patch.score = Number(score);
  if (maxScore !== undefined) patch.max_score = Number(maxScore);

  const { data, error } = await supabase
    .from("answers")
    .update(patch)
    .eq("id", answerId)
    .select()
    .single();
  if (error) throw error;

  await recalcAttemptTotals(data.attempt_id);
  return data;
}

export async function getAnswersForAttempt(attemptId) {
  const { data, error } = await supabase
    .from("answers")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("question_index", { ascending: true });
  if (error) {
    console.error("Error loading answers:", error);
    return [];
  }
  return data || [];
}

/* =======================================
   جلب وعد المحاولات للقوائم (لوحة الأدمن)
======================================= */
export async function countAttemptsByPassFail(passFail, category, item, church, examId, search) {
  let query = supabase
    .from("attempts")
    .select("id", { count: "exact", head: true })
    .in("status", ["submitted", "graded"]);

  if (passFail) query = query.eq("pass_fail", passFail);
  if (church) query = query.eq("user_church", church);
  if (examId) query = query.eq("exam_id", Number(examId));
  if (search) {
    query = query.or(`user_name.ilike.%${search}%,user_phone.ilike.%${search}%`);
  }

  if (category && item) {
    const { data: pkgs } = await supabase
      .from("attempt_packages")
      .select("attempt_id")
      .eq("category", category)
      .eq("item", item);

    const attIds = (pkgs || []).map((p) => p.attempt_id);
    if (!attIds.length) return 0;
    query = query.in("id", attIds);
  }

  const { count, error } = await query;
  if (error) console.error("Error counting attempts:", error);
  return count || 0;
}

export async function getAttemptsByPassFail(passFail, category, item, church, examId, limit, offset, search) {
  let query = supabase
    .from("attempts")
    .select("*, exams(name)")
    .in("status", ["submitted", "graded"]);

  if (passFail) query = query.eq("pass_fail", passFail);
  if (church) query = query.eq("user_church", church);
  if (examId) query = query.eq("exam_id", Number(examId));
  if (search) {
    query = query.or(`user_name.ilike.%${search}%,user_phone.ilike.%${search}%`);
  }

  if (category && item) {
    const { data: pkgs } = await supabase
      .from("attempt_packages")
      .select("attempt_id")
      .eq("category", category)
      .eq("item", item);

    const attIds = (pkgs || []).map((p) => p.attempt_id);
    if (!attIds.length) return [];
    query = query.in("id", attIds);
  }

  query = query.order("id", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("Error fetching attempts:", error);
    return [];
  }

  return (data || []).map((a) => ({
    ...a,
    exam_name: a.exams?.name || `امتحان ${a.exam_id}`,
  }));
}

/* =======================================
   الكنائس (churches)
======================================= */
export async function getAllChurches() {
  const { data } = await supabase.from("churches").select("*").order("sort_order").order("name");
  return data || [];
}

export async function createChurch(name, sortOrder = 0) {
  const { data, error } = await supabase
    .from("churches")
    .insert({ name: name.trim(), sort_order: sortOrder })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChurch(id, patch) {
  const { data, error } = await supabase.from("churches").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteChurch(id) {
  const { error } = await supabase.from("churches").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// الكنائس المتاحة لامتحان معين. لو مفيش أي كنيسة مربوطة بالامتحان، بترجع كل الكنائس
export async function getChurchesForExam(examId) {
  const { data: links } = await supabase
    .from("exam_churches")
    .select("church_id, churches(id, name, sort_order)")
    .eq("exam_id", examId);

  if (links && links.length) {
    return links
      .map((l) => l.churches)
      .filter(Boolean)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.name.localeCompare(b.name, "ar"));
  }
  return getAllChurches();
}

// يرجع الـ IDs المرتبطة فعلياً بالامتحان (مصفوفة فاضية = مفيش تخصيص، يعني كل الكنائس متاحة)
export async function getExamChurchLinks(examId) {
  const { data } = await supabase.from("exam_churches").select("church_id").eq("exam_id", examId);
  return (data || []).map((r) => r.church_id);
}

export async function setExamChurches(examId, churchIds) {
  await supabase.from("exam_churches").delete().eq("exam_id", examId);
  if (churchIds && churchIds.length) {
    const rows = churchIds.map((church_id) => ({ exam_id: examId, church_id }));
    const { error } = await supabase.from("exam_churches").insert(rows);
    if (error) throw error;
  }
  return true;
}

/* =======================================
   نظام البكدجات/الأنشطة الديناميكي لكل امتحان
======================================= */
export async function getPackageCategoriesForExam(examId) {
  const { data: categories, error } = await supabase
    .from("package_categories")
    .select("*")
    .eq("exam_id", examId)
    .order("sort_order")
    .order("id");
  if (error) {
    console.error("Error loading package categories:", error);
    return [];
  }
  if (!categories || !categories.length) return [];

  const categoryIds = categories.map((c) => c.id);
  const { data: items } = await supabase
    .from("package_items")
    .select("*")
    .in("category_id", categoryIds)
    .order("sort_order")
    .order("id");

  return categories.map((cat) => ({
    ...cat,
    items: (items || []).filter((it) => it.category_id === cat.id),
  }));
}

export async function createPackageCategory(examId, { name, min_select = 0, max_select = null, sort_order = 0 }) {
  const { data, error } = await supabase
    .from("package_categories")
    .insert({ exam_id: examId, name, min_select, max_select, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePackageCategory(id, patch) {
  const { data, error } = await supabase.from("package_categories").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePackageCategory(id) {
  const { error } = await supabase.from("package_categories").delete().eq("id", id);
  if (error) throw error;
  return true;
}

export async function createPackageItem(categoryId, { name, sort_order = 0 }) {
  const { data, error } = await supabase
    .from("package_items")
    .insert({ category_id: categoryId, name, sort_order })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePackageItem(id, patch) {
  const { data, error } = await supabase.from("package_items").update(patch).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePackageItem(id) {
  const { error } = await supabase.from("package_items").delete().eq("id", id);
  if (error) throw error;
  return true;
}

// حفظ اختيارات الطالب: selections = { [categoryId]: [itemId, itemId, ...] }
export async function savePackageSelections(attemptId, examId, selections) {
  const categories = await getPackageCategoriesForExam(examId);
  await supabase.from("attempt_packages").delete().eq("attempt_id", attemptId);

  const rowsToInsert = [];
  for (const cat of categories) {
    let chosenIds = selections[cat.id] || [];
    if (!Array.isArray(chosenIds)) chosenIds = chosenIds ? [chosenIds] : [];

    const validItemsById = new Map(cat.items.map((it) => [it.id, it]));
    chosenIds = [...new Set(chosenIds.map(Number))].filter((id) => validItemsById.has(id));

    if (cat.max_select !== null && cat.max_select !== undefined) {
      chosenIds = chosenIds.slice(0, cat.max_select);
    }

    chosenIds.forEach((itemId) => {
      const item = validItemsById.get(itemId);
      rowsToInsert.push({
        attempt_id: attemptId,
        category_id: cat.id,
        item_id: item.id,
        category: cat.name,
        item: item.name,
      });
    });
  }

  if (rowsToInsert.length) {
    const { error } = await supabase.from("attempt_packages").insert(rowsToInsert);
    if (error) throw error;
  }

  await supabase.from("attempts").update({ packages_confirmed: true }).eq("id", attemptId);
  return true;
}

export async function getPackageSelections(attemptId) {
  const { data } = await supabase
    .from("attempt_packages")
    .select("category, item")
    .eq("attempt_id", attemptId)
    .order("id");

  const result = {};
  (data || []).forEach((row) => {
    if (!result[row.category]) result[row.category] = [];
    if (!result[row.category].includes(row.item)) result[row.category].push(row.item);
  });
  return result;
}

export async function getPackageSelectionsBatch(attemptIds) {
  const result = {};
  attemptIds.forEach((id) => (result[id] = {}));
  if (!attemptIds.length) return result;

  const { data } = await supabase
    .from("attempt_packages")
    .select("attempt_id, category, item")
    .in("attempt_id", attemptIds);

  (data || []).forEach((row) => {
    if (!result[row.attempt_id]) result[row.attempt_id] = {};
    if (!result[row.attempt_id][row.category]) result[row.attempt_id][row.category] = [];
    if (!result[row.attempt_id][row.category].includes(row.item)) {
      result[row.attempt_id][row.category].push(row.item);
    }
  });
  return result;
}

// أدوات تعديل اختيارات طالب معين من لوحة الأدمن
export async function getAttemptPackagesDetailed(attemptId) {
  const { data, error } = await supabase
    .from("attempt_packages")
    .select("*")
    .eq("attempt_id", attemptId)
    .order("id");
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

export async function adminAddAttemptPackageItem(attemptId, categoryId, itemId) {
  const { data: cat } = await supabase.from("package_categories").select("name").eq("id", categoryId).maybeSingle();
  const { data: item } = await supabase.from("package_items").select("name").eq("id", itemId).maybeSingle();
  if (!cat || !item) throw new Error("قسم أو عنصر غير موجود");

  const { data, error } = await supabase
    .from("attempt_packages")
    .insert({ attempt_id: attemptId, category_id: categoryId, item_id: itemId, category: cat.name, item: item.name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function adminRemoveAttemptPackageItem(rowId) {
  const { error } = await supabase.from("attempt_packages").delete().eq("id", rowId);
  if (error) throw error;
  return true;
}

export async function deletePackageSelectionsByFilter(category, item, examId, churchName) {
  if (!item) throw new Error("يرجى تحديد النشاط أو الرياضة المراد حذفها");

  let query = supabase.from("attempts").select("id");
  if (examId) query = query.eq("exam_id", Number(examId));
  if (churchName && churchName.trim() !== "" && churchName !== "ALL") {
    query = query.eq("user_church", churchName.trim());
  }

  const { data: attempts, error: attErr } = await query;
  if (attErr) throw attErr;
  if (!attempts || !attempts.length) return 0;

  const attemptIds = attempts.map((a) => a.id);
  const CHUNK_SIZE = 200;
  let totalDeleted = 0;

  for (let i = 0; i < attemptIds.length; i += CHUNK_SIZE) {
    const chunk = attemptIds.slice(i, i + CHUNK_SIZE);
    let delQuery = supabase.from("attempt_packages").delete({ count: "exact" }).in("attempt_id", chunk).eq("item", item);
    if (category) delQuery = delQuery.eq("category", category);
    const { error: delErr, count } = await delQuery;
    if (delErr) throw delErr;
    totalDeleted += count || 0;
  }
  return totalDeleted;
}

// تجميع كل أسماء الأقسام والعناصر المستخدمة عبر كل الامتحانات (لقائمة الفلترة في لوحة الأدمن)
export async function getAllPackageItemsGrouped() {
  const { data: cats } = await supabase.from("package_categories").select("id, name");
  const { data: items } = await supabase.from("package_items").select("category_id, name");
  if (!cats || !items) return {};

  const catNameById = new Map(cats.map((c) => [c.id, c.name]));
  const grouped = {};
  items.forEach((it) => {
    const catName = catNameById.get(it.category_id);
    if (!catName) return;
    if (!grouped[catName]) grouped[catName] = new Set();
    grouped[catName].add(it.name);
  });

  const result = {};
  Object.entries(grouped).forEach(([cat, set]) => (result[cat] = [...set]));
  return result;
}

/* =======================================
   طباعة التقرير الكامل لكنيسة محددة
======================================= */
export async function getChurchPrintData(churchName) {
  if (!churchName || churchName.trim() === "") return null;

  const exams = await getAllExams();

  const { data: attempts, error } = await supabase
    .from("attempts")
    .select(
      "id, exam_id, user_name, user_church, user_phone, status, total_score, total_possible, percentage, grade_text, pass_fail, created_at",
    )
    .eq("user_church", churchName.trim())
    .in("status", ["submitted", "graded"])
    .order("user_name", { ascending: true });

  if (error) {
    console.error("Error fetching church print data:", error);
    return null;
  }

  const allAttempts = attempts || [];
  const attemptIds = allAttempts.map((a) => a.id);
  const selectionsBatch = await getPackageSelectionsBatch(attemptIds);

  let totalPassed = 0;
  let totalFailed = 0;

  const examMap = {};
  exams.forEach((exam) => {
    examMap[exam.id] = { exam, passed: [], failed: [] };
  });

  allAttempts.forEach((att) => {
    const pkgs = selectionsBatch[att.id] || {};
    const studentObj = { ...att, packages: pkgs };

    if (att.pass_fail === "pass") totalPassed++;
    else totalFailed++;

    if (examMap[att.exam_id]) {
      if (att.pass_fail === "pass") examMap[att.exam_id].passed.push(studentObj);
      else examMap[att.exam_id].failed.push(studentObj);
    } else {
      examMap[att.exam_id] = {
        exam: { id: att.exam_id, name: `امتحان رقم ${att.exam_id}` },
        passed: att.pass_fail === "pass" ? [studentObj] : [],
        failed: att.pass_fail === "fail" ? [studentObj] : [],
      };
    }
  });

  const activeExamsData = Object.values(examMap).filter((item) => item.passed.length > 0 || item.failed.length > 0);

  return {
    churchName: churchName.trim(),
    totalPassed,
    totalFailed,
    totalStudents: allAttempts.length,
    examsData: activeExamsData,
  };
}

/* =======================================
   إعدادات عامة (settings key/value)
======================================= */
export async function getSetting(key) {
  const { data } = await supabase.from("settings").select("setting_value").eq("setting_key", key).maybeSingle();
  return data?.setting_value ?? null;
}

export async function setSetting(key, value) {
  const { error } = await supabase
    .from("settings")
    .upsert({ setting_key: key, setting_value: String(value) }, { onConflict: "setting_key" });
  if (error) throw error;
  return true;
}
