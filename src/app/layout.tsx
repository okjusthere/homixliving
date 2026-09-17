import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/components/session-provider";
import { AppShell } from "@/components/app-shell";
import { SafeAnalytics } from "@/components/safe-analytics";
import { OfflineStatus } from "@/components/offline-status";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Homix",
  description: "Rental and sales deal intake, commissions, and invoice workflow for Homix.",
  appleWebApp: {
    capable: true,
    title: "Homix Agents",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "contain",
  themeColor: "#F7F4EE",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col" style={{ background: "#F7F4EE", color: "#1A1814" }}>
        <SessionProvider>
          <AppShell>{children}</AppShell>
          <OfflineStatus />
          <Toaster />
        </SessionProvider>
        <SafeAnalytics />
      </body>
    </html>
  );
}
