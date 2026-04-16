import type { Metadata } from "next";
import "./globals.css";
import { syne, outfit, jetbrainsMono } from "@/lib/fonts";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import NodeNetworkCanvas from "@/components/background/NodeNetworkCanvas";
import AdminPanel from "@/components/background/AdminPanel";
import { NodeNetworkProvider } from "@/components/context/NodeNetworkContext";

export const metadata: Metadata = {
  title: {
    default: "Michael Wright — Cloud Infrastructure Architect",
    template: "%s | Michael Wright",
  },
  description:
    "DevOps & Systems Engineer specializing in AWS cloud infrastructure, platform reliability, and engineering leadership.",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://michaelwright.work",
    siteName: "Michael Wright",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${syne.variable} ${outfit.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <NodeNetworkProvider>
          <NodeNetworkCanvas />
          <Nav />
          <main style={{ position: "relative", zIndex: 10 }}>{children}</main>
          <Footer />
          <AdminPanel />
        </NodeNetworkProvider>
      </body>
    </html>
  );
}
