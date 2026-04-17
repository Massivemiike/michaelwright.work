import { Download, Mail, MapPin, Link2 } from "lucide-react";
import ResumeTimeline from "@/components/resume/ResumeTimeline";
import SkillsMatrix from "@/components/resume/SkillsMatrix";
import CertBadges from "@/components/resume/CertBadges";
import { timeline, skills, certifications, education, volunteer } from "@/data/resume.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Resume",
  description: "Michael Wright — Cloud Infrastructure Architect & DevOps Engineer. 12+ years building resilient AWS infrastructure.",
  path: "/resume",
});

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: "Michael Wright",
  jobTitle: "Cloud Infrastructure Architect & DevOps Engineer",
  url: "https://michaelwright.work",
  email: "m.wright2@lafilm.edu",
  sameAs: [
    "https://www.linkedin.com/in/macgyver2026",
  ],
  knowsAbout: ["AWS", "DevOps", "Kubernetes", "Cloud Infrastructure", "Platform Engineering"],
};

export default function ResumePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
    <div
      style={{
        minHeight: "100vh",
        paddingTop: 66,
        position: "relative",
        zIndex: 10,
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "rgba(8,8,12,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1F1F2E",
          padding: "3rem 4rem",
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "2rem",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: "#FF3B2F",
                textTransform: "uppercase",
                marginBottom: "0.75rem",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              }}
            >
              Resume
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                fontWeight: 800,
                fontSize: "clamp(2.25rem,4vw,3.5rem)",
                color: "#F0F2F8",
                lineHeight: 1.05,
                marginBottom: "0.75rem",
              }}
            >
              Michael Wright
            </h1>
            <p
              style={{
                fontSize: "1.0625rem",
                color: "#787F96",
                marginBottom: "1.25rem",
              }}
            >
              Solutions Architect · Systems Engineer · Bridging Technology & Media Production
            </p>

            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
              {[
                { icon: <Mail size={13} />, label: "m.wright2@lafilm.edu", href: "mailto:m.wright2@lafilm.edu" },
                { icon: <Mail size={13} />, label: "michael.wright@gpltech.com", href: "mailto:michael.wright@gpltech.com" },
                { icon: <MapPin size={13} />, label: "Remote", href: null },
                { icon: <Link2 size={13} />, label: "linkedin.com/in/macgyver2026", href: "https://www.linkedin.com/in/macgyver2026" },
              ].map(({ icon, label, href }) =>
                href ? (
                  <a
                    key={label}
                    href={href}
                    target={href.startsWith("http") ? "_blank" : undefined}
                    rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      fontSize: "0.8125rem",
                      color: "#787F96",
                      textDecoration: "none",
                    }}
                  >
                    {icon} {label}
                  </a>
                ) : (
                  <span
                    key={label}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.375rem",
                      fontSize: "0.8125rem",
                      color: "#787F96",
                    }}
                  >
                    {icon} {label}
                  </span>
                )
              )}
            </div>
          </div>

          {/* Download button */}
          <a
            href="/resume/michael-wright-resume.pdf"
            download
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.75rem 1.5rem",
              background: "rgba(255,59,47,0.08)",
              border: "1px solid rgba(255,59,47,0.3)",
              borderRadius: 8,
              color: "#FF3B2F",
              fontSize: "0.875rem",
              fontWeight: 600,
              textDecoration: "none",
              flexShrink: 0,
              alignSelf: "flex-start",
            }}
          >
            <Download size={16} />
            Download PDF
          </a>
        </div>
      </div>

      {/* Body — 65/35 split */}
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "4rem",
          display: "grid",
          gridTemplateColumns: "1fr 380px",
          gap: "4rem",
          alignItems: "start",
        }}
      >
        {/* Left — Timeline */}
        <div>
          <SectionLabel>Experience</SectionLabel>
          <ResumeTimeline entries={timeline} />
        </div>

        {/* Right — Skills + Certs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "3rem" }}>
          <div>
            <SectionLabel>Skills</SectionLabel>
            <SkillsMatrix skills={skills} />
          </div>

          <div>
            <SectionLabel>Certifications</SectionLabel>
            <CertBadges certs={certifications} />
          </div>

          <div>
            <SectionLabel>Education</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {education.map((edu) => (
                <div
                  key={edu.school}
                  style={{
                    padding: "1rem 1.25rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: "0.875rem", color: "#F0F2F8", fontWeight: 500, marginBottom: "0.25rem" }}>
                    {edu.school}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#787F96", marginBottom: "0.25rem" }}>
                    {edu.degree}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#3C3F52", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
                    {edu.period}{"note" in edu ? ` · ${edu.note}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel>Volunteer</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {volunteer.map((v) => (
                <div
                  key={v.organization}
                  style={{
                    padding: "1.25rem 1.25rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderTop: "1px solid rgba(127,219,255,0.2)",
                    borderRadius: 8,
                  }}
                >
                  <div style={{ fontSize: "0.875rem", color: "#F0F2F8", fontWeight: 500, marginBottom: "0.25rem" }}>
                    {v.organization}
                  </div>
                  <div style={{ fontSize: "0.8125rem", color: "#787F96", marginBottom: "0.25rem" }}>
                    {v.role}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#3C3F52", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "0.75rem" }}>
                    {v.period} · <span style={{ color: "#7FDBFF" }}>{v.hours}</span>
                  </div>
                  <ul style={{ margin: 0, paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                    {v.bullets.map((b, bi) => (
                      <li key={bi} style={{ fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.65 }}>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.18em",
        color: "#FF3B2F",
        textTransform: "uppercase",
        marginBottom: "1.5rem",
        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
        paddingBottom: "0.75rem",
        borderBottom: "1px solid #1F1F2E",
      }}
    >
      {children}
    </div>
  );
}
