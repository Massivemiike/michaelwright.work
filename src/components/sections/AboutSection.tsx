import SectionReveal from "./SectionReveal";

const STATS = [
  { value: "20", label: "Years in Live TV & Post Production" },
  { value: "12+", label: "Years in Media Engineering" },
  { value: "30+", label: "Years Skateboarding — still" },
  { value: "5,000+", label: "Volunteer Hours · CoC Cable TV" },
];

const AUDIO_SPECIALTIES = [
  "Sound Engineer",
  "Mastering Engineer",
  "Recording / Tracking Engineer",
  "Live Broadcast Production",
  "Film / TV Editor",
  "Trailer Cutting & QC",
  "Post-Production Pipeline",
  "Professional Audio Software",
  "Plugin Development (JUCE / VST3)",
  "Custom Vocal Chain Development",
  "AI Audio & Neural DSP",
];

const CLOUD_SPECIALTIES = [
  "AWS Deadline Cloud",
  "VPC / Transit Gateway / VPC Lattice",
  "EC2 · Auto Scaling · SMF",
  "IAM · Security · Compliance",
  "CloudFormation / IaC",
  "Cross-Account Architecture",
  "Multi-Region Network Design",
  "Production Incident Response",
];

const CREDENTIALS = [
  { school: "The Los Angeles Recording School", detail: "A.S. Recording Arts Technology · GPA 3.92" },
  { school: "Western Governors University", detail: "B.S. Network Engineering & Security" },
  { school: "AWS", detail: "Cloud Practitioner · GenAI Technical · Technical Accredited" },
];

