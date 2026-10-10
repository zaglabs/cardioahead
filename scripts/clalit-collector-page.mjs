function client(nonce, interactive) {
  const fragment = new URLSearchParams(location.hash.slice(1)),
    token = fragment.get("token") || "";
  let language = fragment.get("lang") === "en" ? "en" : "he",
    inFlight = false,
    manifestKey = "",
    closed = false;
  history.replaceState(null, "", "/connect");
  document.documentElement.lang = language;
  document.documentElement.dir = language === "he" ? "rtl" : "ltr";
  const w = (he, en) => (language === "he" ? he : en),
    $ = (id) => document.getElementById(id);
  $("title").textContent = w(
    "ייבוא מכללית למרפאה",
    "Import Clalit records for your clinic",
  );
  $("intro").textContent = w(
    "התחברו לכללית בעצמכם. הסיסמה וקוד ההתחברות אינם נשלחים למרפאה. המסמכים המקוריים נשארים בכללית.",
    "Sign into Clalit yourself. Your password and login code are not sent to the clinic. Original documents remain in Clalit.",
  );
  $("start").textContent = w(
    "1. פתיחת כללית והתחברות",
    "1. Open Clalit and sign in",
  );
  $("own-label").textContent = w(
    "בחרתי את הפרופיל האישי שלי בכללית.",
    "I selected my own profile in Clalit.",
  );
  $("collect").textContent = w(
    "2. התחברתי — איסוף הרשומות",
    "2. I signed in — collect records",
  );
  $("legend").textContent = w(
    "3. בדקו את המקורות להעברה",
    "3. Review the sources to import",
  );
  $("transfer").textContent = w(
    "ייבוא המקורות שנבחרו למרפאה",
    "Import selected records to the clinic",
  );
  $("close").textContent = w(
    "סגירת האספן ומחיקת המידע הזמני",
    "Close collector and clear temporary data",
  );
  $("limits").textContent = w(
    "האיסוף חלקי: לא כל הדוחות נתמכים. המרפאה מקבלת סיכום, הפניות וקטעי ראיה קצרים. פתיחת כללית לבדה אינה מעבירה מידע.",
    "Collection is partial: not all reports are supported. The clinic receives a summary, references and short evidence excerpts. Opening Clalit alone does not send information.",
  );
  $("controls").hidden = !interactive;
  function setStatus(text, loading = false) {
    $("status").textContent = text;
    if (loading) {
      const heart = document.createElement("span");
      heart.className = "heart";
      heart.textContent = "♡ ";
      heart.setAttribute("aria-hidden", "true");
      $("status").prepend(heart);
    }
  }
  async function call(path, extra = {}) {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Collector-Nonce": nonce,
      },
      body: JSON.stringify({ token, ...extra }),
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(
        data.message ||
          w(
            "הפעולה לא הושלמה. פנו למרפאה לעזרה.",
            "The action could not be completed. Ask the clinic for help.",
          ),
      );
    return data;
  }
  async function refresh() {
    if (inFlight || closed) return;
    if (!token) {
      $("target").textContent = w(
        "חזרו לקישור ההזמנה ולחצו על ״פתיחת החיבור לכללית״.",
        "Return to your invitation and click “Open Clalit connection”.",
      );
      $("start").disabled = true;
      $("collect").disabled = true;
      return;
    }
    try {
      const data = await call("/status"),
        workflow = data.workflow || {},
        records = data.manifest || [];
      $("error").textContent = "";
      $("target").textContent =
        w("המידע מיועד לתיק של: ", "Patient card: ") +
        data.target.patient_label;
      $("counts").textContent =
        data.counts.record_count +
        " " +
        w("מקורות / ", "sources / ") +
        data.counts.entry_count +
        " " +
        w("רשומות שנקראו זמנית.", "entries read temporarily.");
      const key = records.map((record) => record.id).join(",");
      if (key !== manifestKey) {
        manifestKey = key;
        $("manifest").replaceChildren();
        for (const record of records) {
          const label = document.createElement("label");
          label.className = "source";
          const box = document.createElement("input");
          box.type = "checkbox";
          box.checked = true;
          box.value = record.id;
          const text = document.createElement("span");
          text.textContent =
            record.title +
            " · " +
            (record.record_date || w("התאריך אינו ידוע", "Date unavailable")) +
            " · " +
            record.entry_count +
            " " +
            w("רשומות", "entries");
          label.append(box, text);
          $("manifest").append(label);
        }
      }
      $("sources").hidden = !records.length;
      const processing = ["received", "generating"].includes(
          data.target.status,
        ),
        ready = data.target.status === "ready",
        collecting = data.counts.running || workflow.stage === "collecting";
      $("transfer").disabled =
        !records.length ||
        collecting ||
        processing ||
        ready ||
        !document.querySelector("#manifest input:checked");
      $("start").disabled = collecting || processing || ready;
      $("collect").disabled =
        !$("own").checked ||
        collecting ||
        processing ||
        ready ||
        !["signin", "review", "error"].includes(workflow.stage);
      if (ready)
        setStatus(
          w(
            "הייבוא הושלם. הסיכום נשמר בתיק המרפאה. המידע הזמני נמחק.",
            "Import complete. The summary is saved in the clinic record. Temporary source text has been cleared.",
          ),
        );
      else if (processing)
        setStatus(
          w(
            "המידע התקבל. Claude מכין את הסיכום למרפאה.",
            "Information received. Claude is preparing the clinic summary.",
          ),
          true,
        );
      else if (collecting)
        setStatus(
          w(
            "קוראים את הרשומות הנתמכות. המתינו לסיום האיסוף.",
            "Reading supported records. Please wait for collection to finish.",
          ),
          true,
        );
      else if (data.target.status === "failed")
        setStatus(
          w(
            "העיבוד לא הושלם. פתחו חיבור חדש מתוך ההזמנה.",
            "Processing did not finish. Open a new connection from your invitation.",
          ),
        );
      else if (workflow.stage === "signin")
        setStatus(
          w(
            "התחברו בחלון כללית, בחרו את הפרופיל שלכם וחזרו לכאן.",
            "Sign in in the Clalit window, select your own profile, then return here.",
          ),
        );
      else if (records.length)
        setStatus(
          w(
            "בדקו את שמות המקורות והתאריכים, ואז לחצו על ייבוא.",
            "Review source names and dates, then click Import.",
          ),
        );
      else if (workflow.stage === "error")
        setStatus(
          w(
            "לא ניתן לקרוא רשומות נתמכות כרגע. בדקו את ההתחברות או פנו למרפאה.",
            "No supported records could be read yet. Check your sign-in or ask the clinic for help.",
          ),
        );
      else
        setStatus(
          w(
            "החיבור למרפאה מוכן. פתחו את כללית כדי להתחיל.",
            "The clinic connection is ready. Open Clalit to start.",
          ),
        );
    } catch (reason) {
      $("error").textContent = reason.message;
      $("transfer").disabled = true;
    }
  }
  async function perform(path, body) {
    inFlight = true;
    $("error").textContent = "";
    try {
      setStatus(w("מעבדים את הבקשה…", "Processing your request…"), true);
      await call(path, body);
    } catch (reason) {
      $("error").textContent = reason.message;
    } finally {
      inFlight = false;
      await refresh();
    }
  }
  $("start").onclick = () => void perform("/start-clalit");
  $("collect").onclick = () =>
    void perform("/collect", { own_account: $("own").checked });
  $("own").onchange = () => void refresh();
  $("manifest").onchange = () => void refresh();
  $("transfer").onclick = () =>
    void perform("/transfer", {
      source_ids: [...document.querySelectorAll("#manifest input:checked")].map(
        (box) => box.value,
      ),
    });
  $("close").onclick = async () => {
    try {
      await call("/close");
      closed = true;
      setStatus(
        w(
          "האספן נסגר והמידע הזמני נמחק. חזרו להזמנה.",
          "The collector is closed and temporary data cleared. Return to your invitation.",
        ),
      );
      $("controls").hidden = true;
      $("sources").hidden = true;
      $("transfer").hidden = true;
    } catch (reason) {
      $("error").textContent = reason.message;
    }
  };
  void refresh();
  setInterval(refresh, 5000);
}
export function renderCollectorPage(nonce, interactive) {
  const html =
    '<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CardioAhead — Clalit collector</title><style>body{font:20px/1.8 system-ui;background:#f4f7ee;color:#1b4032;margin:0;padding:clamp(18px,4vw,48px)}main{max-width:1000px;margin:auto;background:#fff;padding:clamp(23px,4vw,45px);border:1px solid #dbe5d2;border-radius:26px}h1{font-size:clamp(28px,4vw,38px);line-height:1.35}button{font:inherit;cursor:pointer;background:#214b38;color:#fff;border:0;padding:17px 25px;border-radius:13px;min-height:60px;display:inline-flex;align-items:center;justify-content:center;gap:12px}button:disabled{opacity:.48;cursor:default}label{display:flex;align-items:flex-start;gap:15px}input[type=checkbox]{width:25px;height:25px;min-width:25px;margin-top:6px;accent-color:#214b38}.note{background:#f2f6e9;padding:20px;border-radius:17px}.error{color:#a34126}.source{padding:17px;border:1px solid #dfe7d6;border-radius:14px;margin-block:12px}fieldset{border:1px solid #dce6d1;border-radius:19px;padding:21px}legend{padding:8px;font-weight:650}#controls{display:grid;gap:24px;margin-block:25px}#controls[hidden]{display:none}#status{margin-block:23px}#close{background:#f3f6ec;color:#315339;margin-top:25px;width:100%}.heart{display:inline-block;animation:beat 1.35s infinite;transform-origin:center;color:#6f885e;font-size:34px}@keyframes beat{0%,40%,100%{transform:scale(1)}12%{transform:scale(1.18)}22%{transform:scale(.99)}30%{transform:scale(1.12)}}@media(prefers-reduced-motion:reduce){.heart{animation:none}}@media(max-width:650px){body{font-size:19px}button{width:100%}}</style></head><body><main><h1 id="title"></h1><p id="intro"></p><p class="note" id="target"></p><section id="controls"><button id="start"></button><label><input id="own" type="checkbox"><span id="own-label"></span></label><button id="collect" disabled></button></section><p id="counts"></p><fieldset id="sources" hidden><legend id="legend"></legend><div id="manifest"></div></fieldset><p id="status" role="status" aria-live="polite"></p><button id="transfer" disabled></button><p id="error" class="error" role="alert"></p><p id="limits" class="note"></p><button id="close"></button></main>';
  return (
    html +
    '<script nonce="' +
    nonce +
    '">(' +
    client.toString() +
    ")(" +
    JSON.stringify(nonce) +
    "," +
    JSON.stringify(interactive) +
    ");</script></body></html>"
  );
}
