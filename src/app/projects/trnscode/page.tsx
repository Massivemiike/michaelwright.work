import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cpu, GitBranch, Layers, ShieldCheck, Workflow, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import { personalProjects, trnscodeModules } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "TRNSCODE",
  description:
    "Distributed video transcoding for on-prem hardware — slice, dispatch, encode, stitch. Built as solo technical founder.",
  path: "/projects/trnscode",
});

const project = personalProjects.find((p) => p.id === "trnscode")!;

const ACCENT = "#FF3B2F";
const ACCENT_SOFT_BG = "rgba(255,59,47,0.08)";
const ACCENT_SOFT_BORDER = "rgba(255,59,47,0.2)";

const ARCHITECTURE_STEPS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Chunking",
    icon: <Layers size={16} />,
    body:
      "A 4 GB H.264 movie isn't encoded as one big file across the fleet. TRNSCODE slices it into chunks of ~12 seconds each (tunable per preset — ProRes gets ~30s, AV1 gets ~8s), and chunks always start on a keyframe so each worker can decode its slice independently. For closed-GOP H.264 / HEVC the planner walks the source's keyframe index via ffprobe and picks GOP-aligned boundaries — no source re-encoding. For open-GOP or unknown sources, a fast force_key_frames remux inserts keyframes at the target boundaries first. Scene-aware mode aligns boundaries to actual scene cuts so chunks never cross dissolves.",
  },
  {
    title: "File distribution",
    icon: <Workflow size={16} />,
    body:
      "Workers don't need a shared filesystem. The master serves chunk source bytes over HTTP at GET /chunks/{id}/source and accepts encoded output at PUT /chunks/{id}/output. Every URL carries an HMAC-signed token scoped to a single chunk with a 60-minute TTL. Same-host workers use loopback. Cross-host workers dial the master's mDNS-advertised LAN IP — no static configuration on a typical LAN.",
  },
  {
    title: "Encode + assembly",
    icon: <Cpu size={16} />,
    body:
      "Each worker pulls the chunk, runs ffmpeg with the preset's exact argv, PUTs the encoded chunk back, and reports progress every second over a bidi gRPC stream (frame, fps, bitrate, speed, ETA). When the master sees every chunk arrive, it confirms the codec signature matches across chunks, extracts the source audio once via ffmpeg -c copy, runs ffmpeg -f concat -c copy to glue the encoded video together, and muxes the audio sidecar back in. The assembled output is verified — PTS monotonicity, duration within ±1 frame of the source, audio present if expected.",
  },
  {
    title: "Scheduler",
    icon: <GitBranch size={16} />,
    body:
      "Workers don't all get equal work. The scheduler scores each idle worker against each pending chunk on four signals: runtime estimate (an EMA of historical encode speed per worker × preset class), network penalty (same-host > LAN > WAN), queue delay (idle workers prioritized), and capability penalty (NVENC-needed chunks penalize VAAPI-only workers heavily). Lowest total cost wins. Work-stealing kicks in if a chunk's been queued too long while another worker idles.",
  },
  {
    title: "Failure handling",
    icon: <ShieldCheck size={16} />,
    body:
      "Failures are classified before retry, not after. Transient failures (network blip, signaled mid-encode, OOM with fallback) retry up to 3 times — OOM falls back to a smaller-chunk flag. Permanent failures (decode error, malformed source, codec rejection) never retry; the chunk and job both mark failed. Pause-the-job conditions (disk full on the master) pause the queue until you free space, then resume from the failed chunk forward.",
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

export default function TrnscodeProjectPage() {
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
            Personal · Distributed Systems
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
            TRNSCODE
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            Encode every frame. One brain, every machine working — distributed video transcoding for your own hardware.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="https://trnscode.com"
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
              Visit trnscode.com <ArrowUpRight size={14} />
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
              In Progress · Solo Founder
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "4rem" }}>
        {/* The pitch */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Zap size={13} />} label="What it is" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.25rem" }}>
              Distributed transcoding for the hardware you already own.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: 0 }}>
              Drop a video into TRNSCODE and it gets sliced, sent to every encoder on your LAN, encoded in parallel, then stitched back together — automatically. One machine becomes the conductor; every other machine becomes a worker that picks up chunks and returns finished video. Built for on-prem first: your own GPU rigs, your own quiet office Macs, your own laptop in the corner. Bursting to cloud is optional, never required.
            </p>
          </section>
        </SectionReveal>

        {/* Modules / components grid */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 components · 1 fleet" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What ships in the box
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))", gap: "1rem" }}>
              {trnscodeModules.map((mod) => (
                <div
                  key={mod.name}
                  style={{
                    padding: "1.25rem 1.375rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.12em", color: ACCENT, textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "0.3rem" }}>
                    {mod.label}
                  </div>
                  <div style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.0625rem", color: "#F0F2F8", marginBottom: "0.5rem" }}>
                    {mod.name}
                  </div>
                  <p style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.65, margin: 0 }}>
                    {mod.detail}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </SectionReveal>

        {/* How it works */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Workflow size={13} />} label="How it works" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              The pipeline, end to end
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {ARCHITECTURE_STEPS.map((step, idx) => (
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
            <Link href="/projects/graffiti" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              Graffiti →
            </Link>
            <Link href="/projects/floaudio" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              FloAud.io →
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
