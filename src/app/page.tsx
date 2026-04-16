export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section
        style={{
          minHeight: "100vh",
          paddingTop: 66,
          display: "flex",
          alignItems: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Overlays */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: `
              linear-gradient(to bottom, rgba(8,8,12,0.45) 0%, rgba(8,8,12,0.05) 25%, rgba(8,8,12,0.05) 50%, rgba(8,8,12,0.92) 100%),
              radial-gradient(ellipse 55% 90% at -8% 50%, rgba(255,59,47,0.13) 0%, transparent 65%),
              repeating-linear-gradient(-30deg, transparent 0, transparent 40px, rgba(31,31,46,0.18) 40px, rgba(31,31,46,0.18) 41px),
              repeating-linear-gradient(60deg, transparent 0, transparent 80px, rgba(31,31,46,0.09) 80px, rgba(31,31,46,0.09) 81px)
            `,
            zIndex: 1,
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 2,
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 3rem",
            width: "100%",
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.625rem",
              marginBottom: "1.5rem",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 28,
                height: 2,
                background: "#FF3B2F",
                borderRadius: 1,
              }}
            />
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: 600,
                letterSpacing: "0.15em",
                color: "#7FDBFF",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono-var, 'JetBrains Mono'), monospace",
              }}
            >
              AWS · Cloud Architecture · DevOps
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "var(--font-display-var, 'Syne'), sans-serif",
              marginBottom: "1.5rem",
              lineHeight: 1.05,
            }}
          >
            <span
              style={{
                display: "block",
                fontWeight: 300,
                fontSize: "clamp(2rem, 4.5vw, 4rem)",
                color: "#787F96",
              }}
            >
              The infrastructure
            </span>
            <span
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: "clamp(3.25rem, 7vw, 6.5rem)",
                color: "#F0F2F8",
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
              }}
            >
              Built right.
            </span>
            <span
              style={{
                display: "block",
                fontWeight: 800,
                fontSize: "clamp(3.25rem, 7vw, 6.5rem)",
                color: "#FF3B2F",
                textTransform: "uppercase",
                letterSpacing: "-0.02em",
              }}
            >
              Every time.
            </span>
          </h1>

          <p
            style={{
              fontSize: "clamp(1rem, 1.5vw, 1.25rem)",
              color: "#787F96",
              maxWidth: 520,
              lineHeight: 1.7,
              marginBottom: "2.5rem",
            }}
          >
            DevOps & Systems Engineer specializing in AWS cloud infrastructure,
            platform reliability, and engineering leadership.
          </p>

          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <a
              href="/resume"
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
                transition: "background 0.2s",
              }}
            >
              View Resume
            </a>
            <a
              href="/contact"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.75rem 1.75rem",
                background: "transparent",
                color: "#F0F2F8",
                border: "1px solid #27273A",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                letterSpacing: "0.01em",
                transition: "border-color 0.2s",
              }}
            >
              Get in Touch
            </a>
          </div>
        </div>
      </section>

      {/* About */}
      <section
        style={{
          position: "relative",
          zIndex: 10,
          padding: "6rem 3rem",
          background: "rgba(8,8,12,0.7)",
          backdropFilter: "blur(4px)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4rem",
              alignItems: "center",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  color: "#FF3B2F",
                  textTransform: "uppercase",
                  marginBottom: "1rem",
                  fontFamily: "var(--font-mono-var, 'JetBrains Mono'), monospace",
                }}
              >
                About
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display-var, 'Syne'), sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(2rem, 3.5vw, 3rem)",
                  color: "#F0F2F8",
                  lineHeight: 1.1,
                  marginBottom: "1.5rem",
                }}
              >
                Engineering infrastructure that just works.
              </h2>
              <p style={{ color: "#787F96", lineHeight: 1.8, fontSize: "1rem", marginBottom: "1.25rem" }}>
                With 12+ years in cloud infrastructure and systems engineering, I build
                platforms that engineering teams rely on — resilient, observable, and
                designed to scale from day one.
              </p>
              <p style={{ color: "#787F96", lineHeight: 1.8, fontSize: "1rem" }}>
                Specializing in AWS architecture, CI/CD pipeline design, and the kind
                of DevOps culture change that turns on-call nightmares into boring,
                predictable systems.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              {[
                { value: "12+", label: "Years in Cloud Infrastructure" },
                { value: "6", label: "AWS Certifications" },
                { value: "99.9%", label: "SLA Track Record" },
              ].map(({ value, label }) => (
                <div
                  key={label}
                  style={{
                    padding: "1.5rem",
                    background: "rgba(15,15,21,0.8)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: "1.25rem",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-display-var, 'Syne'), sans-serif",
                      fontWeight: 800,
                      fontSize: "2.25rem",
                      color: "#FF3B2F",
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </span>
                  <span style={{ color: "#787F96", fontSize: "0.9375rem" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
