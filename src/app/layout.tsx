import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { PageRefresh } from "@/components/page-refresh";
import { PwaRegistration } from "@/components/pwa-registration";
const bodyFont = localFont({
  src: "./fonts/hanken-grotesk.ttf",
  variable: "--font-body",
  weight: "100 900",
  display: "swap",
});
const headingFont = localFont({
  src: "./fonts/barlow-condensed-semibold.ttf",
  variable: "--font-heading",
  weight: "600",
  display: "swap",
});
export const metadata: Metadata = {
  title: { default: "AKH Mastani · Team Hub", template: "%s · AKH Mastani" },
  description: "The private team space for AKH Mastani.",
  applicationName: "AKH Mastani",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black",
    title: "Mastani",
  },
  icons: { apple: "/apple-icon.png" },
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: "#0b0b10" };
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <PwaRegistration />
        <PageRefresh />
        {children}
      </body>
    </html>
  );
}
