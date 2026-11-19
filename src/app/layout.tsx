import type { Metadata } from "next";
import { connection } from "next/server";
import { Be_Vietnam_Pro, Geist, Geist_Mono, Permanent_Marker } from "next/font/google";
import { Providers } from "@/components/providers";
import { TopNav } from "@/components/top-nav";
import { I18nProvider } from "@/lib/i18n";
import { toUiLocale } from "@/lib/i18n/core";
import { getSetting } from "@/lib/settings";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const marker = Permanent_Marker({ variable: "--font-marker", weight: "400", subsets: ["latin"] });
// Geist has no Vietnamese letters; this face is used for the UI when the app language is Vietnamese.
const vietnamese = Be_Vietnam_Pro({ variable: "--font-vietnamese", weight: ["400", "500", "600", "700"], subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Doodle Studio",
  description: "From idea to narrated doodle video",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Settings → App language lives in the SQLite settings table: read it per request, not at build time.
  await connection();
  const locale = toUiLocale(getSetting("UI_LANGUAGE"));
  return (
    <html
      lang={locale}
      data-ui-lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} ${marker.variable} ${vietnamese.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <I18nProvider locale={locale}>
          <Providers>
            <TopNav />
            <div className="flex-1 flex flex-col">{children}</div>
          </Providers>
        </I18nProvider>
      </body>
    </html>
  );
}
