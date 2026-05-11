import type { Metadata, Viewport } from "next";
import HelpSheetProvider from "@/components/help/HelpSheetProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Peak Trekker",
  description: "记录你的登山之旅，挑战自我极限",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh">
      <body className="antialiased">
        <HelpSheetProvider>{children}</HelpSheetProvider>
      </body>
    </html>
  );
}
