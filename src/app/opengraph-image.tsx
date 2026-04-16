import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Michael Wright — Cloud Infrastructure Architect";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "64px 72px",
          background: "#08080C",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Red accent bar */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 6,
            background: "#FF3B2F",
          }}
        />

        {/* Grid dots background */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle, rgba(255,59,47,0.06) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Bottom gradient */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 200,
            background: "linear-gradient(to top, #08080C, transparent)",
          }}
        />

        {/* Content */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16, position: "relative" }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.2em",
              color: "#FF3B2F",
              textTransform: "uppercase",
            }}
          >
            Cloud Infrastructure Architect · DevOps Engineer
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 800,
              color: "#F0F2F8",
              lineHeight: 1.1,
            }}
          >
            Michael Wright
          </div>
          <div style={{ fontSize: 22, color: "#787F96", marginTop: 4 }}>
            AWS · Kubernetes · Platform Engineering · FloAud.io
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            position: "absolute",
            bottom: 48,
            right: 72,
            fontSize: 14,
            color: "#3C3F52",
            letterSpacing: "0.08em",
          }}
        >
          michaelwright.work
        </div>
      </div>
    ),
    { ...size }
  );
}
