import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cpu, Download, GitBranch, Heart, Layers, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import Screenshot from "@/components/media/Screenshot";
import { personalProjects, sieveModules } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Sieve",
  description:
    "Free, open-source media downloader and transcoder for Android — download from 1,000+ sites via yt-dlp, then convert on-device with hardware acceleration. No ads, no trackers, no accounts.",
  path: "/projects/sieve",
});

const project = personalProjects.find((p) => p.id === "sieve")!;

const ACCENT = "#e0a458";
const ACCENT_SOFT_BG = "rgba(224,164,88,0.08)";
const ACCENT_SOFT_BORDER = "rgba(224,164,88,0.2)";

const DESIGN_PILLARS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "01 Free, clean, and open for all",
    icon: <Heart size={16} />,
    body:
      "No ads, no analytics, no tracking, no accounts, no paid tiers — and no code that monetizes users. The project is deliberately kept free and clean, funded by donations alone; supporters who give over $25 earn a permanent spot on the Key Supporters page. That's the entire business model, on purpose.",
  },
  {
    title: "02 Your files never leave the phone",
    icon: <ShieldCheck size={16} />,
    body:
      "The transcoder runs entirely on-device, on the phone's own hardware encoder chips — fast, battery-friendly, and private. Converting a file means never uploading it to some sketchy web converter. Everything lands in the phone's Download/Sieve folder where every other app can see it, not in opaque app-private storage.",
  },
  {
    title: "03 Self-maintaining by design",
    icon: <RefreshCw size={16} />,
    body:
      "Sieve isn't on the Play Store — it's distributed directly as a signed APK, sideloaded once. From there the app updates itself: signed, checksum-verified, with the published APK's SHA-256 pinned in the update manifest. The yt-dlp engine stays current automatically, so when a site changes its player, downloads keep working without waiting on an app release.",
  },
  {
    title: "04 Openly compliant open source",
    icon: <GitBranch size={16} />,
    body:
      "GPLv3, with the corresponding source — including the scripts that build the full-GPL FFmpeg (x264/x265 plus MediaCodec hardware encode) — published in the repo. Every release is validated end-to-end on physical hardware before it ships. Open source as practiced, not just licensed.",
  },
];

const USE_CASES = [
  "Saving talks, tutorials, and lectures for offline viewing on flights or commutes",
  "Podcast and audio archiving — pull a show to MP3 or Opus for any player",
  "Creators backing up their own uploads and channel content",
  "Journalists and researchers archiving reference material before it disappears",
  "Grabbing a clip and converting it to ProRes or editing-friendly formats for a video project",
  "Compressing phone footage with the hardware H.264/HEVC transcoder before sharing",
  "Converting between formats without uploading your files to a web converter",
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

export default function SieveProjectPage() {
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
            Personal · Android · Open Source
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
            Sieve
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            Paste a link, get the file. Download video and audio from over 1,000 sites, then convert it right on your phone — with hardware acceleration.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="https://massivemiike.github.io/sieve-android/"
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
              Download for Android <Download size={14} />
            </a>
            <a
              href="https://github.com/Massivemiike/sieve-android"
              target="_blank"
              rel="noopener noreferrer"
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
              Source on GitHub <ArrowUpRight size={14} />
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
              v1.0.3 · Free &amp; GPLv3
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
              One tool, from link to library.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              Sieve is a free, open-source media downloader and transcoder for Android. It puts a clean, modern interface on top of the industry-standard yt-dlp engine and a purpose-built FFmpeg pipeline — a general-purpose downloader and archiver for the open web, covering the 1,000+ sites yt-dlp supports. Paste a link, and Sieve shows the title, channel, and duration before you commit; pick a preset, and the file lands in your library.
            </p>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              What it deliberately isn&rsquo;t: monetized. No ads, no analytics, no tracking, no accounts, no paid tiers. It&rsquo;s distributed as a direct signed APK rather than through the Play Store, and a companion Sieve desktop app for Windows exists as part of the same project family.
            </p>
            <p style={{ color: "#3C3F52", fontSize: "0.8125rem", lineHeight: 1.7, maxWidth: 760, margin: 0, fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
              Requirements: Android 8.0+ · 64-bit (arm64) — effectively any phone from ~2018 onward · ~77 MB APK · sideload once, self-updates after
            </p>
          </section>
        </SectionReveal>

        {/* Hero screenshot */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <Screenshot
              src="/images/projects/sieve/01-download-page.png"
              alt="The Sieve for Android download page — dark UI with amber accents, the headline 'One tool, from link to library', and a direct APK download button."
              width={1440}
              height={900}
              priority
              caption="massivemiike.github.io/sieve-android — direct APK download, free, no strings."
            />
          </section>
        </SectionReveal>

        {/* Modules grid */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 pieces · link to library" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What it does
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(290px, 100%), 1fr))", gap: "1rem" }}>
              {sieveModules.map((mod) => (
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
                src="/images/projects/sieve/02-how-it-works.png"
                alt="The 'Three taps from link to file' section of the Sieve download page — paste a link, pick a preset, download."
                width={1440}
                height={547}
                caption="The whole flow: paste a link, pick a preset, download."
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
          </section>
        </SectionReveal>

        {/* Use cases */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Download size={13} />} label="In practice" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What you might use it for
            </h2>
            <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(380px, 100%), 1fr))", gap: "0.75rem 2rem" }}>
              {USE_CASES.map((u, idx) => (
                <li key={idx} style={{ fontSize: "0.9375rem", color: "#787F96", lineHeight: 1.7 }}>
                  {u}
                </li>
              ))}
            </ul>
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

        {/* Tech stack + support */}
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
              Sieve is free and will stay free.{" "}
              <a href="https://www.paypal.com/donate/?hosted_button_id=UK9EKFGU3PY9A" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: "none" }}>
                Donations
              </a>{" "}
              keep it free of ads and any code that monetizes users — supporters over $25 earn a permanent spot on the{" "}
              <a href="https://massivemiike.github.io/sieve-android/supporters.html" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: "none" }}>
                Key Supporters page
              </a>
              .
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
            <Link href="/projects/trnscode" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              TRNSCODE →
            </Link>
            <Link href="/projects/reactor48" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              Reactor 48 →
            </Link>
            <Link href="/projects/graffiti" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              Graffiti →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
