"use client";
import { useRef, useState } from "react";
import { useLanguage } from "./language-provider";
import { DocumentDropzone } from "./document-dropzone";
import type { AppointmentView } from "@/lib/portal/types";
type Item = {
  file: File;
  state: "waiting" | "uploading" | "failed";
  error?: string;
};
export function ClinicDocumentUpload({
  appointment,
  onUploaded,
  onPrepared,
}: {
  appointment: AppointmentView;
  onUploaded: () => Promise<void>;
  onPrepared: () => void;
}) {
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false),
    [queue, setQueue] = useState<Item[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const endpoint = "/api/clinic/appointments/" + appointment.id;
  async function upload(files: File[]) {
    if (lock.current || !files.length) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setConfirmed(false);
    setQueue(files.map((file) => ({ file, state: "waiting" })));
    try {
      for (const file of files) {
        setQueue((items) =>
          items.map((item) =>
            item.file === file ? { ...item, state: "uploading" } : item,
          ),
        );
        try {
          const data = new FormData();
          data.append("file", file);
          const response = await fetch(endpoint + "/documents", {
            method: "POST",
            body: data,
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.message);
          setQueue((items) => items.filter((item) => item.file !== file));
        } catch (e) {
          setQueue((items) =>
            items.map((item) =>
              item.file === file
                ? { ...item, state: "failed", error: (e as Error).message }
                : item,
            ),
          );
        }
      }
      await onUploaded();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function prepare() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint + "/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message);
      await onUploaded();
      onPrepared();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="clinic-upload">
      <h3>{t("העלאת מסמכים מהמרפאה")}</h3>
      <DocumentDropzone busy={busy} onFiles={(files) => void upload(files)} />
      <div className="document-options" aria-live="polite">
        {queue.map((item, index) => (
          <div className="upload-queue-row" key={index}>
            <strong dir="auto">{item.file.name}</strong>
            <span>
              {item.state === "uploading"
                ? t("מעלה…")
                : item.state === "waiting"
                  ? t("ממתין להעלאה")
                  : t(item.error || "ההעלאה לא הושלמה.")}
            </span>
            {item.state === "failed" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  setQueue((items) => items.filter((value) => value !== item))
                }
              >
                {t("הסרה מהרשימה")}
              </button>
            )}
          </div>
        ))}
      </div>
      <label className="consent-check">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>
          {t(
            "בדקתי שהמסמכים שייכים לתיק הבדיקה, ואני מאשר/ת עיבוד באמצעות שירות AI מאושר.",
          )}
        </span>
      </label>
      <button
        className="button button-dark"
        disabled={
          busy ||
          !confirmed ||
          queue.length > 0 ||
          appointment.documents.length === 0
        }
        onClick={() => void prepare()}
      >
        {busy ? t("שומרים ומכינים…") : t("הכנת סיכום לקראת הביקור")}
      </button>
      <p className="form-note">
        {t(
          "לאחר תחילת הניתוח, המסמכים ננעלים כדי לשמור על התאמה לסיכום. ההסבר החזותי יוצע וייווצר רק לפי בקשת הרופא.",
        )}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {t(error)}
        </p>
      )}
    </div>
  );
}
