"""Generate synthetic, visibly labelled Hebrew fixtures. No real patient data."""
from pathlib import Path
import hashlib, json, textwrap
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from bidi.algorithm import get_display

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont("Hebrew", "C:/Windows/Fonts/arial.ttf"))
pdfmetrics.registerFont(TTFont("HebrewBold", "C:/Windows/Fonts/arialbd.ttf"))
INK = colors.HexColor("#173d34")
MUTED = colors.HexColor("#596b60")
W, H = A4
documents = [
 ("01-cardiology-referral-he.pdf", "סיכום ביקור והפניה לקרדיולוג", "26.09.2026", [
  ("פרטי מטופל פיקטיבי", ["מטופל בדיקה 001 | גבר, בן 68 | מזהה בדיקה: TEST-001", "כל הנתונים במסמך מומצאים ואינם שייכים לאדם אמיתי."]),
  ("סיבת ההפניה", ["קוצר נשימה במאמץ ועייפות שהופיעו בהדרגה בשלושת החודשים האחרונים.", "על פי התיאור הפיקטיבי: הליכה במישור אפשרית; בעלייה במדרגות נדרשת עצירה.", "לא תוארו כאבים בחזה במנוחה, עילפון או אשפוז בתקופה האחרונה."]),
  ("רקע רפואי בדוגמה", ["מחלת לב כלילית; צנתור והתערבות בעורק LAD בשנת 2018.", "יתר לחץ דם ודיסליפידמיה. תפקוד סיסטולי מופחת תועד בבדיקת אקו קודמת.", "לצורך תרחיש הבדיקה בלבד: לא ידועה אלרגיה לתרופות."]),
  ("נתונים בביקור הפיקטיבי", ["לחץ דם: 128/76 מ״מ כספית | דופק: 72 לדקה | סטורציה: 97% באוויר חדר.", "לא תוארו בצקות משמעותיות; נשימה רגועה במנוחה.", "אקו מיום 22.09.2026 מובא במסמך נפרד בחבילת הבדיקה."]),
  ("מטרת המשך הבירור", ["הפניה לייעוץ קרדיולוגי לבחינת התסמינים, תפקוד הלב והטיפול המתועד.", "רשימת תרופות פיקטיבית מצורפת במסמך נפרד; אין כאן הוראות טיפול."]),
 ]),
 ("02-echocardiogram-he.pdf", "דו״ח אקו לב פיקטיבי", "22.09.2026", [
  ("פרטי הבדיקה", ["מטופל בדיקה 001 | גבר, בן 68 | מזהה בדיקה: TEST-001", "בדיקת אקו דרך בית החזה במכון בדיקה פיקטיבי."]),
  ("חדר שמאל", ["הרחבה קלה של חדר שמאל וירידה בתפקוד הסיסטולי.", "מקטע פליטה מחושב בדוגמה: LVEF 38%.", "היפוקינזיה גלובלית, בולטת יותר באזור הקדמי והאפקס.", "הפרעה בהרפיה בדרגה I לפי תרחיש הבדיקה."]),
  ("מדדים פיקטיביים", ["קוטר חדר שמאל בסוף דיאסטולה: 58 מ״מ.", "קוטר חדר שמאל בסוף סיסטולה: 45 מ״מ.", "קוטר שורש האאורטה: 34 מ״מ | הערכת לחץ ריאתי סיסטולי: 32 מ״מ כספית."]),
  ("מסתמים וחללים נוספים", ["דליפה מיטרלית קלה. ללא היצרות אאורטלית משמעותית בדוגמה.", "תפקוד חדר ימין שמור. עלייה שמאלית מוגדלת קלות.", "לא הודגם תפליט פריקרדיאלי בתרחיש הפיקטיבי."]),
  ("סיכום ממצאים לדוגמה", ["תפקוד סיסטולי מופחת של חדר שמאל עם מקטע פליטה של 38%.", "הממצאים נועדו לבדוק קליטת מסמכים וסיכום מידע; אינם תוצאת בדיקה אמיתית.", "המסמך אינו כולל תמונות הדמיה ואין להסיק ממנו דבר על אדם אמיתי."]),
 ]),
 ("03-medication-history-he.pdf", "רקע רפואי ורשימת תרופות פיקטיבית", "25.09.2026", [
  ("פרטי מטופל פיקטיבי", ["מטופל בדיקה 001 | גבר, בן 68 | מזהה בדיקה: TEST-001", "מסמך משלים לסיכום הביקור ולדו״ח האקו באותה חבילת בדיקה."]),
  ("רקע ותפקוד", ["בתרחיש: מחלת לב כלילית לאחר התערבות בעורק LAD בשנת 2018.", "ירידה בתפקוד חדר שמאל, יתר לחץ דם ודיסליפידמיה.", "קוצר נשימה במאמץ בינוני; ללא תסמינים במנוחה לפי התיאור הפיקטיבי."]),
  ("רשימת תרופות בדוגמה בלבד", ["אספירין | אטורבסטטין | ביסופרולול | רמיפריל | פורוסמיד.", "השמות משמשים לתרגול קליטת רשימת תרופות בלבד.", "המינונים, התדירות, תאריכי התחלה וההתאמה למטופל אינם מוגדרים.", "אין להשתמש ברשימה כמרשם או כהמלצה לטיפול."]),
  ("בדיקות מעבדה פיקטיביות", ["מועד בדיקה: 15.09.2026 | קריאטינין: 1.0 מ״ג/ד״ל.", "אשלגן: 4.3 מילימול/ליטר | המוגלובין: 13.8 גרם/ד״ל.", "LDL: 84 מ״ג/ד״ל. כל הערכים מומצאים לצורך בדיקת המערכת."]),
  ("מידע חסר בתרחיש", ["אין סיכום צנתור מקורי, תמונות אקו או השוואה מלאה לבדיקות קודמות.", "סיכום עתידי צריך לציין מידע חסר ולשמור על תאריכים ומקורות.", "נכתב כחומר בדיקה טכני - ללא רופא חתום וללא מסגרת רפואית אמיתית."]),
 ]),
]
manifest = []
for filename, title, date, sections in documents:
    path = OUT / filename
    c = canvas.Canvas(str(path), pagesize=A4, invariant=1)
    c.setTitle(title + " - מסמך פיקטיבי")
    c.setAuthor("CardioAhead - synthetic test fixture")
    c.setSubject("FICTIONAL TEST DOCUMENT - NOT A MEDICAL RECORD")
    c.setFillColor(colors.HexColor("#e9efe5"))
    c.rect(0, H - 56, W, 56, fill=1, stroke=0)
    c.setFillColor(INK); c.setFont("HebrewBold", 12)
    c.drawRightString(W - 40, H - 32, get_display("מסמך פיקטיבי לבדיקת מערכת - אינו מסמך רפואי אמיתי"))
    y = H - 90
    c.setFont("HebrewBold", 21); c.drawRightString(W - 40, y, get_display(title)); y -= 30
    c.setFont("Hebrew", 11); c.setFillColor(MUTED)
    c.drawRightString(W - 40, y, get_display("CardioAhead | תאריך פיקטיבי: " + date)); y -= 30
    for heading, paragraphs in sections:
        c.setStrokeColor(colors.HexColor("#dfe5dc")); c.line(40, y + 9, W - 40, y + 9)
        c.setFillColor(INK); c.setFont("HebrewBold", 13)
        c.drawRightString(W - 40, y - 8, get_display(heading)); y -= 31
        c.setFont("Hebrew", 11.5); c.setFillColor(MUTED)
        for paragraph in paragraphs:
            for line in textwrap.wrap(paragraph, width=78, break_long_words=False):
                c.drawRightString(W - 40, y, get_display(line)); y -= 18
        y -= 14
    assert y > 58, (filename, y)
    c.setStrokeColor(colors.HexColor("#dfe5dc")); c.line(40, 48, W - 40, 48)
    c.setFont("Hebrew", 10); c.setFillColor(MUTED)
    c.drawRightString(W - 40, 30, get_display("לבדיקת העלאה וצפייה בלבד | TEST-001 | עמוד 1 מתוך 1"))
    c.save()
    manifest.append({"filename": filename, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(), "label": title})
(ROOT / "src" / "lib" / "test-documents.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
print(json.dumps(manifest, ensure_ascii=True, indent=2))
