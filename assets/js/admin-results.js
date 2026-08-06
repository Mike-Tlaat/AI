// ============================================================
// نتائج لوحة التحكم — قائمة النتائج، الفلترة، والتفاصيل
// ============================================================

let adminResultsView = "all";
const answerDetailsCache = new Map();
let resultsSearchDebounce = null;

function hasElement(id) {
  return !!document.getElementById(id);
}

function getEffectiveAnswerCorrect(answer) {
  return typeof answer.admin_override_correct === "boolean"
    ? answer.admin_override_correct
    : !!answer.is_correct;
}

function getAnswerSummaryBadge(answer) {
  const effectiveCorrect = getEffectiveAnswerCorrect(answer);
  return `<span class="badge ${effectiveCorrect ? "badge-success" : "badge-danger"}">${effectiveCorrect ? "صحيحة" : "خاطئة"}</span>`;
}

async function populateExamFilter() {
  const { data, error } = await supabaseClient
    .from("exams")
    .select("id,title")
    .order("created_at", { ascending: false });
  if (error) return;
  const sel = document.getElementById("resultsExamFilter");
  const current = sel.value;
  sel.innerHTML =
    `<option value="">كل الامتحانات</option>` +
    data
      .map((e) => `<option value="${e.id}">${escapeHtml(e.title)}</option>`)
      .join("");
  sel.value = current;
}

async function loadResults() {
  const filterEl = document.getElementById("resultsExamFilter");
  const examId = filterEl ? filterEl.value : "";
  let query = supabaseClient
    .from("attempts")
    .select(
      "id, exam_id, student_name, student_phone, score, max_score, percentage, is_passed, submitted_at, exams(title)",
    )
    .order("submitted_at", { ascending: false });
  if (examId) query = query.eq("exam_id", examId);
  const { data, error } = await query;
  if (error) {
    document.getElementById("passTable").innerHTML = "تعذر التحميل";
    document.getElementById("failTable").innerHTML = "تعذر التحميل";
    return;
  }
  allAttemptsCache = data;
  renderResultsTables();
}

function setResultsView(view) {
  adminResultsView = view;
  const passWrap = document.getElementById("passResultsCard");
  const failWrap = document.getElementById("failResultsCard");
  if (!passWrap || !failWrap) return;

  passWrap.classList.toggle("hidden", view === "fail");
  failWrap.classList.toggle("hidden", view === "pass");
  document.querySelectorAll("[data-result-filter]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.resultFilter === view);
  });
}

function renderResultsTables() {
  const searchEl = document.getElementById("resultsSearch");
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const showAnswersEl = document.getElementById("showAnswersToggle");
  const showAnswers = !showAnswersEl || showAnswersEl.value === "show";

  let rows = allAttemptsCache;
  if (search) {
    rows = rows.filter(
      (r) =>
        r.student_name.toLowerCase().includes(search) ||
        r.student_phone.includes(search),
    );
  }

  const passRows = rows.filter((r) => r.is_passed);
  const failRows = rows.filter((r) => !r.is_passed);

  const passCount = document.getElementById("passCount");
  const failCount = document.getElementById("failCount");
  if (passCount) passCount.textContent = passRows.length;
  if (failCount) failCount.textContent = failRows.length;

  const passTable = document.getElementById("passTable");
  if (passTable) {
    passTable.innerHTML = renderAttemptsTable(passRows, showAnswers, true);
  }
  const failTable = document.getElementById("failTable");
  if (failTable) {
    failTable.innerHTML = renderAttemptsTable(failRows, showAnswers, false);
  }
  setResultsView(adminResultsView);
}

