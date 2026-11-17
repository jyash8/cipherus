import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./cipherus.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cipherus — Local encrypted vault",
  description:
    "A local-only password manager with AES-256-GCM encrypted credential storage.",
};

/**
 * Applies the persisted accent and background before the first paint so the
 * shell never flashes the default theme. Mirrors `src/lib/theme.ts`.
 */
const THEME_SCRIPT = `(function(){try{var raw=localStorage.getItem("cipherus.theme.v1");if(!raw)return;var theme=JSON.parse(raw);var root=document.documentElement;if(theme&&["sky","indigo","violet","emerald","rose","amber"].indexOf(theme.accent)!==-1){root.dataset.accent=theme.accent}if(theme&&["black","slate"].indexOf(theme.surface)!==-1){root.dataset.bg=theme.surface}}catch(error){}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-accent="sky"
      data-bg="black"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
