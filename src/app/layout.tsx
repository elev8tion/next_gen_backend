import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NavUser } from "./nav-user";
import { NavLinks } from "./nav-links";

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
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Next Gen Backend
            </Link>
            <div className="flex items-center gap-6 text-sm">
              <NavLinks />
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
