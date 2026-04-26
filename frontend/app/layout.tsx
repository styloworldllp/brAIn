import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "brAIn — Intelligent Data Analysis",
  description: "Explore and analyse your data effortlessly with brAIn, your AI-powered analyst.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var t = localStorage.getItem('brain-theme') || 'dark';
              var h = document.documentElement;
              h.classList.remove('dark', 'light', 'stylogreen');
              if (t === 'light') h.classList.add('light');
              else if (t === 'stylogreen') h.classList.add('stylogreen');
              else if (t === 'system') {
                h.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
              } else {
                h.classList.add('dark');
              }
            } catch(e) {}
          })();
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
