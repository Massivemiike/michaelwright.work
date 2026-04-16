import type { Metadata } from "next";

export const metadata: Metadata = { title: "Resume" };

export default function ResumePage() {
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, padding: "calc(66px + 4rem) 3rem 4rem", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(2rem,4vw,3.5rem)", color: "#F0F2F8", marginBottom: "0.5rem" }}>
        Resume
      </h1>
      <p style={{ color: "#787F96" }}>Coming in Sprint 4.</p>
    </div>
  );
}
