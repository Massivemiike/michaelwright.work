import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cpu, Download, GitBranch, Layers, MonitorPlay, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import Screenshot from "@/components/media/Screenshot";
import { personalProjects, sieveWindowsModules } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Sieve for Windows",
  description:
    "Free desktop downloader and transcoder for Windows — 8 download presets over 1,800+ sites, a 52-preset transcode suite with NVENC hardware encoding, batch and watch-folder modes, VMAF quality scoring, and channel subscriptions.",
  path: "/projects/sieve-windows",
});

const project = personalProjects.find((p) => p.id === "sieve-windows")!;

const ACCENT = "#e0a458";
const ACCENT_SOFT_BG = "rgba(224,164,88,0.08)";
const ACCENT_SOFT_BORDER = "rgba(224,164,88,0.2)";

const DESIGN_PILLARS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "01 A sibling, not a port",
    icon: <MonitorPlay size={16} />,
    body:
      "Sieve for Windows and Sieve for Android share a name and a philosophy — paste a link, get the file, nothing monetized — but they are separate apps with separate codebases. Android is Kotlin + Jetpack Compose on MediaCodec; Windows is Electron + React on desktop ffmpeg. Each grows the features its platform is best at, so the two are similar ports in spirit, never direct ports.",
  },
  {
    title: "02 The desktop earns desktop features",
    icon: <Zap size={16} />,
    body:
      "A desktop machine has real encoder silicon, big storage, and stays on — so the Windows app leans into that: NVIDIA NVENC detection with encoder-aware quality tiers, true two-pass bitrate encoding, batch queues, watch folders that transcode whatever lands in them, and channel subscriptions that fetch new videos on a schedule.",
  },
  {
    title: "03 Free, clean, and honest about licenses",
    icon: <ShieldCheck size={16} />,
    body:
      "No ads, no accounts, no tracking — same policy as Android. FFmpeg ships under GPL v3 and is spawned strictly as a child process (no linking), with the compliance statement, license texts, and the FFmpeg source offer all viewable inside the app's About panel.",
  },
  {
    title: "04 Self-maintaining by design",
    icon: <RefreshCw size={16} />,
    body:
      "Sites change their players constantly, so the app keeps its download engine fresh: a one-click yt-dlp self-updater lives in the About panel, and every release ships the auto-updater manifest (latest.yml + blockmap) so the app can update itself between versions.",
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

export default function SieveWindowsProjectPage() {
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
            Personal · Windows · Desktop
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
            Sieve for Windows
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            Paste a link, get the file — then transcode it on your GPU. The desktop sibling of Sieve for Android: same spirit, its own codebase, and the features only a desktop can carry.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="https://github.com/Massivemiike/sieve-windows/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.6rem 1.4rem",
                background: ACCENT_SOFT_BG,
                border: `1px solid ${ACCENT_SOFT_BORDER}`,
                color: ACCENT,
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
              }}
            >
              Download for Windows <Download size={14} />
            </a>
            <Link
              href="/projects/sieve"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.6rem 1.4rem",
                background: "transparent",
                border: "1px solid #27273A",
                color: "#787F96",
                borderRadius: 6,
                fontWeight: 600,
                fontSize: "0.875rem",
                textDecoration: "none",
                fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
              }}
            >
              Sieve for Android <ArrowUpRight size={14} />
            </Link>
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
              v0.2.0 · Free · Windows 10/11
            </span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 4rem)" }}>
        {/* The pitch */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Zap size={13} />} label="What it is" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.25rem" }}>
              From link to library — with a real transcoder behind it.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              Sieve for Windows is a free desktop downloader and transcoder built on yt-dlp and ffmpeg. Paste a URL and it analyzes first — title, chapters, playlist entries — then one tap on any of 8 presets sends it to a queue with pause, resume, retry, and bulk actions. From there the transcode suite takes over: 52 presets across web, editing, social, audio, and device targets, running on your machine's hardware encoders.
            </p>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              It shares a name with Sieve for Android because it shares the philosophy — free, clean, no accounts, no monetization — but the two are siblings, not ports. Each app is built natively for its platform and carries its own feature set; the Windows version leans into desktop strengths like NVENC hardware encoding, watch folders, VMAF quality scoring, and scheduled channel subscriptions.
            </p>
            <p style={{ color: "#3C3F52", fontSize: "0.8125rem", lineHeight: 1.7, maxWidth: 760, margin: 0, fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
              Requirements: Windows 10/11 x64 · one-click installer (~191 MB, ffmpeg + yt-dlp bundled) · unsigned build — SmartScreen: More info → Run anyway · free, no accounts
            </p>
          </section>
        </SectionReveal>

        {/* Hero screenshot */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <Screenshot
              src="/images/projects/sieve-windows/01-new-download.png"
              alt="Sieve for Windows — the New Download page with URL bar, keyboard hints, recent-sites rail, and the NVIDIA NVENC status bar."
              width={1440}
              height={900}
              priority
              caption="New Download — paste a URL, analyze, one-tap a preset. NVENC detected in the status bar, bundled ffmpeg reported live."
            />
          </section>
        </SectionReveal>

        {/* Modules grid */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 pieces · desktop pipeline" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What it does
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(290px, 100%), 1fr))", gap: "1rem" }}>
              {sieveWindowsModules.map((mod) => (
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
            <div style={{ marginTop: "1.5rem" }}>
              <Screenshot
                src="/images/projects/sieve-windows/02-transcode.png"
                alt="Sieve for Windows Transcode page — 52 presets across 8 categories, Single/Batch/Watch-folder modes, and the NVIDIA NVENC encoder selector."
                width={1440}
                height={900}
                caption="Transcode — 52 presets across 8 categories, Batch and Watch-folder modes, NVENC detected and benchmarked against CPU."
              />
            </div>
          </section>
        </SectionReveal>

        {/* Design pillars */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<ShieldCheck size={13} />} label="Principles" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              Four commitments the app is built on
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>
              {DESIGN_PILLARS.map((step) => (
                <div key={step.title} style={{ display: "flex", gap: "1.125rem", alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 10,
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
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.0625rem", color: "#F0F2F8", marginBottom: "0.4rem" }}>
                      {step.title}
                    </div>
                    <p style={{ fontSize: "0.9375rem", color: "#787F96", lineHeight: 1.75, margin: 0, maxWidth: 780 }}>
                      {step.body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: "2rem" }}>
              <Screenshot
                src="/images/projects/sieve-windows/03-subscriptions.png"
                alt="Sieve for Windows Subscriptions page — add a channel or playlist URL and the app auto-checks it on a schedule."
                width={1440}
                height={900}
                caption="Subscriptions — point Sieve at channels and playlists and it fetches the newest videos on a schedule, skipping what you already have."
              />
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
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", gap: "0.75rem 2rem" }}>
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
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "2rem" }}>
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
            <p style={{ fontSize: "0.9375rem", color: "#787F96", lineHeight: 1.75, maxWidth: 780, margin: 0 }}>
              Releases live on{" "}
              <a href="https://github.com/Massivemiike/sieve-windows/releases" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: "none" }}>
                GitHub
              </a>{" "}
              with the auto-updater manifest alongside each installer. Prefer your phone?{" "}
              <Link href="/projects/sieve" style={{ color: ACCENT, textDecoration: "none" }}>
                Sieve for Android
              </Link>{" "}
              is the same idea, built natively for Android.
            </p>
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
            <Link href="/projects/sieve" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              Sieve for Android →
            </Link>
            <Link href="/projects/condascope" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              CondaScope →
            </Link>
            <Link href="/projects/trnscode" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              TRNSCODE →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
