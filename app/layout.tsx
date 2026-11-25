import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import { AppShell } from "@/components/AppShell";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const sora = Sora({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export const metadata: Metadata = {
  title: "DavidAI — Private Intelligence",
  description: "A warm, local-first workspace for thought, memory and images.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${manrope.variable} ${sora.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=JSON.parse(localStorage.getItem("davidai:settings")||"{}");var t=s.theme;var d=s.density;if(t==="dark"||t==="midnight"||t==="light")document.documentElement.setAttribute("data-theme",t);if(d==="comfortable"||d==="compact")document.documentElement.setAttribute("data-density",d)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
