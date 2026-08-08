import {
  getExamById,
  updateExam,
  getQuestionsByExam,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  reorderQuestions,
  getAllChurches,
  createChurch,
  deleteChurch,
  getExamChurchLinks,
  setExamChurches,
  getPackageCategoriesForExam,
  createPackageCategory,
  updatePackageCategory,
  deletePackageCategory,
  createPackageItem,
  updatePackageItem,
  deletePackageItem,
} from "../includes/functions.js";

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

let examId = null;
let exam = null;

const TYPE_LABELS = {
  true_false: "صواب أم خطأ",
  multiple_choice: "اختيار من متعدد",
  fill_in_the_blank: "إكمال الفراغ",
  essay: "سؤال مقالي",
};

export async function renderExamEditor() {
  const qs = new URLSearchParams(location.search);
  examId = Number(qs.get("id"));
  const app = document.getElementById("app");

  if (!examId) {
    app.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-triangle-exclamation"></i> لا يوجد امتحان محدد في الرابط.</div>`;
    return;
  }

  exam = await getExamById(examId);
  if (!exam) {
    app.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-triangle-exclamation"></i> الامتحان غير موجود.</div>`;
    return;
  }

  app.innerHTML = `
    <div class="a-topbar">
      <div>
        <h1><i class="fa-solid fa-pen-to-square"></i> ${esc(exam.name)}</h1>
        <p>تعديل بيانات الامتحان، الأسئلة، الكنائس، والأنشطة</p>
      </div>
      <div style="display:flex; gap:.5rem;">
        <a class="a-mini-btn" href="index.html"><i class="fa-solid fa-arrow-right"></i> رجوع للوحة التحكم</a>
        <button class="a-theme-btn" id="themeToggle"><i class="fa-solid fa-circle-half-stroke"></i></button>
      </div>
    </div>

    <div class="a-tabs-row" id="editorTabs">
      <button class="a-tab-btn active" data-tab="details"><i class="fa-solid fa-sliders"></i> تفاصيل الامتحان</button>
      <button class="a-tab-btn" data-tab="questions"><i class="fa-solid fa-list-check"></i> الأسئلة</button>
      <button class="a-tab-btn" data-tab="churches"><i class="fa-solid fa-church"></i> الكنائس</button>
      <button class="a-tab-btn" data-tab="packages"><i class="fa-solid fa-boxes-stacked"></i> الأنشطة / البكدجات</button>
    </div>

    <div id="tab_details" class="a-tab-panel"></div>
    <div id="tab_questions" class="a-tab-panel hidden"></div>
    <div id="tab_churches" class="a-tab-panel hidden"></div>
    <div id="tab_packages" class="a-tab-panel hidden"></div>
  `;

  const themeToggle = document.getElementById("themeToggle");
  const htmlEl = document.documentElement;
  htmlEl.setAttribute("data-theme", localStorage.getItem("admin_theme") || "dark");
  themeToggle?.addEventListener("click", () => {
    const next = htmlEl.getAttribute("data-theme") === "dark" ? "light" : "dark";
    htmlEl.setAttribute("data-theme", next);
    localStorage.setItem("admin_theme", next);
  });

  const loaded = { details: false, questions: false, churches: false, packages: false };
  document.querySelectorAll("#editorTabs .a-tab-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll("#editorTabs .a-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".a-tab-panel").forEach((p) => p.classList.add("hidden"));
      const tab = btn.dataset.tab;
      document.getElementById(`tab_${tab}`).classList.remove("hidden");
      if (!loaded[tab]) {
        loaded[tab] = true;
        if (tab === "details") await renderDetailsTab();
        if (tab === "questions") await renderQuestionsTab();
        if (tab === "churches") await renderChurchesTab();
        if (tab === "packages") await renderPackagesTab();
      }
    });
  });

  loaded.details = true;
  await renderDetailsTab();
}

