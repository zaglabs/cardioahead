import { getTranslations } from "@/lib/i18n/server";
import Link from "next/link";
import { SiteHeader, Footer } from "@/components/shell";
export default async function NotFound() {
  const { t } = await getTranslations();

  return (
    <>
      <SiteHeader />
      <main id="main" className="unavailable wrap">
        <div className="unavailable-card">
          <span className="eyebrow">404</span>
          <h1>{t("העמוד לא נמצא.")}</h1>
          <p>{t("אפשר לחזור לעמוד הבית ולהמשיך משם.")}</p>
          <Link className="button button-dark" href="/">
            {t("לעמוד הבית")}
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
