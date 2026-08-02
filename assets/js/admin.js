// ============================================================
// لوحة التحكم — منطق الإدارة الكامل
// ============================================================

let builderQuestions = []; // { localId, type, text, points, options:[{text,correct}], blankAnswers:[...] }
let qCounter = 0;
let allExamsCache = [];
let allAttemptsCache = [];

function showToast(msg) {
  const host = document.getElementById("toastHost");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- Tabs ----------
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach(p => p.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
    if (btn.dataset.tab === "exams") loadExams();
    if (btn.dataset.tab === "results") { populateExamFilter(); loadResults(); }
  });
});

// ---------- Question Builder ----------
function addQuestion(type) {
  qCounter++;
  builderQuestions.push({
    localId: qCounter,
    type,
    text: "",
    points: 1,
    options: type === "true_false"
      ? [{ text: "صح", correct: true }, { text: "غلط", correct: false }]
      : type === "mcq"
        ? [{ text: "", correct: true }, { text: "", correct: false }]
        : [],
    blankAnswers: [],
  });
  renderBuilder();
}

function removeQuestion(localId) {
  builderQuestions = builderQuestions.filter(q => q.localId !== localId);
  renderBuilder();
}

function updateQText(localId, val) {
  const q = builderQuestions.find(x => x.localId === localId);
  q.text = val;
  if (q.type === "fill") {
    const blanksCount = (val.match(/___/g) || []).length;
    while (q.blankAnswers.length < blanksCount) q.blankAnswers.push("");
    while (q.blankAnswers.length > blanksCount) q.blankAnswers.pop();
    renderBuilder();
  }
}

function updateQPoints(localId, val) {
  builderQuestions.find(x => x.localId === localId).points = parseFloat(val) || 1;
}

function updateOptionText(localId, idx, val) {
  builderQuestions.find(x => x.localId === localId).options[idx].text = val;
}

function setCorrectOption(localId, idx) {
  const q = builderQuestions.find(x => x.localId === localId);
  q.options.forEach((o, i) => o.correct = (i === idx));
  renderBuilder();
}

function addOption(localId) {
  const q = builderQuestions.find(x => x.localId === localId);
  q.options.push({ text: "", correct: false });
  renderBuilder();
}

function removeOption(localId, idx) {
  const q = builderQuestions.find(x => x.localId === localId);
  q.options.splice(idx, 1);
  if (!q.options.some(o => o.correct) && q.options.length) q.options[0].correct = true;
  renderBuilder();
}

function updateBlankAnswer(localId, idx, val) {
  builderQuestions.find(x => x.localId === localId).blankAnswers[idx] = val;
}

