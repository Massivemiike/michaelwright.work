import Link from "next/link";
import { ArrowLeft, Cpu, Download, FileText, GitBranch, Layers, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import Screenshot from "@/components/media/Screenshot";
import { personalProjects, condascopeModules } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "CondaScope",
  description:
    "Windows desktop tool for AWS Deadline Cloud administrators — browse the managed conda channel's software catalog, compare Windows and Linux fleets, and generate ready-to-upload queue environments.",
  path: "/projects/condascope",
});

const project = personalProjects.find((p) => p.id === "condascope")!;

const ACCENT = "#F58720";
const ACCENT_SOFT_BG = "rgba(245,135,32,0.08)";
const ACCENT_SOFT_BORDER = "rgba(245,135,32,0.2)";

const DESIGN_PILLARS: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "01 Wrap the supported path, don't fight it",
    icon: <Zap size={16} />,
    body:
      "AWS restricts the managed conda channel's storage to in-VPC farm workers, so a desktop app can't read it directly — the supported method is running a job on the farm and reading its logs. CondaScope automates exactly that: it submits a short conda-search job via boto3, polls it, and parses the per-platform results out of CloudWatch Logs. An experimental direct-S3 fast path was prototyped, validated against AWS's access-point policy, and deliberately removed.",
  },
  {
    title: "02 Generate-only, always",
    icon: <ShieldCheck size={16} />,
    body:
      "CondaScope never modifies a farm. The Queue Environment Builder writes the YAML/JSON file and shows the exact aws deadline create-queue-environment command — the administrator reviews and runs it themselves. Read-only tools get adopted; tools that mutate production infrastructure on a button-click don't.",
  },
  {
    title: "03 Useful even when the farm isn't reachable",
    icon: <RefreshCw size={16} />,
    body:
      "Catalog results cache for 24 hours per platform. When a live fetch fails — expired SSO session, wrong network, cold fleet — the app serves the stale cache with an honest \"via cache\" badge and a sign-in hint, and a fetch that returns zero packages never overwrites good data. An admin can keep planning a queue environment on an airplane.",
  },
  {
    title: "04 Nothing sensitive ships",
    icon: <GitBranch size={16} />,
    body:
      "No credential handling at all — the app rides the standard AWS credential chain (CLI, SSO, or the Deadline Cloud monitor) and never prompts for, displays, or stores a secret. The distributable is generic: farm and queue IDs live in local config, and no account-specific identifiers are baked into the executable.",
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

export default function CondaScopeProjectPage() {
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
            GPL Technologies · AWS Deadline Cloud · Windows Desktop
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
            CondaScope
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            See exactly what your render farm can run. Browse the Deadline Cloud software catalog, compare Windows and Linux fleets, and generate the queue environment that pins it — in minutes, not an afternoon of log spelunking.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="/downloads/CondaScope-win64.zip"
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
            <a
              href="/downloads/CondaScope-HowTo.pdf"
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
              How-To PDF <FileText size={14} />
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
              v0.1 · Windows 10/11
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
              The Deadline Cloud catalog, without the log spelunking.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              AWS Deadline Cloud's service-managed fleets install DCC software — Blender, Maya, Houdini, Nuke, Cinema 4D, Unreal, renderers, and their adaptors — from a managed conda channel. When an admin needs to pin software to a specific version, they need to know exactly which versions exist. AWS's docs list only major versions; the documented way to get the real list is to submit a render job and dig through its CloudWatch logs.
            </p>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: "0 0 1rem" }}>
              CondaScope turns that into a desktop app. Sign in with the AWS CLI, give it a Farm ID and Queue ID, and it runs the query for you — every package and exact version for both Windows and Linux fleets, in a searchable, sortable table. Tick the versions you want and it generates a ready-to-upload conda queue environment, YAML or JSON, plus the exact AWS command to apply it. Built at GPL Technologies as support software for our Deadline Cloud customers.
            </p>
            <p style={{ color: "#3C3F52", fontSize: "0.8125rem", lineHeight: 1.7, maxWidth: 760, margin: 0, fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
              Requirements: Windows 10/11 · WebView2 (built into current Windows) · AWS CLI or Deadline Cloud monitor sign-in · Farm ID + Queue ID · ~54 MB zip, no install
            </p>
          </section>
        </SectionReveal>

        {/* Hero screenshot */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <Screenshot
              src="/images/projects/condascope/01-browse.png"
              alt="CondaScope's Browse screen — dark GPL-branded UI listing the Deadline Cloud managed channel's packages with exact versions, builds, channels, and kind badges."
              width={1475}
              height={950}
              priority
              caption="Browse — the real catalog from a live farm, served from cache with the app offline. Every version, exact builds, apps-only filtering."
            />
          </section>
        </SectionReveal>

        {/* Modules grid */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Layers size={13} />} label="6 pieces · catalog to queue env" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              What it does
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(290px, 100%), 1fr))", gap: "1rem" }}>
              {condascopeModules.map((mod) => (
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
                src="/images/projects/condascope/02-queue-env.png"
                alt="CondaScope's Queue Environment Builder — pinned package specs on the left, a live YAML preview of the OpenJD queue environment and the aws deadline create-queue-environment upload command on the right."
                width={1475}
                height={950}
                caption="Queue Environment Builder — pins on the left, live YAML/JSON preview and the exact upload command on the right. Generate-only."
              />
            </div>
          </section>
        </SectionReveal>

        {/* Design pillars */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<ShieldCheck size={13} />} label="Design decisions" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              Four decisions the tool is built on
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
                src="/images/projects/condascope/03-compare.png"
                alt="CondaScope's Compare Windows and Linux screen — version differences between the two fleet catalogs, then packages that exist on only one platform."
                width={1475}
                height={950}
                caption="Compare Win ⇄ Linux — version drift first, then what exists on only one platform. Useful when advising on fleet OS choices."
              />
            </div>
          </section>
        </SectionReveal>

        {/* What I built */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Cpu size={13} />} label="The build" />
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
              The download includes the app and a GPL-branded How-To PDF — sign in, connect, browse, and pin in four steps.{" "}
              <a href="/downloads/CondaScope-win64.zip" style={{ color: ACCENT, textDecoration: "none" }}>
                Grab the zip
              </a>{" "}
              or read the{" "}
              <a href="/downloads/CondaScope-HowTo.pdf" target="_blank" rel="noopener noreferrer" style={{ color: ACCENT, textDecoration: "none" }}>
                How-To
              </a>{" "}
              first.
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
            <Link href="/projects/sieve" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              Sieve →
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
