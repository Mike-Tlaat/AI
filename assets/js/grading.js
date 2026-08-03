// ============================================================
// تطبيع النص العربي لتصحيح أسئلة "أكمل" بدون حساسية للحروف
// المتشابهة (أ/إ/آ/ا) و(ة/ه) و(ى/ي) والتشكيل والمسافات
// ============================================================
function normalizeArabicAnswer(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .trim()
    .replace(/[\u064B-\u0652\u0640]/g, "") // إزالة التشكيل والتطويل
    .replace(/[إأآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[ىي]/g, "ي")
    .replace(/\s+/g, "") // تجاهل الفراغات بالكامل
    .toLowerCase();
}

function isFillAnswerCorrect(studentAnswer, correctAnswer) {
  return normalizeArabicAnswer(studentAnswer) === normalizeArabicAnswer(correctAnswer);
}

// grade a single question given the student's raw answer and the question definition
// question: { id, question_type, points, options:[{id,option_text,is_correct}], blanks:[{blank_index,correct_answer}] }
// studentAnswer: for true_false/mcq -> selected option_id (string). for fill -> array of strings by blank_index
function gradeQuestion(question, studentAnswer) {
  const points = Number(question.points) || 1;

  if (question.question_type === "true_false" || question.question_type === "mcq") {
    const correctOption = (question.options || []).find(o => o.is_correct);
    const isCorrect = !!correctOption && String(studentAnswer) === String(correctOption.id);
    return {
      earned: isCorrect ? points : 0,
      max: points,
      is_correct: isCorrect,
    };
  }

  if (question.question_type === "fill") {
    const blanks = (question.blanks || []).slice().sort((a, b) => a.blank_index - b.blank_index);
    const answersArr = Array.isArray(studentAnswer) ? studentAnswer : [];
    const perBlank = blanks.length > 0 ? points / blanks.length : points;
    let earned = 0;
    const blankResults = [];
    blanks.forEach((b, idx) => {
      const given = answersArr[idx] ?? "";
      const correct = isFillAnswerCorrect(given, b.correct_answer);
      if (correct) earned += perBlank;
      blankResults.push({ blank_index: b.blank_index, given, correct_answer: b.correct_answer, is_correct: correct });
    });
    return {
      earned: Math.round(earned * 100) / 100,
      max: points,
      is_correct: earned >= points - 0.0001,
      blank_results: blankResults,
    };
  }

  return { earned: 0, max: points, is_correct: false };
}

function gradeLabelText(percentage) {
  if (percentage >= 90) return "ممتاز";
  if (percentage >= 80) return "جيد جدًا";
  if (percentage >= 65) return "جيد";
  if (percentage >= 50) return "مقبول";
  return "راسب";
}
