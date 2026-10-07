import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "AKH Mastani · Team Hub", template: "%s · AKH Mastani" },
  description: "The private team space for AKH Mastani.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