function renderBuilder() {
  const host = document.getElementById("questionsBuilder");
  const noMsg = document.getElementById("noQuestionsMsg");
  noMsg.classList.toggle("hidden", builderQuestions.length > 0);
  host.innerHTML = builderQuestions.map((q, i) => {
    const typeLabel = q.type === "true_false" ? "صح / غلط" : q.type === "mcq" ? "اختيار من متعدد" : "أكمل الفراغ";
    let body = "";
    if (q.type === "true_false" || q.type === "mcq") {
      body = `<div class="option-list" style="margin-right:0; margin-top:10px;">
        ${q.options.map((o, idx) => `
          <div class="option-item ${o.correct ? 'selected' : ''}">
            <input type="radio" name="correct-${q.localId}" ${o.correct ? "checked" : ""} onchange="setCorrectOption(${q.localId}, ${idx})">
            <input type="text" value="${escapeAttr(o.text)}" placeholder="نص الاختيار"
              ${q.type === 'true_false' ? 'readonly' : ''}
              oninput="updateOptionText(${q.localId}, ${idx}, this.value)" style="flex:1; border:none; background:transparent; padding:4px;">
            ${q.type === 'mcq' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="removeOption(${q.localId}, ${idx})">✕</button>` : ""}
          </div>`).join("")}
        ${q.type === 'mcq' ? `<button type="button" class="btn btn-outline btn-sm" style="align-self:flex-start" onclick="addOption(${q.localId})">+ إضافة اختيار</button>` : ""}
      </div>`;
    } else {
      body = `<div class="mt-8">
        <div class="answer-key-note">ضع علامة <b>___</b> (ثلاث شرطات سفلية) في مكان كل فراغ داخل نص السؤال، وسيظهر تحته حقل إجابة لكل فراغ بالترتيب.</div>
        <div class="mt-8" style="margin-right:0; display:flex; flex-direction:column; gap:8px;">
        ${q.blankAnswers.map((ans, idx) => `
          <div class="field" style="margin-bottom:0;">
            <label>الإجابة الصحيحة للفراغ رقم ${idx + 1}</label>
            <input type="text" value="${escapeAttr(ans)}" oninput="updateBlankAnswer(${q.localId}, ${idx}, this.value)">
          </div>`).join("") || '<span class="muted">لم يتم إضافة علامة ___ بعد داخل النص.</span>'}
        </div>
      </div>`;
    }
    return `
      <div class="question-card">
        <div class="q-header">
          <span class="num-badge">${i + 1}</span>
          <div style="flex:1;">
            <div class="flex-between">
              <span class="badge badge-neutral">${typeLabel}</span>
              <div style="display:flex; align-items:center; gap:8px;">
                <label style="margin:0; font-size:.78rem;">الدرجة</label>
                <input type="number" min="0.5" step="0.5" value="${q.points}" style="width:70px; padding:6px 8px;"
                  oninput="updateQPoints(${q.localId}, this.value)">
                <button type="button" class="btn btn-ghost btn-sm" onclick="removeQuestion(${q.localId})">✕ حذف</button>
              </div>
            </div>
            <div class="field mt-8" style="margin-bottom:0;">
              <textarea rows="2" placeholder="نص السؤال" oninput="updateQText(${q.localId}, this.value)">${escapeHtml(q.text)}</textarea>
            </div>
          </div>
        </div>
        ${body}
      </div>`;
  }).join("");
}

function escapeHtml(s) { return (s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function escapeAttr(s) { return escapeHtml(s); }

// ---------- Save exam ----------
async function saveExam() {
  const title = document.getElementById("examTitle").value.trim();
  const duration = parseInt(document.getElementById("examDuration").value, 10);
  const passPct = parseFloat(document.getElementById("examPassPct").value);
  const autoShow = document.getElementById("examAutoShow").value === "true";
  const statusEl = document.getElementById("builderStatus");

  if (!title) return showToast("من فضلك اكتب اسم الامتحان");
  if (!duration || duration <= 0) return showToast("من فضلك اكتب مدة صحيحة");
  if (builderQuestions.length === 0) return showToast("أضف سؤالًا واحدًا على الأقل");

  for (const q of builderQuestions) {
    if (!q.text.trim()) return showToast("يوجد سؤال بدون نص");
    if ((q.type === "mcq" || q.type === "true_false") && !q.options.some(o => o.correct)) {
      return showToast("حدد الإجابة الصحيحة لكل سؤال اختيار");
    }
    if ((q.type === "mcq" || q.type === "true_false") && q.options.some(o => !o.text.trim())) {
      return showToast("أكمل نص كل الاختيارات");
    }
    if (q.type === "fill" && q.blankAnswers.length === 0) {
      return showToast("ضع علامة ___ للفراغ داخل نص سؤال الإكمال");
    }
    if (q.type === "fill" && q.blankAnswers.some(a => !a.trim())) {
      return showToast("اكتب الإجابة الصحيحة لكل فراغ");
    }
  }

  const saveBtn = document.getElementById("saveExamBtn");
  saveBtn.disabled = true;
  statusEl.textContent = "جارِ الحفظ...";

  try {
    const { data: exam, error: examErr } = await supabaseClient.from("exams").insert({
      title, duration_minutes: duration, pass_percentage: passPct, show_results_auto: autoShow, is_locked: false,
    }).select().single();
    if (examErr) throw examErr;

    for (let i = 0; i < builderQuestions.length; i++) {
      const q = builderQuestions[i];
      const { data: qRow, error: qErr } = await supabaseClient.from("questions").insert({
        exam_id: exam.id, order_index: i, question_text: q.text, question_type: q.type, points: q.points,
      }).select().single();
      if (qErr) throw qErr;

      if (q.type === "mcq" || q.type === "true_false") {
        const optsPayload = q.options.map((o, idx) => ({
          question_id: qRow.id, option_text: o.text, is_correct: o.correct, order_index: idx,
        }));
        const { error: oErr } = await supabaseClient.from("question_options").insert(optsPayload);
        if (oErr) throw oErr;
      } else {
        const blanksPayload = q.blankAnswers.map((ans, idx) => ({
          question_id: qRow.id, blank_index: idx, correct_answer: ans,
        }));
        const { error: bErr } = await supabaseClient.from("question_blanks").insert(blanksPayload);
        if (bErr) throw bErr;
      }
    }

    showToast("تم حفظ الامتحان بنجاح ✅");
    statusEl.textContent = "";
    builderQuestions = [];
    document.getElementById("examTitle").value = "";
    document.getElementById("examDuration").value = "30";
    document.getElementById("examPassPct").value = "50";
    renderBuilder();
    document.querySelector('.tab-btn[data-tab="exams"]').click();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "حدث خطأ أثناء الحفظ";
    showToast("خطأ: " + (err.message || "تعذر الحفظ"));
  } finally {
    saveBtn.disabled = false;
  }
}

// ---------- Exams list ----------
async function loadExams() {
  const host = document.getElementById("examsList");
  host.innerHTML = "جارِ التحميل...";
  const { data, error } = await supabaseClient.from("exams").select("*").order("created_at", { ascending: false });
  if (error) { host.innerHTML = "تعذر تحميل الامتحانات."; return; }
  allExamsCache = data;
  if (!data.length) { host.innerHTML = '<span class="muted">لا يوجد امتحانات بعد. أنشئ أول امتحان من تبويب "إنشاء امتحان جديد".</span>'; return; }

  const baseUrl = location.href.replace(/mike213talaat510admin\.html.*$/, "");

  host.innerHTML = data.map(exam => {
    const examLink = `${baseUrl}exam.html?exam=${exam.id}`;
    const resultsLink = `${baseUrl}results.html?exam=${exam.id}`;
    return `
    <div class="exam-link-row" style="flex-direction:column; align-items:stretch;">
      <div class="flex-between">
        <div>
          <div class="title">${escapeHtml(exam.title)}</div>
          <div class="meta">المدة: ${exam.duration_minutes} دقيقة · النجاح من ${exam.pass_percentage}%</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <span class="badge ${exam.is_locked ? "badge-locked" : "badge-open"}">${exam.is_locked ? "مقفول" : "متاح"}</span>
          <span class="badge badge-neutral">${exam.show_results_auto ? "النتيجة تلقائية" : "النتيجة عند الاستعلام"}</span>
        </div>
      </div>
      <div class="copy-input">
        <input type="text" readonly value="${examLink}" onclick="this.select()">
        <button class="btn btn-outline btn-sm" onclick="copyText('${examLink}')">نسخ لينك الامتحان</button>
      </div>
      <div class="copy-input">
        <input type="text" readonly value="${resultsLink}" onclick="this.select()">
        <button class="btn btn-outline btn-sm" onclick="copyText('${resultsLink}')">نسخ لينك الاستعلام عن النتيجة</button>
      </div>
      <div class="flex-between mt-8">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn btn-sm ${exam.is_locked ? "btn-primary" : "btn-outline"}" onclick="toggleLock('${exam.id}', ${!exam.is_locked})">
            ${exam.is_locked ? "فتح الامتحان" : "قفل الامتحان"}
          </button>
          <button class="btn btn-sm btn-outline" onclick="toggleAutoShow('${exam.id}', ${!exam.show_results_auto})">
            ${exam.show_results_auto ? "إخفاء النتيجة بعد التسليم" : "إظهار النتيجة تلقائيًا"}
          </button>
        </div>
        <button class="btn btn-sm btn-danger" onclick="deleteExam('${exam.id}', '${escapeAttr(exam.title).replace(/'/g, "\\'")}')">حذف الامتحان</button>
      </div>
    </div>`;
  }).join("");
}

function copyText(txt) {
  navigator.clipboard.writeText(txt).then(() => showToast("تم النسخ"));
}

async function toggleLock(examId, newVal) {
  const { error } = await supabaseClient.from("exams").update({ is_locked: newVal }).eq("id", examId);
  if (error) return showToast("تعذر التحديث");
  showToast(newVal ? "تم قفل الامتحان" : "تم فتح الامتحان");
  loadExams();
}

async function toggleAutoShow(examId, newVal) {
  const { error } = await supabaseClient.from("exams").update({ show_results_auto: newVal }).eq("id", examId);
  if (error) return showToast("تعذر التحديث");
  showToast("تم تحديث إعداد إظهار النتيجة");
  loadExams();
}

async function deleteExam(examId, title) {
  if (!confirm(`تأكيد حذف الامتحان "${title}"؟ سيتم حذف كل أسئلته ونتائج الطلاب فيه ولا يمكن التراجع.`)) return;
  const { error } = await supabaseClient.from("exams").delete().eq("id", examId);
  if (error) return showToast("تعذر الحذف");
  showToast("تم حذف الامتحان");
  loadExams();
}

// ---------- Results ----------
async function populateExamFilter() {
  const { data, error } = await supabaseClient.from("exams").select("id,title").order("created_at", { ascending: false });
  if (error) return;
  const sel = document.getElementById("resultsExamFilter");
  const current = sel.value;
  sel.innerHTML = `<option value="">كل الامتحانات</option>` +
    data.map(e => `<option value="${e.id}">${escapeHtml(e.title)}</option>`).join("");
  sel.value = current;
}

async function loadResults() {
  const examId = document.getElementById("resultsExamFilter").value;
  let query = supabaseClient.from("attempts").select("*, exams(title)").order("submitted_at", { ascending: false });
  if (examId) query = query.eq("exam_id", examId);
  const { data, error } = await query;
  if (error) { document.getElementById("passTable").innerHTML = "تعذر التحميل"; return; }
  allAttemptsCache = data;
  renderResultsTables();
}

function renderResultsTables() {
  const search = document.getElementById("resultsSearch").value.trim().toLowerCase();
  const showAnswers = document.getElementById("showAnswersToggle").value === "show";

  let rows = allAttemptsCache;
  if (search) {
    rows = rows.filter(r => r.student_name.toLowerCase().includes(search) || r.student_phone.includes(search));
  }

  const passRows = rows.filter(r => r.is_passed);
  const failRows = rows.filter(r => !r.is_passed);

  document.getElementById("passCount").textContent = passRows.length;
  document.getElementById("failCount").textContent = failRows.length;

  document.getElementById("passTable").innerHTML = renderAttemptsTable(passRows, showAnswers, true);
  document.getElementById("failTable").innerHTML = renderAttemptsTable(failRows, showAnswers, false);
}

function renderAttemptsTable(rows, showAnswers, isPass) {
  if (!rows.length) return '<span class="muted">لا يوجد نتائج مطابقة.</span>';
  return `
    <table>
      <thead><tr>
        <th>الاسم</th><th>رقم الهاتف</th><th>الامتحان</th><th>النتيجة</th><th>النسبة</th><th>التقدير</th><th>وقت التسليم</th><th></th>
      </tr></thead>
      <tbody>
        ${rows.map(r => `
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
              <button class="btn btn-danger btn-sm" onclick='deleteAttempt("${r.id}", "${escapeAttr(r.student_name).replace(/"/g,"")}")'>حذف</button>
            </td>
          </tr>
          ${showAnswers ? `<tr id="detail-${r.id}" class="hidden"><td colspan="8">${renderAnswerDetail(r)}</td></tr>` : ""}
        `).join("")}
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
    ${answers.map((a, i) => `
      <div style="padding:8px 12px; background:#FBFAF7; border-radius:8px; border:1px solid var(--line);">
        <div style="font-weight:700; font-size:.85rem;">س${i + 1}: ${escapeHtml(a.question_text || "")}</div>
        <div class="muted" style="font-size:.8rem; margin-top:4px;">
          إجابة الطالب: <b>${escapeHtml(formatStudentAnswer(a))}</b> —
          <span class="badge ${a.is_correct ? "badge-success" : "badge-danger"}">${a.is_correct ? "صحيحة" : "خاطئة"}</span>
        </div>
      </div>`).join("")}
  </div>`;
}

function formatStudentAnswer(a) {
  if (a.type === "fill") {
    return (a.blank_results || []).map(b => b.given || "—").join(" / ");
  }
  return a.selected_text || "—";
}

async function deleteAttempt(attemptId, name) {
  if (!confirm(`تأكيد حذف نتيجة "${name}"؟ سيتمكن الطالب من الامتحان مرة أخرى بنفس الرقم.`)) return;
  const { error } = await supabaseClient.from("attempts").delete().eq("id", attemptId);
  if (error) return showToast("تعذر الحذف");
  showToast("تم حذف النتيجة، يمكن للطالب الامتحان مرة أخرى");
  loadResults();
}

// ---------- Init ----------
loadExams();