/* =====================================================================
   تبويب 1: تفاصيل الامتحان
===================================================================== */
async function renderDetailsTab() {
  const panel = document.getElementById("tab_details");
  const durationMinutes = Math.round((exam.duration_seconds || 1800) / 60);

  panel.innerHTML = `
    <form id="detailsForm" class="a-exam-form" style="margin-top:1rem;">
      <div class="a-filter-item">
        <label>اسم الامتحان</label>
        <input type="text" name="name" value="${esc(exam.name)}" required>
      </div>
      <div class="a-filter-item">
        <label>الرابط المختصر (slug)</label>
        <input type="text" name="slug" value="${esc(exam.slug)}" required>
      </div>
      <div class="a-filter-item">
        <label>المرحلة (اختياري)</label>
        <input type="text" name="stage" value="${esc(exam.stage || "")}">
      </div>
      <div class="a-filter-item">
        <label>مدة الامتحان (دقائق)</label>
        <input type="number" name="duration_minutes" value="${durationMinutes}" min="1" required>
      </div>
      <div class="a-filter-item">
        <label>نسبة النجاح %</label>
        <input type="number" name="pass_threshold" value="${exam.pass_threshold}" min="0" max="100" required>
      </div>
      <div class="a-filter-item">
        <label>حالة الامتحان</label>
        <select name="is_open">
          <option value="true" ${exam.is_open ? "selected" : ""}>مفتوح</option>
          <option value="false" ${!exam.is_open ? "selected" : ""}>مقفول</option>
        </select>
      </div>
      <div class="a-filter-item" style="flex:1 1 100%;">
        <label>إعلان "الرقم غير مسجل" في صفحة الاستعلام (اختياري - لو فاضي هيظهر نص عام)</label>
        <textarea name="not_found_announcement" rows="3">${esc(exam.not_found_announcement || "")}</textarea>
      </div>
      <button type="submit" class="a-bulk-del-action-btn" style="background:#16a34a;"><i class="fa-solid fa-floppy-disk"></i> حفظ التعديلات</button>
      <span id="detailsSavedMsg" class="a-saved-msg hidden"><i class="fa-solid fa-circle-check"></i> تم الحفظ بنجاح</span>
    </form>
  `;

  document.getElementById("detailsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      exam = await updateExam(examId, {
        name: fd.get("name").trim(),
        slug: fd.get("slug").trim(),
        stage: fd.get("stage")?.trim() || null,
        duration_seconds: Number(fd.get("duration_minutes")) * 60,
        pass_threshold: Number(fd.get("pass_threshold")),
        is_open: fd.get("is_open") === "true",
        not_found_announcement: fd.get("not_found_announcement")?.trim() || null,
      });
      const msg = document.getElementById("detailsSavedMsg");
      msg.classList.remove("hidden");
      setTimeout(() => msg.classList.add("hidden"), 2500);
    } catch (err) {
      alert("حدث خطأ أثناء الحفظ: " + (err.message || err));
    }
  });
}

/* =====================================================================
   تبويب 2: الأسئلة
===================================================================== */
let editingQuestionId = null;

