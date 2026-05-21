import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cpu, GitBranch, Headphones, Layers, Music, Workflow, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import { personalProjects, floaudTools } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "FloAud.io",
  description:
    "Browser-based professional audio platform — six studio-grade tools and a full audio engineering education system. Built as solo technical founder.",
  path: "/projects/floaudio",
});

const project = personalProjects.find((p) => p.id === "floaudio")!;

const ACCENT = "#FF3B2F";
const ACCENT_SOFT_BG = "rgba(255,59,47,0.08)";
const ACCENT_SOFT_BORDER = "rgba(255,59,47,0.2)";

const ARCHITECTURE: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Multi-tenant SaaS on AWS",
    icon: <Cpu size={16} />,
    body:
      "Architected and deployed the full platform on AWS — audio processing pipelines, credit billing system, and user authentication. Designed so each user's audio jobs are isolated, billed against their credit balance, and processed asynchronously without blocking the front end.",
  },
  {
    title: "Node-based real-time audio",
    icon: <Workflow size={16} />,
    body:
      "AudioFlo is the visual editor — a drag-and-drop signal chain builder. Users connect compressors, limiters, noise gates, parametric EQ, filters, distortion, modulation, spatial effects, pitch/time tools, and mastering processors. Built on React Flow with a real-time audio engine so changes audition in the browser.",
  },
  {
    title: "Neural inference, served at request time",
    icon: <Headphones size={16} />,
    body:
      "Integrated state-of-the-art neural models for stem separation (vocals / drums / bass / instruments, 4-stem and 6-stem variants), pitch detection for audio-to-MIDI, and AI-driven mastering that matches a track to a genre preset or user-uploaded reference. Engineered the pipeline to handle MP3, WAV, FLAC, AAC, OGG, and Opus up to 100MB.",
  },
  {
    title: "Credit billing that respects free users",
    icon: <Layers size={16} />,
    body:
      "Implemented credit-based billing — free tier gives 3 previews, one-time credit packs for occasional users, and monthly subscription plans for studios and content creators. No credit card required to try anything. The billing system is the load-bearing piece behind every feature ship.",
  },
  {
    title: "TeachMe — the curriculum, not a course catalog",
    icon: <Music size={16} />,
    body:
      "Designed and shipped a structured audio engineering education system: 21 modules, 263+ lessons, 205+ hours of content. 13 core modules cover sound physics through advanced DSP. 8 genre specializations cover Rock, Hip-Hop, Metal, Country, R&B, Post-Production, Jazz, and Podcast production. 600+ quiz questions, XP progression, ear training drills, mix challenges, and 21 certificates. First lesson of every module is free.",
  },
];

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.6875rem",
        fontWeight: 600,
        letterSpacing: "0.18em",
        color: ACCENT,
        textTransform: "uppercase",
        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
        marginBottom: "0.75rem",
      }}
    >
      {icon}
      {label}
    </div>
  );
}