export default function AboutSection() {
  return (
    <section
      id="about"
      style={{
        position: "relative",
        zIndex: 10,
        padding: "7rem 4rem",
        background: "rgba(8,8,12,0.78)",
        backdropFilter: "blur(4px)",
        borderTop: "1px solid #1F1F2E",
        scrollMarginTop: 66,
      }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>

        {/* Header */}
        <SectionReveal>
          <div style={{ marginBottom: "4rem", maxWidth: 820 }}>
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
                marginBottom: "1.25rem",
              }}
            >
              Three decades behind the cameras, consoles, and cloud.
            </h2>
            <p
              style={{
                color: "#7FDBFF",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                fontSize: "0.875rem",
                letterSpacing: "0.04em",
                lineHeight: 1.6,
                margin: 0,
              }}
            >
              12+ years in Media Engineering · 20 years in Live Television &amp; Post Production
            </p>
          </div>
        </SectionReveal>

        {/* Origin story */}
        <SectionReveal delay={0.1}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "2.5rem", marginBottom: "4.5rem" }}>
            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  color: "#3C3F52",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  marginBottom: "0.875rem",
                }}
              >
                How it started
              </div>
              <p style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1rem", margin: 0 }}>
                Skateboarding pulled me into production by accident. Growing up filming and editing skate tapes
                in the mid-90s — VX1000s, late-night tape-to-tape sessions, color correction on whatever
                hardware I could get my hands on — taught me the discipline of real-time craft long before
                it was a career. By 1999 I was volunteering at the City of Commerce Cable Television station,
                running live broadcast cameras, studio robotics, and lighting. Over nine years I logged 5,000+
                hours there, eventually running the city&apos;s annual beauty pageant as Production Manager,
                Assistant Director, and Head of Production.
              </p>
              <p style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1rem", margin: "1rem 0 0" }}>
                At 16, I saved up and went to NAB in Vegas by myself — hitchhiked from the bus terminal to
                my hotel, sat in on world-class broadcast training all week, bought my first fisheye lens on
                the show floor, and scraped together just enough to fly home. That trip set the tone for
                everything after it: go where the work is, learn from people who actually do it, and figure
                out the logistics on the way.
              </p>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  color: "#3C3F52",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  marginBottom: "0.875rem",
                }}
              >
                Editing &amp; Post-Production
              </div>
              <p style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1rem", margin: 0 }}>
                The cable station years rolled straight into professional editing. My credits run from
                additional editor on <em>Occupation: Hollywood</em> and assistant editor on <em>A Royal
                Christmas</em> to visual effects on <em>One Direction: Going Our Way</em> — plus work on{" "}
                <em>Kim Kardashian: The Fabulous Life</em>, <em>America&apos;s Sweethearts: Queens of
                Nashville</em>, and <em>Music Revolution</em>. My most recent credit is{" "}
                <em>Taylor Swift: Melodies and Hearts</em> (2025, 50m), where I covered the full
                pipeline end-to-end: production, trailer cut, all of post-production, QC, and final
                delivery.{" "}
                <a
                  href="https://www.imdb.com/name/nm1948208/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#7FDBFF", textDecoration: "none", borderBottom: "1px solid rgba(127,219,255,0.3)" }}
                >
                  IMDb ↗
                </a>
              </p>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  color: "#3C3F52",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  marginBottom: "0.875rem",
                }}
              >
                The audio years
              </div>
              <p style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1rem", margin: 0 }}>
                Production work led naturally into audio. I graduated from The Los Angeles Recording School
                with a 3.92 GPA in Recording Arts Technology and worked across tracking, mixing, and
                mastering sessions — studio and live. That&apos;s the foundation FloAud.io is built on today:
                six production tools (AudioFlo, StemFlo, MasterFlo, MidiFlo, Audio Cleanup) plus TeachMe, a
                21-module audio engineering curriculum. Plugin development, custom vocal chain design, and
                neural audio DSP are where the recording engineer and the software engineer meet.
              </p>
            </div>

            <div>
              <div
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  letterSpacing: "0.15em",
                  color: "#3C3F52",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  marginBottom: "0.875rem",
                }}
              >
                Into the cloud
              </div>
              <p style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1rem", margin: 0 }}>
                Over the last 12+ years, the media background fused with cloud engineering. At GPL
                Technologies I architect AWS Deadline Cloud render farms, cross-account licensing networks,
                and production pipelines for VFX studios — Cantina Creative, Frame48, Chicken Bone FX,
                Transit, Alliance VFX, and more. The instincts carry over cleanly from the live control
                room: real-time problem solving, deep system knowledge, and the discipline to make complex
                technical machinery feel invisible to the people using it.
              </p>
            </div>
          </div>
        </SectionReveal>

        {/* Stats row */}
        <SectionReveal delay={0.15}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginBottom: "4.5rem",
            }}
          >
            {STATS.map(({ value, label }) => (
              <div
                key={label}
                style={{
                  padding: "1.5rem 1.5rem",
                  background: "rgba(15,15,21,0.9)",
                  border: "1px solid #1F1F2E",
                  borderTop: "1px solid rgba(255,59,47,0.25)",
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                    fontWeight: 800,
                    fontSize: "2.25rem",
                    color: "#FF3B2F",
                    lineHeight: 1,
                    marginBottom: "0.5rem",
                  }}
                >
                  {value}
                </div>
                <div style={{ color: "#787F96", fontSize: "0.8125rem", lineHeight: 1.4 }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </SectionReveal>

        {/* Specialty cards — two columns */}
        <SectionReveal delay={0.2}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "1.25rem",
              marginBottom: "4rem",
            }}
          >
            {/* Audio / Media — teal */}
            <div
              style={{
                padding: "2rem",
                background: "rgba(15,15,21,0.9)",
                border: "1px solid #27273A",
                borderTop: "1px solid rgba(127,219,255,0.25)",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#7FDBFF", boxShadow: "0 0 8px rgba(127,219,255,0.6)" }} />
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
                  Media, Post &amp; Audio Engineering
                </span>
              </div>
              <p style={{ color: "#787F96", fontSize: "0.875rem", lineHeight: 1.6, marginTop: 0, marginBottom: "1.25rem" }}>
                Professional recording, mixing, and mastering grounded by a Sound Engineering degree — paired with a film / TV editor filmography on IMDb and now extended into plugin development and neural audio software.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {AUDIO_SPECIALTIES.map((s) => (
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
            </div>

            {/* Cloud — red */}
            <div
              style={{
                padding: "2rem",
                background: "rgba(15,15,21,0.9)",
                border: "1px solid #27273A",
                borderTop: "1px solid rgba(255,59,47,0.25)",
                borderRadius: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF3B2F", boxShadow: "0 0 8px rgba(255,59,47,0.6)" }} />
                <span
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: "0.15em",
                    color: "#FF3B2F",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  }}
                >
                  Cloud &amp; Infrastructure
                </span>
              </div>
              <p style={{ color: "#787F96", fontSize: "0.875rem", lineHeight: 1.6, marginTop: 0, marginBottom: "1.25rem" }}>
                AWS cloud architecture for VFX and media workloads — Deadline Cloud render farms, cross-account licensing, and the networking that holds it all together.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                {CLOUD_SPECIALTIES.map((s) => (
                  <span
                    key={s}
                    style={{
                      padding: "0.35rem 0.75rem",
                      background: "rgba(255,59,47,0.06)",
                      border: "1px solid rgba(255,59,47,0.18)",
                      borderRadius: 4,
                      fontSize: "0.75rem",
                      color: "#FF3B2F",
                      fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </SectionReveal>

        {/* Credentials strip */}
        <SectionReveal delay={0.25}>
          <div
            style={{
              padding: "1.75rem 2rem",
              background: "rgba(15,15,21,0.9)",
              border: "1px solid #1F1F2E",
              borderRadius: 10,
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              gap: "1.5rem",
            }}
          >
            {CREDENTIALS.map(({ school, detail }) => (
              <div key={school}>
                <div
                  style={{
                    fontSize: "0.6875rem",
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    color: "#3C3F52",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                    marginBottom: "0.35rem",
                  }}
                >
                  {school}
                </div>
                <div style={{ fontSize: "0.875rem", color: "#F0F2F8" }}>{detail}</div>
              </div>
            ))}
          </div>
        </SectionReveal>

      </div>
    </section>
  );
}
