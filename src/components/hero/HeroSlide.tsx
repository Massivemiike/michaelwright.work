import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import HeroTextReveal from "./HeroTextReveal";
import type { HeroSlideData } from "@/data/heroSlides.data";

interface HeroSlideProps {
  slide: HeroSlideData;
  isActive: boolean;
  priority: boolean;
}

export default function HeroSlide({ slide, isActive, priority }: HeroSlideProps) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        flexShrink: 0,
      }}
    >
      {/* Layer 1 — Photo */}
      <Image
        src={slide.imageSrc}
        alt={slide.imageAlt}
        fill
        priority={priority}
        style={{ objectFit: "cover", objectPosition: "center" }}
        sizes="100vw"
      />

      {/* Layer 2+3 — Dark gradient + red wash */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: `
            linear-gradient(to bottom, rgba(8,8,12,0.55) 0%, rgba(8,8,12,0.1) 30%, rgba(8,8,12,0.1) 55%, rgba(8,8,12,0.95) 100%),
            radial-gradient(ellipse 55% 90% at -8% 50%, rgba(255,59,47,0.16) 0%, transparent 65%)
          `,
          zIndex: 1,
        }}
      />

      {/* Layer 4 — Noise texture */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 2,
          opacity: 0.06,
          mixBlendMode: "overlay",
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          backgroundSize: "128px 128px",
          animation: "noiseShift 0.15s steps(1) infinite",
        }}
      />

      {/* Layer 5 — Scanlines */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 3,
          opacity: 0.04,
          mixBlendMode: "multiply",
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.8) 2px, rgba(0,0,0,0.8) 4px)",
          backgroundSize: "100% 4px",
        }}
      />

      {/* Layer 6 — Text content */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 4,
          display: "flex",
          alignItems: "flex-end",
          padding: "0 4rem 4rem",
        }}
      >
        <div style={{ maxWidth: 680 }}>
          {/* Left border + eyebrow */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={isActive ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 4,
                height: 28,
                background: "#FF3B2F",
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: "#7FDBFF",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              }}
            >
              {slide.eyebrow}
            </span>
          </motion.div>

          {/* Headline */}
          <HeroTextReveal lines={slide.headline} isActive={isActive} />

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: 0.45, delay: 0.55 }}
            style={{
              color: "#787F96",
              fontSize: "clamp(0.9375rem,1.25vw,1.125rem)",
              lineHeight: 1.7,
              maxWidth: 500,
              marginBottom: "2rem",
            }}
          >
            {slide.subheadline}
          </motion.p>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={isActive ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
            transition={{ duration: 0.35, delay: 0.7 }}
          >
            <Link
              href={slide.ctaHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.75rem",
                background: "#FF3B2F",
                color: "#F0F2F8",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                letterSpacing: "0.01em",
              }}
            >
              {slide.ctaLabel}
              <span style={{ fontSize: "1rem", lineHeight: 1 }}>→</span>
            </Link>
          </motion.div>
        </div>
      </div>

      <style>{`
        @keyframes noiseShift {
          0%   { background-position: 0 0; }
          25%  { background-position: 32px 16px; }
          50%  { background-position: 16px 48px; }
          75%  { background-position: 48px 32px; }
          100% { background-position: 0 0; }
        }
      `}</style>
    </div>
  );
}
