import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Gallery",
  description: "Infrastructure deployments, system architecture, and engineering work across cloud and on-premises environments.",
  path: "/gallery",
});

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
