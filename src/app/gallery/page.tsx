"use client";

import { useState } from "react";
import { galleryImages } from "@/data/gallery.data";
import GalleryGrid from "@/components/gallery/GalleryGrid";
import LightboxWrapper from "@/components/gallery/LightboxWrapper";

export default function GalleryPage() {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  function handleImageClick(index: number) {
    setLightboxIndex(index);
    setLightboxOpen(true);
  }

  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Header */}
      <div style={{ background: "rgba(8,8,12,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #1F1F2E", padding: "3rem 4rem" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.18em", color: "#FF3B2F", textTransform: "uppercase", marginBottom: "0.75rem", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
            Gallery
          </div>
          <h1 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(2rem,4vw,3rem)", color: "#F0F2F8", marginBottom: "0.5rem" }}>
            Infrastructure & Work
          </h1>
          <p style={{ color: "#787F96", fontSize: "1rem", maxWidth: 520 }}>
            A visual record of infrastructure deployments, system architecture, and engineering work across cloud and on-premises environments.
          </p>
        </div>
      </div>

      {/* Gallery */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "3rem 4rem" }}>
        <GalleryGrid images={galleryImages} onImageClick={handleImageClick} />
      </div>

      <LightboxWrapper
        images={galleryImages}
        open={lightboxOpen}
        index={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  );
}
