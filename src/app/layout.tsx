import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://cardioahead.com",
  ),
  title: {
    default: "CardioAhead | הכנה לביקור אצל פרופ׳ אלעד מאור",
    template: "%s | CardioAhead",
  },
  description:
    "מרחב ההכנה לביקור אצל פרופ׳ אלעד מאור. גרסת הדגמה — השירות עדיין אינו מקבל מסמכים רפואיים.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          דלגו לתוכן
        </a>
        {children}
      </body>
    </html>
  );
}
