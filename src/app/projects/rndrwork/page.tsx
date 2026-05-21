import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Cloud, Cpu, GitBranch, Layers, Server, ShieldCheck, Workflow, Zap } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import { personalProjects, rndrTiers } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "rndr.work",
  description:
    "Cloud rendering platform built on AWS Deadline Cloud — modern GPU infrastructure, DCC-native submitters, transparent per-node-hour pricing for VFX professionals.",
  path: "/projects/rndrwork",
});

const project = personalProjects.find((p) => p.id === "rndrwork")!;

const ACCENT = "#7FDBFF";
const ACCENT_SOFT_BG = "rgba(127,219,255,0.08)";
const ACCENT_SOFT_BORDER = "rgba(127,219,255,0.2)";

const ARCHITECTURE: { title: string; body: string; icon: React.ReactNode }[] = [
  {
    title: "AWS Deadline Cloud, auto-scaled",
    icon: <Cloud size={16} />,
    body:
      "Built on AWS Deadline Cloud with auto-scaling from 0 to 100+ workers based on job queue demand. End users do zero infrastructure management — submit a job, the fleet appears, the work runs, the fleet returns to zero. The studio never pays for idle hardware and never waits for capacity that should have already spun up.",
  },
  {
    title: "DCC-native submitters",
    icon: <Workflow size={16} />,
    body:
      "Blender, Maya, Houdini, and Cinema 4D ship with one-click submitters that drop straight into the DCC's menu. No separate desktop app required, no command-line invocations. The artist's workflow doesn't change — submitting a render takes the same number of clicks as a local one, the job just runs on the farm.",
  },
  {
    title: "DAG-based multi-step jobs",
    icon: <GitBranch size={16} />,
    body:
      "Chain Houdini simulations → Maya renders → post-processing into a single automated workflow. The DAG handles dependencies between stages so a sim that needs to finish before a render starts is wired correctly — no manual gating, no Slack messages between stages.",
  },
  {
    title: "Auto-refund on failure",
    icon: <ShieldCheck size={16} />,
    body:
      "If a job fails, credits return instantly — no support ticket required. rndr.work is the only render farm offering this. The economics work because the platform owns enough of the failure modes (node health, retry logic, validation) that genuinely broken jobs are rare, and when they happen the credit refund is cheaper than the support load it would otherwise create.",
  },
  {
    title: "Real-time monitoring",
    icon: <Server size={16} />,
    body:
      "Per-frame status, ETA estimates, live logs, and email notifications with signed download links on completion. The artist can leave the browser closed and the email tells them exactly what to download and where it lives.",
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

export default function RndrworkProjectPage() {
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
            Personal · VFX · Cloud Render Farm
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
            rndr.work
          </h1>
          <p style={{ color: "#F0F2F8", fontSize: "1.125rem", maxWidth: 680, lineHeight: 1.55, margin: "0 0 1.5rem" }}>
            Cloud rendering for VFX professionals — modern GPU infrastructure, DCC-native submitters, and pricing you can read at a glance.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <a
              href="https://rndr.work"
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
              Visit rndr.work <ArrowUpRight size={14} />
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
              A render farm that ships modern hardware at honest prices.
            </h2>
            <p style={{ color: "#787F96", fontSize: "1rem", lineHeight: 1.75, maxWidth: 760, margin: 0 }}>
              rndr.work is a cloud rendering platform built on AWS Deadline Cloud, designed for VFX studios that want production-grade GPU and CPU rendering without managing infrastructure. The same hardware that powers production VFX pipelines — NVIDIA A10G and T4 — at transparent per-node-hour pricing. DCC-native submitters for Blender, Maya, Houdini, and Cinema 4D. DAG-based multi-step pipelines. Auto-refund on job failure — the only farm that ships this. $25 free trial, no credit card.
            </p>
          </section>
        </SectionReveal>

        {/* Compute tiers */}
        <SectionReveal>
          <section style={{ marginBottom: "4rem" }}>
            <SectionLabel icon={<Cpu size={13} />} label="Compute tiers · per node-hour" />
            <h2 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.5rem,3vw,2rem)", color: "#F0F2F8", margin: "0 0 1.75rem" }}>
              Hardware
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
              {rndrTiers.map((tier) => (
                <div
                  key={tier.name}
                  style={{
                    padding: "1.25rem 1.375rem",
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.6rem" }}>
                    <span style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: tier.type === "GPU" ? ACCENT : "#FF3B2F", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
                      {tier.type}
                    </span>
                    <span style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1.0625rem", color: "#F0F2F8" }}>
                      {tier.price}
                    </span>
                  </div>
                  <div style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "0.9375rem", color: "#F0F2F8", marginBottom: "0.3rem" }}>
                    {tier.name}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#3C3F52", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "0.6rem" }}>
                    {tier.hardware}{tier.vram ? ` · ${tier.vram}` : ""}<br />{tier.vcpu} · {tier.ram}
                  </div>
                  <p style={{ fontSize: "0.8125rem", color: "#787F96", lineHeight: 1.6, margin: 0 }}>
                    {tier.useCase}
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
            <SectionLabel icon={<Layers size={13} />} label="Solo build" />
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
            <Link href="/projects/floaudio" style={{ fontSize: "0.875rem", color: "#787F96", textDecoration: "none" }}>
              FloAud.io →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
