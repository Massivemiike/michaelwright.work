import type { Metadata } from "next";
import "./globals.css";
import { syne, outfit, jetbrainsMono } from "@/lib/fonts";
import Nav from "@/components/layout/Nav";
import Footer from "@/components/layout/Footer";
import PageWrapper from "@/components/layout/PageWrapper";
import NodeNetworkCanvas from "@/components/background/NodeNetworkCanvas";
import AdminPanel from "@/components/background/AdminPanel";
import { NodeNetworkProvider } from "@/components/context/NodeNetworkContext";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://michaelwright.work"),
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
          <main style={{ position: "relative", zIndex: 10 }}>
            <PageWrapper>{children}</PageWrapper>
          </main>
          <Footer />
          <AdminPanel />
        </NodeNetworkProvider>
      </body>
    </html>
  );
}
