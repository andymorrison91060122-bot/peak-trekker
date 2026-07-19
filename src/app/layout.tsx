import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AnalyticsPageView from "@/components/analytics/AnalyticsPageView";
import HelpSheetProvider from "@/components/help/HelpSheetProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://peak-trekker.vercel.app"),
  title: "Peak Trekker",
  description: "记录你的登山之旅，挑战自我极限",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Peak Trekker",
    description: "记录你的登山之旅，挑战自我极限",
    type: "website",
    images: ["/opengraph-image.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Peak Trekker",
    description: "记录你的登山之旅，挑战自我极限",
    images: ["/opengraph-image.jpg"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#121416",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body className="antialiased">
        <HelpSheetProvider>
          <Suspense fallback={null}>
            <AnalyticsPageView />
          </Suspense>
          {children}
        </HelpSheetProvider>
      </body>
    </html>
  );
}