async function renderQuestionsTab() {
  const panel = document.getElementById("tab_questions");
  panel.innerHTML = `<div class="a-loading-mini" style="margin-top:1rem;"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>`;
  const questions = await getQuestionsByExam(examId);

  panel.innerHTML = `
    <div class="a-question-form-box">
      <h3 id="qFormTitle"><i class="fa-solid fa-plus"></i> إضافة سؤال جديد</h3>
      <form id="questionForm">
        <div class="a-filter-item" style="flex:1 1 100%;">
          <label>نوع السؤال</label>
          <select name="type" id="qType">
            <option value="true_false">صواب أم خطأ</option>
            <option value="multiple_choice">اختيار من متعدد</option>
            <option value="fill_in_the_blank">إكمال الفراغ (استخدم ... لكل فراغ)</option>
            <option value="essay">سؤال مقالي (تصحيح يدوي)</option>
          </select>
        </div>
        <div class="a-filter-item" style="flex:1 1 100%;">
          <label>نص السؤال</label>
          <textarea name="question" id="qText" rows="3" required placeholder="اكتب نص السؤال هنا. لأسئلة إكمال الفراغ استخدم ... في مكان كل فراغ"></textarea>
        </div>

        <div id="qOptionsBox" class="a-filter-item" style="flex:1 1 100%;"></div>
        <div id="qBlanksBox" class="a-filter-item" style="flex:1 1 100%;"></div>

        <div class="a-filter-item" id="qScoreBox">
          <label>درجة السؤال</label>
          <input type="number" name="score" id="qScore" value="1" min="0" step="0.5" required>
        </div>

        <div style="flex:1 1 100%; display:flex; gap:.6rem; flex-wrap:wrap;">
          <button type="submit" class="a-bulk-del-action-btn" style="background:#16a34a;"><i class="fa-solid fa-plus"></i> <span id="qSubmitLabel">إضافة السؤال</span></button>
          <button type="button" id="qCancelEditBtn" class="a-mini-btn hidden"><i class="fa-solid fa-xmark"></i> إلغاء التعديل</button>
        </div>
      </form>
    </div>

    <div id="questionsList" class="a-questions-list"></div>
  `;

  const typeSelect = document.getElementById("qType");
  const optionsBox = document.getElementById("qOptionsBox");
  const blanksBox = document.getElementById("qBlanksBox");
  const scoreBox = document.getElementById("qScoreBox");
  const qTextArea = document.getElementById("qText");

  function buildOptionsUI(existingOptions = ["", ""], correctValue = "") {
    optionsBox.innerHTML = `
      <label>الاختيارات المتاحة</label>
      <div id="optionsRows"></div>
      <button type="button" id="addOptionBtn" class="a-mini-btn"><i class="fa-solid fa-plus"></i> إضافة اختيار</button>
      <label style="margin-top:.6rem;display:block;">الإجابة الصحيحة</label>
      <select name="correct_answer_mc" id="correctAnswerSelect"></select>
    `;
    const rows = document.getElementById("optionsRows");
    const correctSelect = document.getElementById("correctAnswerSelect");

    function refreshCorrectOptions() {
      const values = Array.from(rows.querySelectorAll("input")).map((i) => i.value.trim()).filter(Boolean);
      const prevVal = correctSelect.value;
      correctSelect.innerHTML = values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
      if (values.includes(prevVal)) correctSelect.value = prevVal;
      else if (values.includes(correctValue)) correctSelect.value = correctValue;
    }

    function addOptionRow(val = "") {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = ".4rem";
      row.style.marginBottom = ".4rem";
      row.innerHTML = `<input type="text" value="${esc(val)}" placeholder="نص الاختيار" style="flex:1;">
        <button type="button" class="a-mini-btn danger remove-option-btn"><i class="fa-solid fa-xmark"></i></button>`;
      rows.appendChild(row);
      row.querySelector("input").addEventListener("input", refreshCorrectOptions);
      row.querySelector(".remove-option-btn").addEventListener("click", () => {
        row.remove();
        refreshCorrectOptions();
      });
    }

    existingOptions.forEach((v) => addOptionRow(v));
    refreshCorrectOptions();

    document.getElementById("addOptionBtn").addEventListener("click", () => addOptionRow(""));
  }

  function buildTrueFalseUI(correctValue = "صح") {
    optionsBox.innerHTML = `
      <label>الإجابة الصحيحة</label>
      <select name="correct_answer_tf" id="tfSelect">
        <option value="صح" ${correctValue === "صح" ? "selected" : ""}>صح</option>
        <option value="غلط" ${correctValue === "غلط" ? "selected" : ""}>غلط</option>
      </select>`;
  }

  function countBlanks(text) {
    const matches = text.match(/\.{3,}/gu);
    return matches ? matches.length : 0;
  }

  function buildBlanksUI(existingAnswers = [], existingScores = []) {
    const n = Math.max(countBlanks(qTextArea.value), 1);
    let rowsHtml = "";
    for (let i = 0; i < n; i++) {
      const accepted = Array.isArray(existingAnswers[i]) ? existingAnswers[i].join(", ") : existingAnswers[i] || "";
      const sc = existingScores[i] ?? 1;
      rowsHtml += `
        <div class="a-blank-row">
          <span class="a-blank-num">فراغ ${i + 1}</span>
          <input type="text" class="blank-accepted-input" data-blank="${i}" value="${esc(accepted)}" placeholder="الإجابات المقبولة، مفصولة بفاصلة">
          <input type="number" class="blank-score-input" data-blank="${i}" value="${sc}" min="0" step="0.5" style="width:80px;" title="درجة هذا الفراغ">
        </div>`;
    }
    blanksBox.innerHTML = `
      <label>فراغات السؤال (${n} فراغ تم اكتشافه من النص، ضع "..." في مكان كل فراغ بالنص أعلاه)</label>
      <div id="blankRows">${rowsHtml}</div>
      <p class="a-hint-text">اكتب كل الإجابات المقبولة للفراغ الواحد مفصولة بفاصلة (,) لو فيه أكثر من إجابة صحيحة مقبولة.</p>`;
  }

  function updateFormForType(type, data = {}) {
    optionsBox.innerHTML = "";
    blanksBox.innerHTML = "";
    scoreBox.classList.remove("hidden");

    if (type === "true_false") {
      buildTrueFalseUI(data.correct_answer || "صح");
    } else if (type === "multiple_choice") {
      buildOptionsUI(data.options && data.options.length ? data.options : ["", ""], data.correct_answer || "");
    } else if (type === "fill_in_the_blank") {
      buildBlanksUI(data.correct_answer || [], data.blank_scores || []);
      scoreBox.classList.add("hidden"); // الدرجة بتتحدد لكل فراغ
    } else if (type === "essay") {
      // score box يفضل ظاهر (الحد الأقصى للتصحيح اليدوي)
    }
  }

  typeSelect.addEventListener("change", () => updateFormForType(typeSelect.value));
  qTextArea.addEventListener("input", () => {
    if (typeSelect.value === "fill_in_the_blank") buildBlanksUI();
  });

  updateFormForType("true_false");

  function resetForm() {
    editingQuestionId = null;
    document.getElementById("questionForm").reset();
    document.getElementById("qFormTitle").innerHTML = `<i class="fa-solid fa-plus"></i> إضافة سؤال جديد`;
    document.getElementById("qSubmitLabel").textContent = "إضافة السؤال";
    document.getElementById("qCancelEditBtn").classList.add("hidden");
    typeSelect.value = "true_false";
    updateFormForType("true_false");
  }

  document.getElementById("qCancelEditBtn").addEventListener("click", resetForm);

  document.getElementById("questionForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = typeSelect.value;
    const questionText = qTextArea.value.trim();
    if (!questionText) return;

    let payload = { type, question: questionText };

    if (type === "true_false") {
      payload.options = ["صح", "غلط"];
      payload.correct_answer = document.getElementById("tfSelect").value;
      payload.score = Number(document.getElementById("qScore").value) || 1;
      payload.blank_scores = null;
    } else if (type === "multiple_choice") {
      const optionInputs = Array.from(document.querySelectorAll("#optionsRows input"));
      const options = optionInputs.map((i) => i.value.trim()).filter(Boolean);
      if (options.length < 2) return alert("لازم يكون فيه على الأقل اختيارين");
      payload.options = options;
      payload.correct_answer = document.getElementById("correctAnswerSelect").value;
      payload.score = Number(document.getElementById("qScore").value) || 1;
      payload.blank_scores = null;
    } else if (type === "fill_in_the_blank") {
      const acceptedInputs = Array.from(document.querySelectorAll(".blank-accepted-input"));
      const scoreInputs = Array.from(document.querySelectorAll(".blank-score-input"));
      const correctAnswer = acceptedInputs.map((i) =>
        i.value.split(",").map((v) => v.trim()).filter(Boolean),
      );
      const blankScores = scoreInputs.map((i) => Number(i.value) || 0);
      payload.options = null;
      payload.correct_answer = correctAnswer;
      payload.blank_scores = blankScores;
      payload.score = blankScores.reduce((s, v) => s + v, 0);
    } else if (type === "essay") {
      payload.options = null;
      payload.correct_answer = null;
      payload.blank_scores = null;
      payload.score = Number(document.getElementById("qScore").value) || 1;
    }

    try {
      if (editingQuestionId) {
        await updateQuestion(editingQuestionId, payload);
      } else {
        await createQuestion(examId, payload);
      }
      resetForm();
      await renderQuestionsTab();
    } catch (err) {
      alert("حدث خطأ: " + (err.message || err));
    }
  });

  /* ---------- عرض قائمة الأسئلة الحالية ---------- */
  const listEl = document.getElementById("questionsList");
  if (!questions.length) {
    listEl.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-inbox"></i>لا توجد أسئلة بعد. أضف أول سؤال من الفورم أعلاه.</div>`;
  } else {
    listEl.innerHTML = questions
      .map((q, idx) => {
        let answerDisplay = "";
        if (q.type === "fill_in_the_blank") {
          answerDisplay = (q.correct_answer || [])
            .map((accepted, i) => `فراغ ${i + 1}: ${Array.isArray(accepted) ? accepted.join(" / ") : accepted} (${q.blank_scores?.[i] ?? 0} د)`)
            .join(" — ");
        } else if (q.type === "essay") {
          answerDisplay = "تصحيح يدوي";
        } else {
          answerDisplay = q.correct_answer;
        }

        return `
        <div class="a-question-card" data-id="${q.id}">
          <div class="a-question-card-head">
            <span class="a-question-order">${idx + 1}</span>
            <span class="a-question-type-badge">${TYPE_LABELS[q.type] || q.type}</span>
            <span class="a-question-score-badge">${q.score} درجة</span>
            <div class="a-question-card-actions">
              <button type="button" class="a-mini-btn move-up-btn" title="تحريك لأعلى" ${idx === 0 ? "disabled" : ""}><i class="fa-solid fa-arrow-up"></i></button>
              <button type="button" class="a-mini-btn move-down-btn" title="تحريك لأسفل" ${idx === questions.length - 1 ? "disabled" : ""}><i class="fa-solid fa-arrow-down"></i></button>
              <button type="button" class="a-mini-btn edit-question-btn"><i class="fa-solid fa-pen"></i> تعديل</button>
              <button type="button" class="a-mini-btn danger delete-question-btn"><i class="fa-solid fa-trash-can"></i> حذف</button>
            </div>
          </div>
          <div class="a-question-card-body">
            <p>${esc(q.question)}</p>
            ${q.options ? `<div class="a-pkg-tags">${q.options.map((o) => `<span class="a-pkg-tag">${esc(o)}</span>`).join("")}</div>` : ""}
            <div class="a-question-answer-line"><b>الإجابة الصحيحة:</b> ${esc(String(answerDisplay))}</div>
          </div>
        </div>`;
      })
      .join("");

    listEl.querySelectorAll(".delete-question-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".a-question-card");
        const id = Number(card.dataset.id);
        if (!confirm("هل تريد حذف هذا السؤال نهائياً؟")) return;
        await deleteQuestion(id);
        await renderQuestionsTab();
      });
    });

    listEl.querySelectorAll(".edit-question-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = btn.closest(".a-question-card");
        const id = Number(card.dataset.id);
        const q = questions.find((x) => x.id === id);
        if (!q) return;

        editingQuestionId = id;
        document.getElementById("qFormTitle").innerHTML = `<i class="fa-solid fa-pen"></i> تعديل السؤال #${id}`;
        document.getElementById("qSubmitLabel").textContent = "حفظ التعديلات";
        document.getElementById("qCancelEditBtn").classList.remove("hidden");

        typeSelect.value = q.type;
        qTextArea.value = q.question;
        document.getElementById("qScore").value = q.score;
        updateFormForType(q.type, q);

        panel.querySelector(".a-question-form-box").scrollIntoView({ behavior: "smooth" });
      });
    });

    listEl.querySelectorAll(".move-up-btn, .move-down-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".a-question-card");
        const id = Number(card.dataset.id);
        const idx = questions.findIndex((q) => q.id === id);
        const targetIdx = btn.classList.contains("move-up-btn") ? idx - 1 : idx + 1;
        if (targetIdx < 0 || targetIdx >= questions.length) return;
        const newOrder = [...questions.map((q) => q.id)];
        [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
        await reorderQuestions(examId, newOrder);
        await renderQuestionsTab();
      });
    });
  }
}

