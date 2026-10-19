import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { MeProvider } from "@/lib/me";
import "./globals.css";

export const metadata: Metadata = { title: "Retroboard", description: "Team retrospectives" };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <MeProvider>{children}</MeProvider>
      </body>
    </html>
  );
}