function renderAttemptsTable(rows, showAnswers, isPass) {
  if (!rows.length) return '<span class="muted">لا يوجد نتائج مطابقة.</span>';
  return `
    <div class="results-table-wrap">
    <table class="results-table">
      <thead><tr>
        <th>الاسم</th><th>رقم الهاتف</th><th>الامتحان</th><th>النتيجة</th><th>النسبة</th><th>التقدير</th><th>وقت التسليم</th><th></th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td data-label="الاسم">${escapeHtml(r.student_name)}</td>
            <td data-label="رقم الهاتف" class="mono">${escapeHtml(r.student_phone)}</td>
            <td data-label="الامتحان">${escapeHtml(r.exams?.title || "")}</td>
            <td data-label="النتيجة" class="mono">${r.score} / ${r.max_score}</td>
            <td data-label="النسبة" class="mono"><span class="badge ${isPass ? "badge-success" : "badge-danger"}">${r.percentage.toFixed(1)}%</span></td>
            <td data-label="التقدير">${gradeLabelText(r.percentage)}</td>
            <td data-label="وقت التسليم" class="mono">${new Date(r.submitted_at).toLocaleString("ar-EG")}</td>
            <td class="actions-cell">
              <button class="btn btn-outline btn-sm" ${showAnswers ? "" : "disabled"} onclick='toggleDetail("${r.id}")'>${showAnswers ? "التفاصيل" : "تفاصيل مقفولة"}</button>
              <button class="btn btn-danger btn-sm" onclick='deleteAttempt("${r.id}", "${escapeAttr(r.student_name).replace(/"/g, "")}")'>حذف</button>
            </td>
          </tr>${showAnswers ? `<tr id="detail-${r.id}" class="hidden detail-row"><td colspan="8"><span class="muted">اضغط "التفاصيل" لعرض إجابات الطالب.</span></td></tr>` : ""}
        `,
          )
          .join("")}
      </tbody>
    </table>
    </div>`;
}

async function toggleDetail(attemptId) {
  const row = document.getElementById("detail-" + attemptId);
  if (!row) return;

  if (row.dataset.loaded !== "1") {
    row.classList.remove("hidden");
    row.innerHTML = `<td colspan="8"><span class="muted">جارِ تحميل الإجابات...</span></td>`;
    const details = await getAttemptAnswers(attemptId);
    row.innerHTML = `<td colspan="8">${renderAnswerDetail(details, attemptId)}</td>`;
    row.dataset.loaded = "1";
    return;
  }

  row.classList.toggle("hidden");
}

function renderAnswerDetail(answers, attemptId) {
  if (!answers.length) return '<span class="muted">لا تفاصيل محفوظة.</span>';
  return `<div class="answer-detail-list">
    ${answers
      .map(
        (a, i) => `
      <div class="answer-detail-card">
        <div class="answer-detail-question">س${i + 1}: ${escapeHtml(a.question_text || "")}</div>
        <div class="answer-detail-meta">
          إجابة الطالب: <span class="answer-inline-value">${escapeHtml(formatStudentAnswer(a))}</span> —
          ${getAnswerSummaryBadge(a)}
          ${typeof a.admin_override_correct === "boolean" ? '<span class="badge badge-neutral">مصححة يدويًا</span>' : ""}
        </div>
        ${
          a.type === "fill" &&
          Array.isArray(a.blank_results) &&
          a.blank_results.length
            ? `
          <div class="answer-detail-blanks">
            ${a.blank_results
              .map(
                (b, blankIndex) => `
                  <div class="answer-detail-blank">
                    <div>الفراغ ${blankIndex + 1}: <span class="answer-inline-value">${escapeHtml(b.given || "—")}</span></div>
                    <div class="muted">الصحيح: ${escapeHtml(b.correct_answer || "")}</div>
                    <span class="badge ${b.is_correct ? "badge-success" : "badge-danger"}">${b.is_correct ? "صحيح" : "خطأ"}</span>
                  </div>
                `,
              )
              .join("")}
          </div>
        `
            : ""
        }
        <div class="answer-detail-actions">
          <button type="button" class="btn btn-outline btn-sm" onclick='toggleAnswerOverride("${attemptId}", "${a.question_id}", ${getEffectiveAnswerCorrect(a) ? "false" : "true"})'>${getEffectiveAnswerCorrect(a) ? "اعتبارها خاطئة" : "اعتبارها صحيحة"}</button>
        </div>
      </div>`,
      )
      .join("")}
  </div>`;
}

async function getAttemptAnswers(attemptId) {
  if (answerDetailsCache.has(attemptId))
    return answerDetailsCache.get(attemptId);
  const { data, error } = await supabaseClient
    .from("attempts")
    .select("answers")
    .eq("id", attemptId)
    .maybeSingle();
  if (error || !data) return [];
  const answers = Array.isArray(data.answers) ? data.answers : [];
  answerDetailsCache.set(attemptId, answers);
  return answers;
}

async function toggleAnswerOverride(attemptId, questionId, newValue) {
  const answers = await getAttemptAnswers(attemptId);
  const target = answers.find(
    (answer) => String(answer.question_id) === String(questionId),
  );
  if (!target) return;

  target.admin_override_correct = newValue;
  const { error } = await supabaseClient
    .from("attempts")
    .update({ answers })
    .eq("id", attemptId);

  if (error) {
    showToast("تعذر حفظ التعديل اليدوي");
    return;
  }

  answerDetailsCache.set(attemptId, answers);
  const row = document.getElementById("detail-" + attemptId);
  if (row) {
    row.innerHTML = `<td colspan="8">${renderAnswerDetail(answers, attemptId)}</td>`;
    row.dataset.loaded = "1";
  }
  showToast("تم تحديث حكم الإجابة");
}

function debouncedResultsSearch() {
  clearTimeout(resultsSearchDebounce);
  resultsSearchDebounce = setTimeout(() => {
    renderResultsTables();
  }, 220);
}

function formatStudentAnswer(a) {
  if (a.type === "fill") {
    return (a.blank_results || []).map((b) => b.given || "—").join(" / ");
  }
  return a.selected_text || "—";
}

async function deleteAttempt(attemptId, name) {
  if (
    !(await showConfirmDialog(
      `تأكيد حذف نتيجة "${name}"؟ سيتمكن الطالب من الامتحان مرة أخرى بنفس الرقم.`,
      "حذف نتيجة",
    ))
  )
    return;
  const { error } = await supabaseClient
    .from("attempts")
    .delete()
    .eq("id", attemptId);
  if (error) return showToast("تعذر الحذف");
  showToast("تم حذف النتيجة، يمكن للطالب الامتحان مرة أخرى");
  loadResults();
}

document.addEventListener("DOMContentLoaded", () => {
  setResultsView("all");
  const searchInput = document.getElementById("resultsSearch");
  if (searchInput) {
    searchInput.removeAttribute("oninput");
    searchInput.addEventListener("input", debouncedResultsSearch);
  }
});
