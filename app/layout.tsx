import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DraftProvider } from "@/context/DraftContext";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Eblast Drafter — Great Lakes Management",
  description: "Agentic eblast drafting and HubSpot publishing for Great Lakes Management's senior-living communities.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans"><DraftProvider>{children}</DraftProvider></body>
    </html>
  );
}
