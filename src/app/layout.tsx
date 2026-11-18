import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";

import { themeInitScript } from "@/components/layout/theme-toggle";
import { publicEnv } from "@/lib/env";

import "./globals.css";

// Every page reads the signed-in session (cookies), so nothing may be prerendered with a baked-in auth state.
export const dynamic = "force-dynamic";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(publicEnv.siteUrl),
  title: { default: "AI SHS Ghana — AI-powered school management and learning", template: "%s · AI SHS Ghana" },
  description: "One platform for Ghanaian Senior High Schools: school management, AI-powered learning, WASSCE preparation and parent communication.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1120" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GH" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