export default function FloaudioProjectPage() {
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Page header */}
      <div
        style={{
          background: "rgba(8,8,12,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1F1F2E",
          padding: "3rem 4rem",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <Link
            href="/projects"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "0.75rem",
              color: "#787F96",
              textDecoration: "none",
              marginBottom: "1.5rem",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              letterSpacing: "0.08em",
            }}
          >
            <ArrowLeft size={13} /> All projects
          </Link>

          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: ACCENT,
              textTransform: "uppercase",
              marginBottom: "0.75rem",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            }}
          >
            Personal · Audio SaaS · Education
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 800,
              fontSize: "clamp(2.25rem,4.5vw,3.5rem)",
              color: "#F0F2F8",
              margin: "0 0 0.75rem",
              letterSpacing: "-0.01em",
            }}
          >
            FloAud.io
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            Six studio-grade audio tools and a full audio engineering education system — in the browser, with no plugin install.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="https://floaud.io"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.6rem 1.4rem",
                background: ACCENT,
                color: "#F0F2F8",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
              }}
            >
              Visit FloAud.io <ArrowUpRight size={14} />
            </a>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 0.9rem",
                background: ACCENT_SOFT_BG,
                border: `1px solid ${ACCENT_SOFT_BORDER}`,
                color: ACCENT,
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.75rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 6px ${ACCENT}` }} />
              Live · Solo Founder
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem" }}>
        {/* What it is */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Zap size={13} />} label="What it is" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.25rem" }}>
              The mixing room, in a browser tab.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: 0 }}>
              FloAud.io is a browser-based professional audio platform for musicians, podcasters, content creators, and students. Six tools cover the entire production lifecycle — visual signal-chain processing, neural stem separation, AI mastering, audio-to-MIDI conversion, noise removal — alongside a structured education system that teaches the craft from sound physics through genre-specific production. Free to try with no credit card required. Architected and shipped end-to-end as solo technical founder.
            </p>
          </section>
        </SectionReveal>

        {/* The six tools */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 tools · 1 platform" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              The toolkit
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "1rem" }}>
              {floaudTools.map((tool) => (
                <a
                  key={tool.name}
                  href={tool.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: "none" }}
                >
                  <div
                    style={{
                      padding: "1.25rem 1.375rem",
                      background: "rgba(15,15,21,0.9)",
                      border: "1px solid #1F1F2E",
                      borderRadius: 10,
                      height: "100%",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.5rem", gap: "0.5rem" }}>
                      <div>
                        <div style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.12em", color: ACCENT, textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "0.3rem" }}>
                          {tool.label}
                        </div>
                        <div style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.0625rem", color: "#F0F2F8" }}>
                          {tool.name}
                        </div>
                      </div>
                      <ArrowUpRight size={14} style={{ color: "#3C3F52", flexShrink: 0, marginTop: 4 }} />
                    </div>
                    <p style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.65, margin: 0 }}>
                      {tool.detail}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </SectionReveal>

        {/* How it works */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Workflow size={13} />} label="How it works" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              Architecture decisions
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {ARCHITECTURE.map((step, idx) => (
                <div
                  key={step.title}
                  style={{
                    padding: "1.75rem 2rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 10,
                    display: "grid",
                    gridTemplateColumns: "auto 1fr",
                    gap: "1.5rem",
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 8,
                      background: ACCENT_SOFT_BG,
                      border: `1px solid ${ACCENT_SOFT_BORDER}`,
                      color: ACCENT,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {step.icon}
                  </div>
                  <div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.5rem" }}>
                      <span style={{ fontSize: "0.6875rem", color: "#3C3F52", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", letterSpacing: "0.1em" }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <h3 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.125rem", color: "#F0F2F8", margin: 0 }}>
                        {step.title}
                      </h3>
                    </div>
                    <p style={{ color: "#787F96", fontSize: "0.9375rem", lineHeight: 1.75, margin: 0 }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </SectionReveal>

        {/* What I built */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Cpu size={13} />} label="Solo build" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What I built
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: "0.75rem 2rem" }}>
              {project.highlights.map((h, idx) => (
                <li key={idx} style={{ fontSize: "0.9375rem", color: "#787F96", lineHeight: 1.7 }}>
                  {h}
                </li>
              ))}
            </ul>
          </section>
        </SectionReveal>

        {/* Tech stack */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<GitBranch size={13} />} label="Stack" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.5rem" }}>
              Tech
            </h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
              {project.tags.map((tag) => (
                <span
                  key={tag}
                  style={{
                    padding: "0.45rem 0.875rem",
                    background: "rgba(31,31,46,0.8)",
                    border: "1px solid #27273A",
                    borderRadius: 5,
                    fontSize: "0.75rem",
                    color: "#787F96",
                    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </section>
        </SectionReveal>

        {/* Cross-links */}
        <div
          style={{
            paddingTop: "2.5rem",
            borderTop: "1px solid #1F1F2E",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <Link
            href="/projects"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.375rem",
              fontSize: "0.875rem",
              color: "#787F96",
              textDecoration: "none",
              fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
            }}
          >
            <ArrowLeft size={14} /> All projects
          </Link>
          <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
            <Link href="/projects/trnscode" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              TRNSCODE →
            </Link>
            <Link href="/projects/graffiti" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              Graffiti →
            </Link>
            <Link href="/projects/rndrwork" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              rndr.work →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
