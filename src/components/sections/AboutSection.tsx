import SectionReveal from "./SectionReveal";

const STATS = [
  { value: "12+", label: "Years in Cloud Infrastructure" },
  { value: "3",   label: "AWS Certifications" },
  { value: "99.9%", label: "SLA Track Record" },
];

const AWS_SPECIALTIES = [
  "EC2 & Auto Scaling", "EKS / ECS", "RDS & Aurora",
  "Lambda & Serverless", "CloudFormation / CDK", "VPC & Networking",
  "IAM & Security", "CloudWatch & Observability",
];

export default function AboutSection() {
  return (
    <section
      id="about"
      style={{
        position: "relative",
        zIndex: 10,
        padding: "7rem 4rem",
        background: "rgba(8,8,12,0.75)",
        backdropFilter: "blur(4px)",
        borderTop: "1px solid #1F1F2E",
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <SectionReveal>
          <div style={{ marginBottom: "4rem" }}>
            <div
              style={{
                fontSize: "0.6875rem",
                fontWeight: 600,
                letterSpacing: "0.18em",
                color: "#FF3B2F",
                textTransform: "uppercase",
                marginBottom: "1rem",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              }}
            >
              About
            </div>
            <h2
              style={{
                fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                fontWeight: 800,
                fontSize: "clamp(2rem,3.5vw,3.25rem)",
                color: "#F0F2F8",
                lineHeight: 1.1,
                maxWidth: 600,
              }}
            >
              Engineering infrastructure that just works.
            </h2>
          </div>
        </SectionReveal>

        {/* Two-column grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "4rem",
            alignItems: "start",
          }}
        >
          {/* Left — copy */}
          <SectionReveal delay={0.1}>
            <p
              style={{
                color: "#787F96",
                lineHeight: 1.85,
                fontSize: "1.0625rem",
                marginBottom: "1.5rem",
              }}
            >
              With 12+ years in cloud infrastructure and systems engineering, I
              build platforms that engineering teams rely on — resilient,
              observable, and designed to scale from day one.
            </p>
            <p
              style={{
                color: "#787F96",
                lineHeight: 1.85,
                fontSize: "1.0625rem",
                marginBottom: "2.5rem",
              }}
            >
              Specializing in AWS architecture, CI/CD pipeline design, and the
              kind of DevOps culture change that turns on-call nightmares into
              boring, predictable systems.
            </p>

            {/* Stats */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {STATS.map(({ value, label }) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "1.25rem",
                    padding: "1.25rem 1.5rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 8,
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                      fontWeight: 800,
                      fontSize: "2rem",
                      color: "#FF3B2F",
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    {value}
                  </span>
                  <span style={{ color: "#787F96", fontSize: "0.9375rem" }}>
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </SectionReveal>

          {/* Right — AWS specialty card */}
          <SectionReveal delay={0.2}>
            <div
              style={{
                padding: "2rem",
                background: "rgba(15,15,21,0.9)",
                border: "1px solid #27273A",
                borderTop: "1px solid rgba(127,219,255,0.25)",
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "1.5rem",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#7FDBFF",
                    boxShadow: "0 0 8px rgba(127,219,255,0.6)",
                  }}
                />
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: "0.15em",
                    color: "#7FDBFF",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  }}
                >
                  AWS Specialties
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginBottom: "2rem",
                }}
              >
                {AWS_SPECIALTIES.map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: "0.35rem 0.75rem",
                      background: "rgba(127,219,255,0.06)",
                      border: "1px solid rgba(127,219,255,0.15)",
                      borderRadius: 4,
                      fontSize: "0.75rem",
                      color: "#7FDBFF",
                      fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>

              <div
                style={{
                  paddingTop: "1.5rem",
                  borderTop: "1px solid #1F1F2E",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {[
                  { cert: "AWS Certified Cloud Practitioner", year: "Exp. Mar 2029" },
                  { cert: "AWS Partner: Generative AI Technical", year: "Mar 2026" },
                  { cert: "AWS Partner: Technical Accredited", year: "Mar 2026" },
                ].map(({ cert, year }) => (
                  <div
                    key={cert}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span style={{ fontSize: "0.8125rem", color: "#787F96" }}>
                      {cert}
                    </span>
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        color: "#3C3F52",
                        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                        flexShrink: 0,
                        marginLeft: "0.75rem",
                      }}
                    >
                      {year}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </SectionReveal>
        </div>
      </div>
    </section>
  );
}