/* =====================================================================
   تبويب 3: الكنائس
===================================================================== */
async function renderChurchesTab() {
  const panel = document.getElementById("tab_churches");
  panel.innerHTML = `<div class="a-loading-mini" style="margin-top:1rem;"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>`;

  const [allChurches, linkedIds] = await Promise.all([getAllChurches(), getExamChurchLinks(examId)]);
  const linkedSet = new Set(linkedIds);

  panel.innerHTML = `
    <div class="a-two-col">
      <div class="a-bulk-delete-box">
        <div class="a-bulk-delete-title"><i class="fa-solid fa-list"></i> القائمة الرئيسية للكنائس (مشتركة لكل الامتحانات)</div>
        <form id="addChurchForm" style="display:flex; gap:.5rem; margin-bottom:1rem;">
          <input type="text" id="newChurchName" placeholder="اسم كنيسة جديدة" style="flex:1;" required>
          <button type="submit" class="a-mini-btn"><i class="fa-solid fa-plus"></i> إضافة</button>
        </form>
        <div id="churchesMasterList" class="a-master-church-list"></div>
      </div>

      <div class="a-bulk-delete-box">
        <div class="a-bulk-delete-title"><i class="fa-solid fa-church"></i> الكنائس المتاحة في هذا الامتحان</div>
        <p class="a-hint-text">${linkedSet.size ? "الكنائس المحددة بعلامة ✓ فقط هي المتاحة في هذا الامتحان." : "مفيش أي تخصيص حالياً، فكل الكنائس بتظهر تلقائياً لهذا الامتحان. حدد كنائس معينة لتقييد الظهور."}</p>
        <div style="margin-bottom:.6rem; display:flex; gap:.5rem;">
          <button type="button" id="selectAllChurchesBtn" class="a-mini-btn">تحديد الكل</button>
          <button type="button" id="clearChurchesBtn" class="a-mini-btn">إلغاء تحديد الكل (كل الكنائس متاحة)</button>
        </div>
        <div id="examChurchesCheckboxes" class="a-checkbox-list"></div>
        <button type="button" id="saveExamChurchesBtn" class="a-bulk-del-action-btn" style="background:#16a34a; margin-top:1rem;"><i class="fa-solid fa-floppy-disk"></i> حفظ الكنائس المتاحة لهذا الامتحان</button>
        <span id="churchesSavedMsg" class="a-saved-msg hidden"><i class="fa-solid fa-circle-check"></i> تم الحفظ بنجاح</span>
      </div>
    </div>
  `;

  function renderMasterList() {
    const listEl = document.getElementById("churchesMasterList");
    listEl.innerHTML = allChurches.length
      ? allChurches
          .map((c) => `<div class="a-master-church-item"><span>${esc(c.name)}</span><button type="button" class="a-mini-btn danger remove-church-btn" data-id="${c.id}"><i class="fa-solid fa-trash-can"></i></button></div>`)
          .join("")
      : `<div class="a-pkg-tag none">لا يوجد كنائس مضافة بعد</div>`;

    listEl.querySelectorAll(".remove-church-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("حذف هذه الكنيسة من القائمة الرئيسية نهائياً؟")) return;
        await deleteChurch(Number(btn.dataset.id));
        const idx = allChurches.findIndex((c) => c.id === Number(btn.dataset.id));
        if (idx > -1) allChurches.splice(idx, 1);
        renderMasterList();
        renderCheckboxes();
      });
    });
  }

  function renderCheckboxes() {
    const box = document.getElementById("examChurchesCheckboxes");
    box.innerHTML = allChurches
      .map(
        (c) => `<label class="a-checkbox-item">
          <input type="checkbox" value="${c.id}" ${linkedSet.has(c.id) ? "checked" : ""}>
          <span>${esc(c.name)}</span>
        </label>`,
      )
      .join("");
  }

  renderMasterList();
  renderCheckboxes();

  document.getElementById("addChurchForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("newChurchName");
    const name = input.value.trim();
    if (!name) return;
    try {
      const created = await createChurch(name);
      allChurches.push(created);
      input.value = "";
      renderMasterList();
      renderCheckboxes();
    } catch (err) {
      alert("حدث خطأ (قد تكون الكنيسة مضافة مسبقاً): " + (err.message || err));
    }
  });

  document.getElementById("selectAllChurchesBtn").addEventListener("click", () => {
    document.querySelectorAll("#examChurchesCheckboxes input").forEach((cb) => (cb.checked = true));
  });
  document.getElementById("clearChurchesBtn").addEventListener("click", () => {
    document.querySelectorAll("#examChurchesCheckboxes input").forEach((cb) => (cb.checked = false));
  });

  document.getElementById("saveExamChurchesBtn").addEventListener("click", async () => {
    const checked = Array.from(document.querySelectorAll("#examChurchesCheckboxes input:checked")).map((cb) => Number(cb.value));
    try {
      await setExamChurches(examId, checked);
      const msg = document.getElementById("churchesSavedMsg");
      msg.classList.remove("hidden");
      setTimeout(() => msg.classList.add("hidden"), 2500);
    } catch (err) {
      alert("حدث خطأ أثناء الحفظ: " + (err.message || err));
    }
  });
}

