const rUrlParams = new URLSearchParams(location.search);
const R_EXAM_ID = rUrlParams.get("exam");

async function init() {
  if (R_EXAM_ID) {
    const { data: exam } = await supabaseClient.from("exams").select("title").eq("id", R_EXAM_ID).maybeSingle();
    if (exam) document.getElementById("examTitleLabel").textContent = `امتحان: ${exam.title} — اكتب رقم الهاتف الذي امتحنت به`;
  }
}

async function lookupResult() {
  const phone = document.getElementById("lookupPhone").value.trim();
  const errEl = document.getElementById("lookupError");
  const box = document.getElementById("lookupResultBox");
  errEl.textContent = "";
  box.classList.add("hidden");

  if (!phone) { errEl.textContent = "من فضلك اكتب رقم الهاتف"; return; }

  let query = supabaseClient.from("attempts").select("*").eq("student_phone", phone);
  if (R_EXAM_ID) query = query.eq("exam_id", R_EXAM_ID);
  const { data, error } = await query.order("submitted_at", { ascending: false });

  if (error) { errEl.textContent = "تعذر البحث، حاول مرة أخرى"; return; }
  if (!data || !data.length) { errEl.textContent = "لا توجد نتيجة بهذا الرقم"; return; }

  const attempt = data[0];
  const pctEl = document.getElementById("lookupPct");
  pctEl.className = "result-percentage " + (attempt.is_passed ? "pass" : "fail");
  pctEl.textContent = attempt.percentage.toFixed(1) + "%";
  document.getElementById("lookupGrade").textContent = attempt.is_passed ? `${gradeLabelText(attempt.percentage)} — ناجح` : "غير ناجح";
  document.getElementById("lookupDetail").textContent = `${attempt.student_name} — الدرجة: ${attempt.score} من ${attempt.max_score}`;
  box.classList.remove("hidden");
}

init();
