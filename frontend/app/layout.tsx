import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "brAIn — AI Data Analyst",
  description: "Chat with your data using Claude AI",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
