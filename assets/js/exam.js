// ============================================================
// منطق صفحة الامتحان — تفاعلي بالكامل + حفظ محلي + مؤقت + تسليم آمن
// ============================================================

const urlParams = new URLSearchParams(location.search);
const EXAM_ID = urlParams.get("exam");

let examData = null;
let questionsData = []; // with options/blanks
let sessionKey = null;
let session = null; // { name, phone, startTime, answers: {qid: value}, submitted }
let timerInterval = null;
let hasSubmitted = false;
let submissionInProgress = false;

function showScreen(id) {
  [
    "loadingScreen",
    "lockedScreen",
    "notFoundScreen",
    "alreadyDoneScreen",
    "startScreen",
    "examScreen",
    "resultScreen",
    "submittedHiddenScreen",
  ].forEach((s) =>
    document.getElementById(s).classList.toggle("hidden", s !== id),
  );
}

function showToast(msg) {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function scrollToQuestion(qId) {
  const card = document.getElementById("qcard-" + qId);
  if (!card) return;
  card.classList.add("question-card--focus");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  setTimeout(() => card.classList.remove("question-card--focus"), 2200);
}

async function init() {
  if (!EXAM_ID) {
    showScreen("notFoundScreen");
    return;
  }
  sessionKey = `exam_session_${EXAM_ID}`;

  const { data: exam, error: examErr } = await supabaseClient
    .from("exams")
    .select("*")
    .eq("id", EXAM_ID)
    .single();
  if (examErr || !exam) {
    showScreen("notFoundScreen");
    return;
  }
  examData = exam;

  if (exam.is_locked) {
    document.getElementById("lockedWhatsapp").href = whatsappLink(
      `أريد فتح امتحان "${exam.title}" من فضلك`,
    );
    showScreen("lockedScreen");
    return;
  }

  const { data: questions, error: qErr } = await supabaseClient
    .from("questions")
    .select("*, question_options(*), question_blanks(*)")
    .eq("exam_id", EXAM_ID)
    .order("order_index", { ascending: true });
  if (qErr) {
    showScreen("notFoundScreen");
    return;
  }

  questionsData = questions.map((q) => ({
    ...q,
    options: (q.question_options || []).sort(
      (a, b) => a.order_index - b.order_index,
    ),
    blanks: (q.question_blanks || []).sort(
      (a, b) => a.blank_index - b.blank_index,
    ),
  }));

  // resume session if exists
  const stored = localStorage.getItem(sessionKey);
  if (stored) {
    try {
      session = JSON.parse(stored);
      // verify not already submitted in DB under this phone (in case admin deleted or exam was completed elsewhere)
      const { data: existing } = await supabaseClient
        .from("attempts")
        .select("id")
        .eq("exam_id", EXAM_ID)
        .eq("student_phone", session.phone)
        .maybeSingle();
      if (existing) {
        localStorage.removeItem(sessionKey);
        showAlreadyDone();
        return;
      }
      renderExamScreen();
      return;
    } catch (e) {
      localStorage.removeItem(sessionKey);
    }
  }

  document.getElementById("examTitleStart").textContent = exam.title;
  document.getElementById("examMetaStart").textContent =
    `مدة الامتحان: ${exam.duration_minutes} دقيقة — عدد الأسئلة: ${questionsData.length}`;
  showScreen("startScreen");
}

function showAlreadyDone() {
  showScreen("alreadyDoneScreen");
}

async function startExam() {
  const name = document.getElementById("studentName").value.trim();
  const phone = document.getElementById("studentPhone").value.trim();
  const errEl = document.getElementById("startError");
  errEl.textContent = "";

  if (!name) {
    errEl.textContent = "من فضلك اكتب اسمك";
    return;
  }
  if (!phone || phone.length < 6) {
    errEl.textContent = "من فضلك اكتب رقم هاتف صحيح";
    return;
  }

  const { data: existing, error } = await supabaseClient
    .from("attempts")
    .select("id")
    .eq("exam_id", EXAM_ID)
    .eq("student_phone", phone)
    .maybeSingle();
  if (error) {
    errEl.textContent = "تعذر التحقق، حاول مرة أخرى";
    return;
  }
  if (existing) {
    showAlreadyDone();
    return;
  }

  session = { name, phone, startTime: Date.now(), answers: {} };
  localStorage.setItem(sessionKey, JSON.stringify(session));
  renderExamScreen();
}

function saveSession() {
  localStorage.setItem(sessionKey, JSON.stringify(session));
}

function renderExamScreen() {
  document.getElementById("examTitleBar").textContent = examData.title;
  document.getElementById("totalCount").textContent = questionsData.length;
  showScreen("examScreen");
  renderQuestions();
  updateProgress();
  startTimer();
}

function renderQuestions() {
  const host = document.getElementById("questionsHost");
  host.innerHTML = questionsData
    .map((q, i) => {
      const answered = isAnswered(q);
      let body = "";
      if (q.question_type === "true_false" || q.question_type === "mcq") {
        body = `<div class="option-list">
        ${q.options
          .map((o) => {
            const selected = session.answers[q.id] === o.id;
            return `<label class="option-item ${selected ? "selected" : ""}">
            <input type="radio" name="q-${q.id}" ${selected ? "checked" : ""} onchange="setAnswer('${q.id}', '${o.id}')">
            <span>${escapeHtml(o.option_text)}</span>
          </label>`;
          })
          .join("")}
      </div>`;
      } else {
        const blankVals = session.answers[q.id] || [];
        body = q.blanks
          .map(
            (b, idx) => `
        <div class="blank-input-row field">
          <label>الفراغ رقم ${idx + 1}</label>
          <input type="text" value="${escapeAttr(blankVals[idx] || "")}" oninput="setBlankAnswer('${q.id}', ${idx}, this.value, ${q.blanks.length})">
        </div>`,
          )
          .join("");
      }
      return `
      <div class="question-card ${answered ? "answered" : ""}" id="qcard-${q.id}">
        <div class="q-header">
          <span class="num-badge">${i + 1}</span>
          <div style="flex:1; display:flex; justify-content:space-between; gap:10px;">
            <div class="q-text">${escapeHtml(q.question_text)}</div>
            <div class="q-points">${q.points} درجة</div>
          </div>
        </div>
        ${body}
      </div>`;
    })
    .join("");
}

function isAnswered(q) {
  const val = session.answers[q.id];
  if (q.question_type === "fill")
    return (
      Array.isArray(val) &&
      val.length === q.blanks.length &&
      val.every((v) => (v || "").trim() !== "")
    );
  return val !== undefined && val !== null && val !== "";
}

function setAnswer(qId, optionId) {
  session.answers[qId] = optionId;
  saveSession();
  refreshCardState(qId);
  updateProgress();
}

function setBlankAnswer(qId, idx, val, totalBlanks) {
  if (!Array.isArray(session.answers[qId]))
    session.answers[qId] = new Array(totalBlanks).fill("");
  session.answers[qId][idx] = val;
  saveSession();
  refreshCardState(qId);
  updateProgress();
}

function refreshCardState(qId) {
  const q = questionsData.find((x) => x.id === qId);
  const card = document.getElementById("qcard-" + qId);
  if (!card) return;
  card.classList.toggle("answered", isAnswered(q));
  if (q.question_type !== "fill") {
    card.querySelectorAll(".option-item").forEach((el, idx) => {
      el.classList.toggle(
        "selected",
        q.options[idx].id === session.answers[qId],
      );
    });
  }
}

function updateProgress() {
  const total = questionsData.length;
  const answered = questionsData.filter(isAnswered).length;
  const pct = total ? Math.round((answered / total) * 100) : 0;
  document.getElementById("answeredCount").textContent = answered;
  document.getElementById("progressFill").style.width = pct + "%";
  document.getElementById("progressPct").textContent = pct + "%";
}

// ---------- Timer (client-side, based on stored startTime) ----------
function startTimer() {
  const endTime = session.startTime + examData.duration_minutes * 60 * 1000;
  timerInterval = setInterval(() => {
    const remainingMs = endTime - Date.now();
    const box = document.getElementById("timerBox");
    if (remainingMs <= 0) {
      document.getElementById("timerText").textContent = "00:00";
      clearInterval(timerInterval);
      showToast("انتهى الوقت، جارِ تسليم الامتحان تلقائيًا");
      submitExam(true);
      return;
    }
    const totalSec = Math.floor(remainingMs / 1000);
    const min = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, "0");
    const sec = (totalSec % 60).toString().padStart(2, "0");
    document.getElementById("timerText").textContent = `${min}:${sec}`;
    box.classList.toggle("warn", remainingMs < 60 * 1000);
  }, 500);
}

