import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Capital360IPO | IPO & Financial Markets",
    template: "%s | Capital360IPO",
  },
  description:
    "Explore IPO information, company research, financial results and stock market insights with Capital360IPO.",
  applicationName: "Capital360IPO",
  keywords: [
    "IPO",
    "Upcoming IPO",
    "IPO GMP",
    "IPO Allotment",
    "Stock Market",
    "Financial Research",
    "Capital360IPO",
  ],
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
