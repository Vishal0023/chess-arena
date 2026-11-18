import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Arena — Play Online, Personal Rooms & Assisted Mode",
  description:
    "Play chess online against random opponents or friends in personal rooms. Supports Guest & Gmail login, plus Assisted (legal move dots) and Normal modes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-arena-bg text-white antialiased">{children}</body>
    </html>
  );
}
