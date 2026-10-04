import Link from "next/link";
import { SiteHeader, Footer } from "@/components/shell";
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="unavailable wrap">
        <div className="unavailable-card">
          <span className="eyebrow">404</span>
          <h1>העמוד לא נמצא.</h1>
          <p>אפשר לחזור לעמוד הבית ולהמשיך משם.</p>
          <Link className="button button-dark" href="/">
            לעמוד הבית
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
