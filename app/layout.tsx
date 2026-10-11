import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const DESCRIPTION =
  "Customers show the problem on their phone camera while an AI assistant guides them through approved steps, with a human expert one tap away and full context on handover.";

export const metadata: Metadata = {
  metadataBase: process.env.NEXT_PUBLIC_SITE_URL ? new URL(process.env.NEXT_PUBLIC_SITE_URL) : undefined,
  title: { default: "Absolute Intelligence Visual Assist", template: "%s · Visual Assist" },
  description: DESCRIPTION,
  applicationName: "Visual Assist",
  openGraph: {
    type: "website",
    siteName: "Absolute Intelligence Visual Assist",
    title: "Absolute Intelligence Visual Assist: interactive demo",
    description: DESCRIPTION,
    images: [{ url: "images/og.jpg", width: 1200, height: 630, alt: "Customer phone and agent console during a Visual Assist session" }],
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1b33",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-GB" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
