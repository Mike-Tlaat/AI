// ============================================================
// نتائج لوحة التحكم — قائمة النتائج، الفلترة، والتفاصيل
// ============================================================

let adminResultsView = "all";

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
  const examId = document.getElementById("resultsExamFilter").value;
  let query = supabaseClient
    .from("attempts")
    .select("*, exams(title)")
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
  const search = document
    .getElementById("resultsSearch")
    .value.trim()
    .toLowerCase();
  const showAnswers =
    document.getElementById("showAnswersToggle").value === "show";

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

  document.getElementById("passCount").textContent = passRows.length;
  document.getElementById("failCount").textContent = failRows.length;

  document.getElementById("passTable").innerHTML = renderAttemptsTable(
    passRows,
    showAnswers,
    true,
  );
  document.getElementById("failTable").innerHTML = renderAttemptsTable(
    failRows,
    showAnswers,
    false,
  );
  setResultsView(adminResultsView);
}

function renderAttemptsTable(rows, showAnswers, isPass) {
  if (!rows.length) return '<span class="muted">لا يوجد نتائج مطابقة.</span>';
  return `
    <table>
      <thead><tr>
        <th>الاسم</th><th>رقم الهاتف</th><th>الامتحان</th><th>النتيجة</th><th>النسبة</th><th>التقدير</th><th>وقت التسليم</th><th></th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `
          <tr>
            <td>${escapeHtml(r.student_name)}</td>
            <td class="mono">${escapeHtml(r.student_phone)}</td>
            <td>${escapeHtml(r.exams?.title || "")}</td>
            <td class="mono">${r.score} / ${r.max_score}</td>
            <td class="mono"><span class="badge ${isPass ? "badge-success" : "badge-danger"}">${r.percentage.toFixed(1)}%</span></td>
            <td>${gradeLabelText(r.percentage)}</td>
            <td class="mono">${new Date(r.submitted_at).toLocaleString("ar-EG")}</td>
            <td style="display:flex; gap:6px;">
              <button class="btn btn-outline btn-sm" onclick='toggleDetail("${r.id}")'>${showAnswers ? "التفاصيل" : "—"}</button>
              <button class="btn btn-danger btn-sm" onclick='deleteAttempt("${r.id}", "${escapeAttr(r.student_name).replace(/"/g, "")}")'>حذف</button>
            </td>
          </tr>
          ${showAnswers ? `<tr id="detail-${r.id}" class="hidden"><td colspan="8">${renderAnswerDetail(r)}</td></tr>` : ""}
        `,
          )
          .join("")}
      </tbody>
    </table>`;
}

function toggleDetail(attemptId) {
  const row = document.getElementById("detail-" + attemptId);
  if (row) row.classList.toggle("hidden");
}

function renderAnswerDetail(attempt) {
  const answers = attempt.answers || [];
  if (!answers.length) return '<span class="muted">لا تفاصيل محفوظة.</span>';
  return `<div style="display:flex; flex-direction:column; gap:8px; padding:8px 0;">
    ${answers
      .map(
        (a, i) => `
      <div style="padding:8px 12px; background:rgba(255,255,255,0.03); border-radius:10px; border:1px solid var(--line);">
        <div style="font-weight:700; font-size:.85rem;">س${i + 1}: ${escapeHtml(a.question_text || "")}</div>
        <div class="muted" style="font-size:.8rem; margin-top:4px;">
          إجابة الطالب: <b>${escapeHtml(formatStudentAnswer(a))}</b> —
          <span class="badge ${a.is_correct ? "badge-success" : "badge-danger"}">${a.is_correct ? "صحيحة" : "خاطئة"}</span>
        </div>
      </div>`,
      )
      .join("")}
  </div>`;
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

document.addEventListener("DOMContentLoaded", () => setResultsView("all"));