// ---------- Submit (single-shot to DB, with anti-double-click and staggered retry) ----------
async function submitExam(auto) {
  if (hasSubmitted || submissionInProgress) return;
  const btn = document.getElementById("submitBtn");
  const statusEl = document.getElementById("submitStatus");

  if (!auto) {
    const unansweredQuestions = questionsData.filter((q) => !isAnswered(q));
    if (unansweredQuestions.length > 0) {
      const firstQuestion = unansweredQuestions[0];
      await showAlert(
        "لا يمكن تسليم الامتحان قبل حل كل الأسئلة. ارجع للسؤال المظلل بالأحمر وأكمل الإجابة.",
        "سؤال غير مكتمل",
      );
      scrollToQuestion(firstQuestion.id);
      return;
    }

    submissionInProgress = true;
    const confirmed = await showConfirm(
      `أنت الآن على وشك تسليم الامتحان بعد حل كل الأسئلة. بعد التأكيد لن تتمكن من التسليم مرة أخرى.`,
      "مراجعة نهائية",
      "تأكيد التسليم",
      "العودة للمراجعة",
    );
    if (!confirmed) {
      submissionInProgress = false;
      return;
    }
  } else {
    submissionInProgress = true;
  }

  hasSubmitted = true;
  btn.disabled = true;
  btn.textContent = "جارِ التسليم...";
  clearInterval(timerInterval);

  let gradedTotal = 0,
    maxTotal = 0;
  const answerDetails = questionsData.map((q) => {
    const result = gradeQuestion(q, session.answers[q.id]);
    gradedTotal += result.earned;
    maxTotal += result.max;
    const detail = {
      question_id: q.id,
      question_text: q.question_text,
      type: q.question_type,
      is_correct: result.is_correct,
    };
    if (q.question_type === "fill") {
      detail.blank_results = result.blank_results;
    } else {
      const chosen = q.options.find((o) => o.id === session.answers[q.id]);
      detail.selected_text = chosen ? chosen.option_text : null;
    }
    return detail;
  });

  const percentage =
    maxTotal > 0 ? Math.round((gradedTotal / maxTotal) * 10000) / 100 : 0;
  const isPassed = percentage >= Number(examData.pass_percentage || 50);

  const payload = {
    exam_id: EXAM_ID,
    student_name: session.name,
    student_phone: session.phone,
    score: gradedTotal,
    max_score: maxTotal,
    percentage,
    is_passed: isPassed,
    answers: answerDetails,
  };

  let queueToken = null;
  try {
    queueToken = await joinSubmissionQueue(statusEl);
    statusEl.textContent = "جارِ إرسال الامتحان...";

    const success = await insertWithRetry(payload, statusEl);
    if (!success.ok) {
      if (success.duplicate) {
        localStorage.removeItem(sessionKey);
        submissionInProgress = false;
        if (queueToken) await releaseSubmissionQueue(queueToken);
        showAlreadyDone();
        return;
      }
      throw new Error(
        "تعذر إرسال الامتحان، برجاء التأكد من الاتصال والمحاولة مجددًا",
      );
    }

    localStorage.removeItem(sessionKey);

    if (examData.show_results_auto) {
      showResult(percentage, isPassed, gradedTotal, maxTotal);
    } else {
      showScreen("submittedHiddenScreen");
    }
    submissionInProgress = false;
  } catch (err) {
    statusEl.textContent = err.message || "تعذر إرسال الامتحان، حاول مرة أخرى";
    btn.disabled = false;
    btn.textContent = "تسليم الامتحان";
    hasSubmitted = false;
    submissionInProgress = false;
    if (queueToken) await releaseSubmissionQueue(queueToken);
    return;
  }

  if (queueToken) await releaseSubmissionQueue(queueToken);
}

