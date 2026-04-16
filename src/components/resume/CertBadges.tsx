import SectionReveal from "@/components/sections/SectionReveal";
import type { Certification } from "@/data/resume.data";

export default function CertBadges({ certs }: { certs: Certification[] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      {certs.map((cert, i) => (
        <SectionReveal key={cert.name} delay={i * 0.06}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.875rem",
              padding: "0.875rem 1rem",
              background: "rgba(15,15,21,0.9)",
              border: "1px solid #1F1F2E",
              borderRadius: 8,
              transition: "border-color 0.2s",
            }}
          >
            {/* Badge */}
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 6,
                background: "rgba(255,59,47,0.08)",
                border: "1px solid rgba(255,59,47,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                fontWeight: 700,
                fontSize: "0.625rem",
                color: "#FF3B2F",
                letterSpacing: "0.05em",
                flexShrink: 0,
              }}
            >
              {cert.badge}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: "0.8125rem",
                  color: "#F0F2F8",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  marginBottom: "0.2rem",
                }}
              >
                {cert.name}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#3C3F52" }}>
                {cert.issuer} · {cert.year}
              </div>
            </div>
          </div>
        </SectionReveal>
      ))}
    </div>
  );
}
