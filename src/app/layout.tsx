import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AnalyticsPageView from "@/components/analytics/AnalyticsPageView";
import HelpSheetProvider from "@/components/help/HelpSheetProvider";
import { SITE_ORIGIN } from "@/lib/site-url";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_ORIGIN),
  title: {
    default: "Peak Trekker - 登山、徒步路线与山峰记录",
    template: "%s | Peak Trekker",
  },
  description: "浏览山峰资料和徒步路线参考，记录真实登山与户外徒步活动。",
  keywords: ["登山", "徒步路线", "山峰资料", "登山记录", "户外徒步"],
  alternates: {
    canonical: SITE_ORIGIN,
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Peak Trekker - 登山、徒步路线与山峰记录",
    description: "浏览山峰资料和徒步路线参考，记录真实登山与户外徒步活动。",
    type: "website",
    url: SITE_ORIGIN,
    images: [`${SITE_ORIGIN}/opengraph-image.jpg`],
  },
  twitter: {
    card: "summary_large_image",
    title: "Peak Trekker - 登山、徒步路线与山峰记录",
    description: "浏览山峰资料和徒步路线参考，记录真实登山与户外徒步活动。",
    images: [`${SITE_ORIGIN}/opengraph-image.jpg`],
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
