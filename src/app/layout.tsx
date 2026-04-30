import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/nav";
import { Toaster } from "@/components/ui/sonner";

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
  title: "Homix Invoice Suite",
  description: "OP Invoice generation and sending for Homix Living",
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
        <Nav />
        <main className="flex-1">
          <div className="mx-auto max-w-[1280px] px-8 py-10">
            {children}
          </div>
        </main>
        <footer
          className="mx-auto max-w-[1280px] px-8 py-10 flex items-center justify-between text-[11px] w-full"
          style={{ color: "#7A756C" }}
        >
          <div className="font-mono">homix-invoice v2.0</div>
          <div>© 2026 Homix Living · Made with care in NYC</div>
        </footer>
        <Toaster />
      </body>
    </html>
  );
}
