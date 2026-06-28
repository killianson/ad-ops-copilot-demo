import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ad-ops Copilot — demo",
  description: "Mini copilote ad-ops : lit un export multi-canal, calcule les KPI, propose la réallocation.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