async function joinSubmissionQueue(statusEl) {
  const queueToken = session.queueToken || crypto.randomUUID();
  session.queueToken = queueToken;
  saveSession();

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();
  const { error: queueInsertError } = await supabaseClient
    .from("submission_queue")
    .upsert(
      {
        queue_token: queueToken,
        exam_id: EXAM_ID,
        student_phone: session.phone,
        student_name: session.name,
        created_at: createdAt,
        expires_at: expiresAt,
      },
      { onConflict: "queue_token" },
    );
  if (queueInsertError) throw queueInsertError;

  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const { error: cleanupError } = await supabaseClient
      .from("submission_queue")
      .delete()
      .lt("expires_at", new Date().toISOString());
    if (cleanupError) console.warn(cleanupError);

    const { data: rows, error } = await supabaseClient
      .from("submission_queue")
      .select("queue_token, created_at")
      .eq("exam_id", EXAM_ID)
      .gte("expires_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .order("queue_token", { ascending: true })
      .limit(1);
    if (error) throw error;

    if (rows && rows[0] && rows[0].queue_token === queueToken)
      return queueToken;
    if (statusEl) statusEl.textContent = "جارٍ انتظار دورك في التسليم...";
    await new Promise((resolve) =>
      setTimeout(resolve, 1200 + Math.random() * 600),
    );
  }

  throw new Error("انتهت مهلة انتظار دور التسليم");
}

async function releaseSubmissionQueue(queueToken) {
  if (!queueToken) return;
  await supabaseClient
    .from("submission_queue")
    .delete()
    .eq("queue_token", queueToken);
}

async function insertWithRetry(payload, statusEl, attempt = 1) {
  try {
    const { error } = await supabaseClient.from("attempts").insert(payload);
    if (error) {
      if (error.code === "23505") return { ok: false, duplicate: true };
      throw error;
    }
    return { ok: true };
  } catch (err) {
    if (attempt >= 4) return { ok: false };
    if (statusEl) statusEl.textContent = `إعادة المحاولة... (${attempt})`;
    await new Promise((r) =>
      setTimeout(r, attempt * 1200 + Math.random() * 800),
    );
    return insertWithRetry(payload, statusEl, attempt + 1);
  }
}

function showResult(percentage, isPassed, score, maxScore) {
  showScreen("resultScreen");
  const pctEl = document.getElementById("resultPct");
  pctEl.textContent = percentage.toFixed(1) + "%";
  pctEl.classList.add(isPassed ? "pass" : "fail");
  document.getElementById("resultGrade").textContent = isPassed
    ? `${gradeLabelText(percentage)} — ناجح`
    : "غير ناجح";
  document.getElementById("resultDetail").textContent =
    `درجتك: ${score} من ${maxScore}`;
}

function escapeHtml(s) {
  return (s || "").toString().replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}
function escapeAttr(s) {
  return escapeHtml(s);
}

init();