/* =====================================================================
   تبويب 4: الأنشطة / البكدجات
===================================================================== */
async function renderPackagesTab() {
  const panel = document.getElementById("tab_packages");
  panel.innerHTML = `<div class="a-loading-mini" style="margin-top:1rem;"><i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...</div>`;

  const categories = await getPackageCategoriesForExam(examId);

  panel.innerHTML = `
    <p class="a-hint-text" style="margin-top:1rem;">
      الأنشطة اختيارية تماماً لكل امتحان. لو مش عايز أنشطة في هذا الامتحان، سيبها فاضية وهيتم تخطي شاشة الأنشطة تلقائياً للطلاب.
    </p>
    <div class="a-bulk-delete-box">
      <div class="a-bulk-delete-title"><i class="fa-solid fa-plus"></i> إضافة قسم جديد (مثال: أنشطة / ألعاب فردية / ألعاب جماعية)</div>
      <form id="addCategoryForm" class="a-exam-form">
        <div class="a-filter-item"><label>اسم القسم</label><input type="text" id="newCatName" required></div>
        <div class="a-filter-item"><label>أقل عدد اختيار (0 = اختياري)</label><input type="number" id="newCatMin" value="0" min="0"></div>
        <div class="a-filter-item"><label>أقصى عدد اختيار (سيبها فاضية = بلا حدود)</label><input type="number" id="newCatMax" min="0" placeholder="بلا حدود"></div>
        <button type="submit" class="a-mini-btn"><i class="fa-solid fa-plus"></i> إضافة القسم</button>
      </form>
    </div>

    <div id="categoriesList" class="a-categories-list"></div>
  `;

  document.getElementById("addCategoryForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("newCatName").value.trim();
    const min_select = Number(document.getElementById("newCatMin").value) || 0;
    const maxRaw = document.getElementById("newCatMax").value;
    const max_select = maxRaw === "" ? null : Number(maxRaw);
    if (!name) return;
    try {
      await createPackageCategory(examId, { name, min_select, max_select, sort_order: categories.length });
      await renderPackagesTab();
    } catch (err) {
      alert("حدث خطأ: " + (err.message || err));
    }
  });

  const listEl = document.getElementById("categoriesList");
  if (!categories.length) {
    listEl.innerHTML = `<div class="a-empty-state"><i class="fa-solid fa-inbox"></i>لا توجد أقسام أنشطة لهذا الامتحان حالياً.</div>`;
    return;
  }

  listEl.innerHTML = categories
    .map(
      (cat) => `
    <div class="a-category-card" data-id="${cat.id}">
      <div class="a-category-head">
        <div class="a-category-title-edit">
          <input type="text" class="cat-name-input" value="${esc(cat.name)}" style="font-weight:800;">
          <label>أقل اختيار: <input type="number" class="cat-min-input" value="${cat.min_select}" min="0" style="width:60px;"></label>
          <label>أقصى اختيار: <input type="number" class="cat-max-input" value="${cat.max_select ?? ""}" min="0" style="width:70px;" placeholder="بلا حدود"></label>
          <button type="button" class="a-mini-btn save-cat-btn"><i class="fa-solid fa-floppy-disk"></i> حفظ</button>
          <button type="button" class="a-mini-btn danger delete-cat-btn"><i class="fa-solid fa-trash-can"></i> حذف القسم</button>
        </div>
      </div>
      <div class="a-category-items">
        ${cat.items
          .map(
            (it) => `<span class="a-pkg-tag editable" data-item-id="${it.id}">${esc(it.name)}
              <button type="button" class="a-pkg-remove-btn remove-item-btn" data-item-id="${it.id}"><i class="fa-solid fa-xmark"></i></button>
            </span>`,
          )
          .join("") || `<span class="a-pkg-tag none">لا توجد عناصر</span>`}
      </div>
      <form class="a-add-item-form" style="display:flex; gap:.5rem; margin-top:.6rem;">
        <input type="text" class="new-item-input" placeholder="اسم عنصر جديد (مثال: مسرح)" style="flex:1;" required>
        <button type="submit" class="a-mini-btn"><i class="fa-solid fa-plus"></i> إضافة عنصر</button>
      </form>
    </div>`,
    )
    .join("");

  listEl.querySelectorAll(".a-category-card").forEach((card) => {
    const catId = Number(card.dataset.id);

    card.querySelector(".save-cat-btn").addEventListener("click", async () => {
      const name = card.querySelector(".cat-name-input").value.trim();
      const min_select = Number(card.querySelector(".cat-min-input").value) || 0;
      const maxRaw = card.querySelector(".cat-max-input").value;
      const max_select = maxRaw === "" ? null : Number(maxRaw);
      try {
        await updatePackageCategory(catId, { name, min_select, max_select });
        await renderPackagesTab();
      } catch (err) {
        alert("حدث خطأ: " + (err.message || err));
      }
    });

    card.querySelector(".delete-cat-btn").addEventListener("click", async () => {
      if (!confirm("هل تريد حذف هذا القسم وكل عناصره نهائياً؟")) return;
      await deletePackageCategory(catId);
      await renderPackagesTab();
    });

    card.querySelectorAll(".remove-item-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("حذف هذا العنصر؟")) return;
        await deletePackageItem(Number(btn.dataset.itemId));
        await renderPackagesTab();
      });
    });

    card.querySelector(".a-add-item-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = card.querySelector(".new-item-input");
      const name = input.value.trim();
      if (!name) return;
      try {
        await createPackageItem(catId, { name, sort_order: 0 });
        await renderPackagesTab();
      } catch (err) {
        alert("حدث خطأ: " + (err.message || err));
      }
    });
  });
}
