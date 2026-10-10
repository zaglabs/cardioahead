"use client";
import { useRef, useState } from "react";
import { FolderOpen, FileText } from "lucide-react";
import { useLanguage } from "./language-provider";
export function DocumentDropzone({
  busy,
  onFiles,
}: {
  busy: boolean;
  onFiles: (files: File[]) => void;
}) {
  const { t } = useLanguage(),
    input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className={
        "demo-upload-area document-dropzone" +
        (dragging && !busy ? " dragging" : "")
      }
      aria-disabled={busy}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node))
          setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <FolderOpen size={30} />
      <strong>{t("גררו לכאן קובצי PDF, או בחרו קבצים")}</strong>
      <span>{t("PDF בלבד · עד 4 MB לקובץ · עד 10 מסמכים")}</span>
      <button
        type="button"
        className="button button-dark"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? t("מעלים מסמכים…") : t("בחרו קבצים")}
        <FileText size={17} />
      </button>
      <input
        ref={input}
        className="file-input"
        type="file"
        accept=".pdf,application/pdf"
        multiple
        aria-label={t("בחירת קובצי PDF")}
        disabled={busy}
        onChange={(event) => {
          const files = Array.from(event.target.files || []);
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
