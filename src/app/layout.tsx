import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavUser } from "./nav-user";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Next Gen Backend",
  description: "AI Backend Generator Engine",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <nav className="border-b border-card-border bg-card px-6 py-3">
          <div className="mx-auto flex max-w-7xl items-center justify-between">
            <a href="/" className="text-lg font-semibold tracking-tight">
              Next Gen Backend
            </a>
            <div className="flex items-center gap-6 text-sm">
              <a href="/" className="text-muted hover:text-foreground transition-colors">
                Dashboard
              </a>
              <a href="/modules" className="text-muted hover:text-foreground transition-colors">
                Modules
              </a>
              <a href="/composer" className="text-muted hover:text-foreground transition-colors">
                Composer
              </a>
              <a href="/workers" className="text-muted hover:text-foreground transition-colors">
                Workers
              </a>
              <NavUser />
            </div>
          </div>
        </nav>
        <main className="mx-auto max-w-7xl px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
