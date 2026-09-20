import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Model Router",
  description: "A small model routing experiment powered by Jev.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
