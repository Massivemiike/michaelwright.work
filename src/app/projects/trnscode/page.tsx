import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cpu, GitBranch, Inbox, Layers, Monitor, ShieldCheck, Workflow, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import Screenshot from "@/components/media/Screenshot";
import { personalProjects, trnscodeModules } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "TRNSCODE",
  description:
    "On-prem M&E delivery and VFX ingest platform — broadcast QC, NLE round-trip, OCIO/ACES, Flow Production Tracking. Built as solo technical founder.",
  path: "/projects/trnscode",
});

const project = personalProjects.find((p) => p.id === "trnscode")!;

const ACCENT = "#FF3B2F";
const ACCENT_SOFT_BG = "rgba(255,59,47,0.08)";
const ACCENT_SOFT_BORDER = "rgba(255,59,47,0.2)";

const ARCHITECTURE_STEPS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "Ingest",
    icon: <Inbox size={16} />,
    body:
      "Operators submit a video file, an EXR sequence via exrseq://, a CinemaDNG folder via dngdir://, or an OpenTimelineIO timeline that gets exploded into one job per clip across every video track. The AI selector runs in Manual, Guided, or Auto mode — a rule-based scorer (codec family, resolution class, alpha need, audio passthrough) and an OpenCLIP ViT-B/32 model (LAION-2B weights) reason over the source and propose a preset. If the CLIP weights aren't installed, Auto and Guided gracefully fall back to the rule-based pick and the UI says so — never passing off a deterministic pick as an AI pick.",
  },
  {
    title: "Chunking",
    icon: <Layers size={16} />,
    body:
      "TRNSCODE picks one of five strategies based on the source. Closed-GOP H.264/HEVC: read the keyframe index via ffprobe and pick GOP-aligned boundaries — no source re-encoding. Open-GOP or unknown: fast -force_key_frames remux first, then chunk against the remux. Scene-aware: aligns boundaries to actual scene cuts so chunks never cross dissolves. Cut-aligned: boundaries snap to AAF / EDL / FCPXML edits within tolerance. Frame-range: for EXR / image sequences, partition [first_frame, last_frame] into per-chunk ranges that oiiotool or ffmpeg image2 consume directly. Chunks default to ~12s, with ProRes at ~30s and AV1 at ~8s, capped 45s / floored 4s. A validator confirms every chunk lands on a frame before dispatch.",
  },
  {
    title: "Distribution",
    icon: <Workflow size={16} />,
    body:
      "Workers don't need a shared filesystem. The master serves chunk source bytes over HTTP at GET /chunks/{id}/source and accepts encoded output at PUT /chunks/{id}/output. Every URL carries an HMAC-signed token scoped to a single chunk with a 60-minute TTL. Same-host workers use a zero-copy local path — no HTTP, no firewall, no LAN traffic. Cross-host workers dial the master's mDNS-advertised LAN IP, so a typical LAN needs zero static configuration. Wired workers (≥ 1 Gbps Ethernet) are admitted by default; Wi-Fi and cellular links are refused at registration with a worker.network_unsupported event because flaky links poison parallel encodes.",
  },
  {
    title: "Scheduling + encode",
    icon: <GitBranch size={16} />,
    body:
      "The scheduler scores each idle worker against each pending chunk on four signals: runtime estimate (EMA per worker × preset class), network distance (same-host > LAN > WAN), queue delay (idle workers prioritized), and capability fit (NVENC chunks penalize VAAPI-only workers heavily). GPU sessions are budgeted per (worker, GPU) with a token bucket sized from each card's NVENC session limit, so the scheduler never oversubscribes a card; multi-GPU hosts get round-robin affinity. Lowest total cost wins. Work-stealing kicks in if a chunk's been queued too long while another worker idles. Workers stream progress every second over a bidi gRPC channel — frame, FPS, bitrate, speed, ETA — which is what tickets on the Dashboard and job-detail page.",
  },
  {
    title: "Assembly",
    icon: <Cpu size={16} />,
    body:
      "When every chunk for a job arrives, the master confirms the codec signature matches across chunks (e.g. all H.264 high@L4.0) and the color signatures match — assembly refuses if HDR/SDR metadata drifted mid-stream. It extracts the source audio once via ffmpeg -c copy, runs ffmpeg -f concat -c copy to glue the encoded video together, and muxes the audio sidecar back in — with an AAC fallback if the source codec and destination container disagree.",
  },
  {
    title: "Verify + deliver",
    icon: <ShieldCheck size={16} />,
    body:
      "A correctness pass runs up to seven independent verifiers and persists a report on the job's Forensics tab: PSNR/SSIM/VMAF via libvmaf, bit-exact reproducibility (elementary-stream sha256), deterministic argv audit, PTS/DTS timeline, sample-accurate audio concat at chunk boundaries, source fixity (sha256 + size baseline captured at submit), codec conformance against the preset's declared spec, and color consistency. An opt-in QC pass measures integrated LUFS + true-peak against a named deliverable profile (broadcast_atsc, broadcast_ebu_r128, ott_netflix). An opt-in review gate parks the job at pending_approval until a reviewer scrubs the full assembled output through HLS preview and approves. Then a MAM push fires to Iconik / Dalet / Avid if a deliverable matrix matches — rate-limited, retrying, idempotent, credential-redacting.",
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
            Personal · M&E + VFX Platform
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
            On-prem M&amp;E delivery and VFX ingest. Every machine on your LAN encoding. Every output verified. Every NLE round-trippable.
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
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "clamp(2rem, 6vw, 4rem) clamp(1.25rem, 5vw, 4rem)" }}>
        {/* The pitch */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Zap size={13} />} label="What it is" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.25rem" }}>
              It started as a parallel transcoder. It grew into a platform.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              Drop a video, an EXR sequence, a CinemaDNG folder, or an OTIO timeline into TRNSCODE and it gets sliced, sent to every encoder on your LAN, encoded in parallel, then stitched back together and verified — automatically. One machine becomes the conductor; every other becomes a worker that picks up chunks and returns finished media.
            </p>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: 0 }}>
              On top of that engine sits an on-prem Media &amp; Entertainment delivery and VFX ingest platform — broadcast-grade QC, HDR10 / HLG / SDR color management, ProRes / DNxHR / DPX / EXR mezzanines, NLE round-trip across Resolve / Premiere / FCP / OTIO / EDL / AAF, a full VFX studio ingest pipeline with OCIO/ACES and Flow Production Tracking, RAW/CinemaDNG ingest, and AI-assisted preset selection. All of it runs on hardware you already own. Bursting to cloud is on the roadmap, not a requirement. Ships as two single-file Windows executables with ffmpeg, the VFX toolchain, and the ACES Studio Config baked in — mDNS auto-discovery, double-click to run.
            </p>
          </section>
        </SectionReveal>

        {/* Hero screenshot — the dashboard */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <Screenshot
              src="/images/projects/trnscode/01-dashboard.png"
              alt="The TRNSCODE dashboard in Advanced mode — live fleet FPS, KPI cards for chunk counts and 24-hour verify pass rate, a fleet chunk map, the live event log, and a per-worker FPS strip."
              width={2397}
              height={1063}
              priority
              caption="The dashboard, Advanced mode — live fleet FPS, KPI cards, the fleet chunk map, and a live event log."
            />
          </section>
        </SectionReveal>

        {/* Modules / components grid */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 pillars · 1 platform" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What&rsquo;s on the platform
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(290px, 100%), 1fr))", gap: "1rem" }}>
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
            <div style={{ marginTop: "1.5rem" }}>
              <Screenshot
                src="/images/projects/trnscode/02-queue.png"
                alt="The TRNSCODE queue showing 17 jobs with live progress bars and per-row status — done, failed, and canceled — across YouTube, Instagram, broadcast, and proxy presets."
                width={2396}
                height={1162}
                caption="The queue — every job with live progress, per-row retry / cancel, and status at a glance."
              />
            </div>
          </section>
        </SectionReveal>

        {/* The console */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Monitor size={13} />} label="The console" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.25rem" }}>
              Two density modes, every operator surface.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              The browser console at <code style={{ color: "#F0F2F8", background: "rgba(31,31,46,0.6)", padding: "0.1rem 0.4rem", borderRadius: 4, fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", fontSize: "0.875rem" }}>localhost:7443</code> is a React + Vite + TanStack SPA served from the same origin as the master API. Operators flip between a <strong style={{ color: "#F0F2F8" }}>Simple</strong> mode (Queue / Submit / Workers) and an <strong style={{ color: "#F0F2F8" }}>Advanced</strong> mode that adds the Dashboard, the Activity feed, and per-job Forensics.
            </p>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              The Dashboard reports live fleet FPS, KPI cards (chunk counts, 24-hour verify pass rate, average chunk duration), a fleet chunk map, and a per-worker FPS strip. Click a queue row and the job-detail page opens with five tabs — Chunks, Workers, Logs, Spec, and Forensics — where the correctness report, lineage, per-chunk argv, and metadata diff live. The Review surface scrubs the full assembled job through an HLS preview before a reviewer approves or rejects. Ingest, Ingest Profiles, and Shots cover the VFX side; the Activity feed is a virtualized, live-tailing audit of every job, chunk, worker, MAM write, and Flow event.
            </p>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: 0 }}>
              Settings is split into General, Operations, Integrations, and Access sub-pages with admin-gated route groups. A Cmd-K command palette switches surfaces and themes. Thirteen accent palettes ship with the build; per-user theme is persisted to the DB and hydrated on login. Live-data pulses gate behind <code style={{ color: "#F0F2F8", background: "rgba(31,31,46,0.6)", padding: "0.1rem 0.4rem", borderRadius: 4, fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", fontSize: "0.875rem" }}>prefers-reduced-motion</code>.
            </p>
            <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", gap: "2rem" }}>
              <Screenshot
                src="/images/projects/trnscode/03-job-detail-forensics.png"
                alt="A TRNSCODE job-detail page with the Forensics tab open — the preset selector audit, source-versus-output lineage, chunk metadata, and the exact ffmpeg argv for the job."
                width={2397}
                height={1417}
                caption="Job detail, Forensics tab — preset selector audit, source/output lineage, and the exact ffmpeg argv per chunk."
              />
              <div className="trnscode-shot-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))", gap: "2rem" }}>
                <Screenshot
                  src="/images/projects/trnscode/04-settings-appearance.png"
                  alt="The TRNSCODE appearance settings — a catalog of thirteen accent palettes, each previewed as a live card, with the per-account theme highlighted."
                  width={2377}
                  height={1708}
                  caption="Settings → Appearance — thirteen accent palettes, persisted per account."
                />
                <Screenshot
                  src="/images/projects/trnscode/05-settings-flow.png"
                  alt="The TRNSCODE integrations settings — MAM connections plus the Autodesk Flow Production Tracking panel for connecting a studio's VFX shot-tracking instance."
                  width={2405}
                  height={1685}
                  caption="Settings → Integrations — MAM plus Autodesk Flow Production Tracking for VFX shot tracking."
                />
              </div>
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
