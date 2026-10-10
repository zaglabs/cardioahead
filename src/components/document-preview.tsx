"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Download,
  LoaderCircle,
} from "lucide-react";
import { useLanguage } from "./language-provider";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";
type Target = { id: string; filename: string; page?: number; url?: string };
const PreviewContext = createContext<(target: Target) => void>(() => {});
export const useDocumentPreview = () => useContext(PreviewContext);
export function DocumentPreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  function open(target: Target) {
    opener.current = document.activeElement as HTMLElement;
    setTarget(target);
  }
  function close() {
    setTarget(null);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
    });
  }
  return (
    <PreviewContext.Provider value={open}>
      {children}
      {target && (
        <DocumentPreview
          key={target.id + ":" + target.page + ":" + target.url}
          target={target}
          onClose={close}
        />
      )}
    </PreviewContext.Provider>
  );
}
function PdfPage({
  pdf,
  page,
  zoom,
}: {
  pdf: PDFDocumentProxy;
  page: number;
  zoom: number;
}) {
  const { t } = useLanguage(),
    canvas = useRef<HTMLCanvasElement>(null),
    container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600),
    [error, setError] = useState("");
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let alive = true,
      task: RenderTask | undefined;
    async function draw() {
      try {
        const source = await pdf.getPage(page),
          element = canvas.current;
        if (!alive || !element) return;
        const base = source.getViewport({ scale: 1 });
        const scale = (Math.max(100, width - 24) / base.width) * zoom;
        const pixelRatio = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(8000000 / (base.width * base.height * scale * scale)),
        );
        const view = source.getViewport({ scale: scale * pixelRatio });
        element.width = Math.floor(view.width);
        element.height = Math.floor(view.height);
        element.style.width = base.width * scale + "px";
        element.style.height = base.height * scale + "px";
        task = source.render({
          canvas: element,
          canvasContext: element.getContext("2d")!,
          viewport: view,
        });
        await task.promise;
        if (alive) setError("");
      } catch (e) {
        if (alive && (e as Error).name !== "RenderingCancelledException")
          setError(t("לא הצלחנו להציג את העמוד הזה."));
      }
    }
    void draw();
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [pdf, page, zoom, width, t]);
  return (
    <div className="pdf-page-scroll" ref={container}>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <canvas ref={canvas} role="img" aria-label={t("עמוד") + " " + page} />
    </div>
  );
}
function DocumentPreview({
  target,
  onClose,
}: {
  target: Target;
  onClose: () => void;
}) {
  const { t } = useLanguage(),
    dialog = useRef<HTMLDialogElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(target.page || 1),
    [zoom, setZoom] = useState(1),
    [download, setDownload] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let alive = true,
      loading: PDFDocumentLoadingTask | undefined,
      url = "";
    async function load() {
      try {
        const renderer = await import("pdfjs-dist/legacy/build/pdf.mjs");
        renderer.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const response = await fetch(
          target.url || "/api/clinic/documents/" + target.id,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) {
          const result = await response.json();
          throw new Error(result.message);
        }
        const bytes = await response.arrayBuffer();
        if (!alive) return;
        url = URL.createObjectURL(
          new Blob([bytes], { type: "application/pdf" }),
        );
        setDownload(url);
        loading = renderer.getDocument({
          data: new Uint8Array(bytes),
          useSystemFonts: true,
        });
        const document = await loading.promise;
        if (!alive) {
          await loading.destroy();
          return;
        }
        setPdf(document);
        setPage(Math.max(1, Math.min(target.page || 1, document.numPages)));
      } catch (e) {
        if (alive)
          setError((e as Error).message || t("לא הצלחנו לפתוח את המסמך."));
      }
    }
    void load();
    return () => {
      alive = false;
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      void loading?.destroy();
    };
  }, [target.id, target.page, target.url, t]);
  return (
    <dialog
      className="document-lightbox"
      ref={dialog}
      aria-labelledby="document-preview-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="document-lightbox-shell">
        <header className="document-lightbox-header">
          <h2 id="document-preview-title" dir="auto">
            {target.filename}
          </h2>
          <button
            className="icon-button"
            autoFocus
            aria-label={t("סגירת המסמך")}
            onClick={onClose}
          >
            <X size={24} />
          </button>
        </header>
        {pdf && (
          <div className="pdf-toolbar">
            <button
              className="icon-button"
              aria-label={t("עמוד קודם")}
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={20} />
            </button>
            <span>
              {t("עמוד")} {page} / {pdf.numPages}
            </span>
            <button
              className="icon-button"
              aria-label={t("עמוד הבא")}
              disabled={page >= pdf.numPages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={20} />
            </button>
            <button
              className="icon-button"
              aria-label={t("הקטנה")}
              disabled={zoom <= 0.75}
              onClick={() => setZoom(Math.max(0.75, zoom - 0.25))}
            >
              <ZoomOut size={20} />
            </button>
            <span>{Math.round(zoom * 100)}%</span>
            <button
              className="icon-button"
              aria-label={t("הגדלה")}
              disabled={zoom >= 2}
              onClick={() => setZoom(Math.min(2, zoom + 0.25))}
            >
              <ZoomIn size={20} />
            </button>
            {download && (
              <a
                className="text-button"
                href={download}
                download={target.filename}
              >
                <Download size={17} />
                {t("הורדת המסמך")}
              </a>
            )}
          </div>
        )}
        {!pdf && !error && (
          <div className="pdf-loading" role="status">
            <LoaderCircle className="spin" size={26} />
            {t("טוענים את המסמך…")}
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {t(error)}
          </p>
        )}
        {pdf && <PdfPage pdf={pdf} page={page} zoom={zoom} />}
      </div>
    </dialog>
  );
}
