"use client";

import Image from "next/image";
import { useState } from "react";
import { type GalleryImage } from "@/data/gallery.data";

interface GalleryGridProps {
  images: GalleryImage[];
  onImageClick: (index: number) => void;
}

export default function GalleryGrid({ images, onImageClick }: GalleryGridProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      style={{
        columns: "3 280px",
        columnGap: "1rem",
        width: "100%",
      }}
    >
      {images.map((img, index) => (
        <div
          key={img.id}
          onClick={() => onImageClick(index)}
          onMouseEnter={() => setHoveredId(img.id)}
          onMouseLeave={() => setHoveredId(null)}
          style={{
            breakInside: "avoid",
            marginBottom: "1rem",
            position: "relative",
            overflow: "hidden",
            borderRadius: 8,
            cursor: "pointer",
            border: "1px solid #1F1F2E",
          }}
        >
          <Image
            src={img.src}
            alt={img.alt}
            width={img.width}
            height={img.height}
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            style={{
              width: "100%",
              height: "auto",
              display: "block",
              transition: "transform 0.4s ease",
              transform: hoveredId === img.id ? "scale(1.04)" : "scale(1)",
            }}
          />

          {/* Hover overlay */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,59,47,0.55)",
              opacity: hoveredId === img.id ? 1 : 0,
              transition: "opacity 0.3s ease",
              display: "flex",
              alignItems: "flex-end",
              padding: "1rem",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "#F0F2F8",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                transform: hoveredId === img.id ? "translateY(0)" : "translateY(8px)",
                transition: "transform 0.3s ease",
              }}
            >
              {img.caption}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
