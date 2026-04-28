import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eblast Drafter",
  description: "Push designed marketing emails into HubSpot",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
