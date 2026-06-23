import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Deep Work Tracker Pro — Enterprise Focus Intelligence Dashboard",
  description: "AI-powered enterprise-grade productivity analysis platform. Monitor real-time operator presence, track cognitive flow efficiency, and optimize team performance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
