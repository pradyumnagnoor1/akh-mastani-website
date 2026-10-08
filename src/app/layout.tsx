import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistration } from "@/components/pwa-registration";
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
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <PwaRegistration />
        {children}
      </body>
    </html>
  );
}
