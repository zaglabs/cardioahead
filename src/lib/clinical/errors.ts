export const AI_FAILURE_MESSAGES: Record<string, string> = {
  AI_CREDITS_REQUIRED:
    "יתרת הזיכויים בחשבון Claude אינה מספיקה. הוסיפו זיכויים לחשבון ה-API ואז נסו שוב.",
  AI_KEY_INVALID: "מפתח ה-API נדחה. בדקו שהמפתח ב-Vercel תקין ופעיל.",
  AI_MODEL_UNAVAILABLE:
    "המודל שנבחר אינו זמין לחשבון ה-API. יש לבדוק את בחירת המודל.",
  AI_REQUEST_FORMAT: "שירות ה-AI דחה את מבנה הבקשה. נדרש תיקון בחיבור המערכת.",
  AI_STREAM_REQUIRED: "שירות ה-AI דורש בקשה במצב הזרמה עבור תקציב הפלט שנבחר.",
  AI_DOCUMENT_REJECTED:
    "שירות ה-AI לא הצליח לקבל את קובצי הבדיקה. יש לבדוק את תקינות ה-PDF.",
  AI_RATE_LIMIT: "הבקשה חרגה ממגבלת הקצב של שירות ה-AI. המתינו ונסו שוב.",
  AI_TIMEOUT: "שירות ה-AI לא השלים את הבקשה בזמן. ניתן לנסות שוב.",
  AI_PROVIDER_ERROR:
    "שירות ה-AI דחה את הבקשה. בדיקת החיבור תעזור לזהות את הסיבה.",
  INVALID_AI_OUTPUT: "טיוטת ה-AI לא עמדה במבנה הנדרש. לא הוצג סיכום לא תקין.",
  INVALID_SOURCE_REFERENCE:
    "טיוטת ה-AI כללה הפניה למקור שלא ניתן לאמת. יש לנסות שוב.",
  ANALYSIS_FAILED: "הכנת הסיכום לא הושלמה. בדקו את החיבור ונסו שוב.",
};
export function classifyProviderFailure(
  status: number,
  payload: unknown,
): string {
  const p = payload as { error?: { message?: unknown; type?: unknown } } | null;
  const message =
    typeof p?.error?.message === "string" ? p.error.message.toLowerCase() : "";
  if (
    /credit balance|insufficient.*credit|billing|purchase credits/.test(message)
  )
    return "AI_CREDITS_REQUIRED";
  if (status === 401 || status === 403) return "AI_KEY_INVALID";
  if (status === 429) return "AI_RATE_LIMIT";
  if (
    status === 404 ||
    (/model/.test(message) &&
      /not found|not exist|not available|access/.test(message))
  )
    return "AI_MODEL_UNAVAILABLE";
  if (/stream/.test(message) && /require/.test(message))
    return "AI_STREAM_REQUIRED";
  if (/schema|output_config|structured.output/.test(message))
    return "AI_REQUEST_FORMAT";
  if (/pdf|document|file/.test(message)) return "AI_DOCUMENT_REJECTED";
  return "AI_PROVIDER_ERROR";
}
