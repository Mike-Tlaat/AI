// ============================================================
// إعدادات الاتصال بـ Supabase
// غيّر القيمتين تحت بمعلومات مشروعك (Project Settings > API)
// ============================================================
const SUPABASE_URL = "https://ubavepfzrwtlinsansxi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_v2sbdwmrgbiwoTtUFuwVsA_2UwJbuBz";

// عميل Supabase مشترك بين كل الصفحات
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// رقم واتساب الإدارة لفتح الامتحانات المقفولة
const ADMIN_WHATSAPP_NUMBER = "201277573021";

function whatsappLink(message) {
  const text = encodeURIComponent(message || "أريد فتح الامتحان من فضلك");
  return `https://wa.me/${ADMIN_WHATSAPP_NUMBER}?text=${text}`;
}
