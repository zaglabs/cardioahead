import type { Metadata, Viewport } from "next";
import { getTranslations } from "@/lib/i18n/server";
import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslations();
  return {
    metadataBase: new URL(
      process.env.NEXT_PUBLIC_SITE_URL || "https://www.cardioahead.com",
    ),
    title: {
      default: t("CardioAhead | הכנה לביקור אצל פרופ׳ אלעד מאור"),
      template: "%s | CardioAhead",
    },
    description: t(
      "מרחב ההכנה לביקור אצל פרופ׳ אלעד מאור. ריכוז מסמכים רפואיים לקראת הפגישה.",
    ),
    robots: { index: false, follow: false },
  };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { language, t } = await getTranslations();
  return (
    <html lang={language} dir={language === "he" ? "rtl" : "ltr"}>
      <body>
        <LanguageProvider initialLanguage={language}>
          <a className="skip-link" href="#main">
            {t("דלגו לתוכן")}
          </a>
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
