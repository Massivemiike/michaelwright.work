import Link from "next/link";
import { ArrowLeft, Camera, Cpu, GitBranch, Image as ImageIcon, Layers, Shield, Tag, Workflow, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import { personalProjects, graffitiModules } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Graffiti",
  description:
    "Local-first AI image tagging and Lightroom-style editing for photographers, agencies, and stock teams. Built as solo technical founder.",
  path: "/projects/graffiti",
});

const project = personalProjects.find((p) => p.id === "graffiti")!;

const ACCENT = "#7FDBFF";
const ACCENT_SOFT_BG = "rgba(127,219,255,0.08)";
const ACCENT_SOFT_BORDER = "rgba(127,219,255,0.2)";

const ARCHITECTURE: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Native, not Electron",
    icon: <Cpu size={16} />,
    body:
      "PySide6 (Qt 6) + QML / QtQuick — the same toolkit Krita, FreeCAD, and OBS use. GPU-accelerated rendering, ~60 fps grid even with 100k assets. The main thread runs Qt + QML and never blocks. qasync bridges asyncio onto Qt's event loop for HTTP and LLM I/O. CPU-bound work — thumbnails, hashing, metadata writes, face inference, image rendering — runs on QThreadPool or anyio.to_thread.run_sync.",
  },
  {
    title: "Local-first AI",
    icon: <ImageIcon size={16} />,
    body:
      "Ollama and LM Studio are first-class. The bundled installer ships the Ollama CLI. The in-app Model Hub fetches, benchmarks, and gates Qwen 2.5-VL, Llama 3.2 Vision, Gemma 3, MiniCPM-V, LLaVA, Moondream, and Pixtral — the hub knows which models fit your VRAM and which require explicit license acceptance. No client photos ever leave the machine unless the user opts into a cloud provider on Pro.",
  },
  {
    title: "Metadata that round-trips",
    icon: <Tag size={16} />,
    body:
      "Captions write to dc:description. Keywords write to dc:subject (one per tag) and the IPTC-IIM legacy mirror. Face tags write to Iptc4xmpExt:PersonInImage. Every develop adjustment writes to Adobe Camera Raw's crs:* XMP namespace — exposure, tone curve, split toning, vignette, grain. Adobe Bridge sees it. Lightroom Classic sees it. NeoFinder sees it. exiftool is the primary writer (subprocess), pyexiv2 the fast path.",
  },
  {
    title: "Industrial-strength queue",
    icon: <Workflow size={16} />,
    body:
      "5 priority lanes (URGENT / HIGH / NORMAL / LOW / BACKGROUND), RAM- and VRAM-aware backpressure that pauses at 90% memory and resumes at 75%, persistent across crashes via SQLite WAL, cooperative cancellation so you can drop a batch mid-flight without losing the rest, sanity validator that auto-retries with a configured fallback model when the primary returns garbage, watch folders that wait for files to settle before triggering, scheduled batches with cron-style triggers.",
  },
  {
    title: "License gate that respects the user",
    icon: <Shield size={16} />,
    body:
      "Every model download routes through an explicit per-model license-acceptance dialog. The SHA-256 hash of the license text is persisted per (model_id, license_string), so the dialog only re-fires when the upstream license actually changes. Graffiti does not redistribute model weights — downloads route directly from Ollama / HuggingFace / GitHub Releases to the user's disk. Graffiti is a fetcher, not a mirror.",
  },
];

const TIERS = [
  {
    name: "Trial",
    price: "Free",
    sub: "30 days · no credit card",
    detail: "Hardware-bound; full feature set on for the trial window.",
  },
  {
    name: "Standard",
    price: "$79",
    sub: "Perpetual · 1 yr updates",
    detail: "Local providers (Ollama / LM Studio / LocalAI / OpenAI-compat), full edit module, 2 machines.",
  },
  {
    name: "Pro",
    price: "$129",
    sub: "Perpetual · $39/yr optional",
    detail: "Adds cloud providers (OpenAI / Anthropic / Gemini), watch folders, batch presets, reviewer sign-off, 3 machines.",
  },
  {
    name: "Studio",
    price: "$299",
    sub: "Per seat · per year",
    detail: "Floating licenses, audit log, shared prompt library, encrypted .gvdb export, priority support.",
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

export default function GraffitiProjectPage() {
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Page header */}
      <div
        style={{
          background: "rgba(8,8,12,0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1F1F2E",
          padding: "3rem clamp(1.25rem, 5vw, 4rem)",
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
            Personal · Local-First AI Desktop
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
            Graffiti
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            Tag thousands of photos with a vision model running on your own machine. Develop them in a Lightroom-style editor. No cloud uploads. No model lock-in.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
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
              In Progress · Beta soon
            </span>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.55rem 0.9rem",
                background: "rgba(31,31,46,0.6)",
                border: "1px solid #27273A",
                color: "#787F96",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.75rem",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
              }}
            >
              1100+ Tests · 135 Sprints
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 4rem)" }}>
        {/* What it is */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Zap size={13} />} label="What it is" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.25rem" }}>
              5,000 photos in. A catalogued archive out.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: 0 }}>
              You have a folder of photos with no descriptions, no keywords, and no plan. Send them to a cloud service — pay per image, hand your client's photos to a third party, hope the tags are usable. Tag them by hand — burn a week on something a computer should do in an afternoon. Use an existing tool — most are thin wrappers over OpenAI or workflow-heavy Lightroom plugins that don't understand the image. Graffiti runs entirely on the user's computer. Point it at a folder, pick a vision model, walk away. Every JPEG, PNG, TIFF, HEIC, WebP, and 24 RAW formats come back tagged with a description and 12–20 keywords burned into standard XMP / IPTC metadata. Bridge sees it. Lightroom sees it. NeoFinder sees it. The client sees a properly catalogued archive.
            </p>
          </section>
        </SectionReveal>

        {/* Modules */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 modules · 1 desktop app" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              The app, by module
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(290px, 100%), 1fr))", gap: "1rem" }}>
              {graffitiModules.map((mod) => (
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
            <SectionLabel icon={<Camera size={13} />} label="Solo build" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What I built
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", gap: "0.75rem 2rem" }}>
              {project.highlights.map((h, idx) => (
                <li key={idx} style={{ fontSize: "0.9375rem", color: "#787F96", lineHeight: 1.7 }}>
                  {h}
                </li>
              ))}
            </ul>
          </section>
        </SectionReveal>

        {/* Pricing tiers */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Tag size={13} />} label="Tiers" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              Pricing
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(240px, 100%), 1fr))", gap: "1rem" }}>
              {TIERS.map((tier) => (
                <div
                  key={tier.name}
                  style={{
                    padding: "1.25rem 1.375rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "0.4rem" }}>
                    <span style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.0625rem", color: "#F0F2F8" }}>{tier.name}</span>
                    <span style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "1.125rem", color: ACCENT }}>{tier.price}</span>
                  </div>
                  <div style={{ fontSize: "0.6875rem", color: "#3C3F52", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: "0.75rem" }}>
                    {tier.sub}
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.65, margin: 0 }}>
                    {tier.detail}
                  </p>
                </div>
              ))}
            </div>
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
