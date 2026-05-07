import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AML Investigation Agent",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning className="bg-white text-neutral-800 font-mono">
        {children}
      </body>
    </html>
  );
}
