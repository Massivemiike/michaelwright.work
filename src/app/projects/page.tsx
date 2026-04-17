import { ExternalLink, Zap, Building2, ArrowUpRight } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import { personalProjects, gplProjects, floaudTools, rndrTiers, type Project } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Projects",
  description:
    "Personal projects and notable engineering work — from FloAud.io to AWS infrastructure deployments at GPL Technologies.",
  path: "/projects",
});

const STATUS_STYLES: Record<
  Project["status"],
  { label: string; color: string; bg: string; border: string; dot: string }
> = {
  live: {
    label: "Live",
    color: "#7FDBFF",
    bg: "rgba(127,219,255,0.08)",
    border: "rgba(127,219,255,0.2)",
    dot: "#7FDBFF",
  },
  "in-progress": {
    label: "In Progress",
    color: "#FF3B2F",
    bg: "rgba(255,59,47,0.08)",
    border: "rgba(255,59,47,0.2)",
    dot: "#FF3B2F",
  },
  completed: {
    label: "Completed",
    color: "#787F96",
    bg: "rgba(120,127,150,0.08)",
    border: "rgba(120,127,150,0.2)",
    dot: "#787F96",
  },
};

function SectionHeader({
  icon,
  label,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div style={{ marginBottom: "2.5rem" }}>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.18em",
          color: "#FF3B2F",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
          marginBottom: "0.75rem",
        }}
      >
        {icon}
        {label}
      </div>
      <h2
        style={{
          fontFamily: "var(--font-display-var,'Syne'),sans-serif",
          fontWeight: 800,
          fontSize: "clamp(1.5rem,3vw,2rem)",
          color: "#F0F2F8",
          margin: "0 0 0.5rem",
        }}
      >
        {title}
      </h2>
      <p style={{ color: "#787F96", fontSize: "0.9375rem", margin: 0 }}>{subtitle}</p>
    </div>
  );
}

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const status = STATUS_STYLES[project.status];
  return (
    <SectionReveal delay={index * 0.07}>
      <div
        style={{
          background: "rgba(15,15,21,0.9)",
          border: "1px solid #1F1F2E",
          borderRadius: 12,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "1.5rem",
            borderBottom: "1px solid #1F1F2E",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.5rem",
                flexWrap: "wrap",
              }}
            >
              <h3
                style={{
                  fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                  fontWeight: 700,
                  fontSize: "1.125rem",
                  color: "#F0F2F8",
                  margin: 0,
                }}
              >
                {project.name}
              </h3>
              <span
                style={{
                  fontSize: "0.625rem",
                  fontWeight: 600,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: status.color,
                  background: status.bg,
                  border: `1px solid ${status.border}`,
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  whiteSpace: "nowrap",
                }}
              >
                {status.label}
              </span>
            </div>
            <p style={{ color: "#787F96", fontSize: "0.9rem", lineHeight: 1.65, margin: 0 }}>
              {project.description}
            </p>
          </div>
          {project.href && (
            <a
              href={project.href}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "rgba(255,59,47,0.08)",
                border: "1px solid rgba(255,59,47,0.2)",
                color: "#FF3B2F",
                flexShrink: 0,
                textDecoration: "none",
              }}
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>
        <div style={{ padding: "1.25rem 1.5rem" }}>
          <ul
            style={{
              margin: "0 0 1.25rem",
              paddingLeft: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            {project.highlights.map((h, i) => (
              <li key={i} style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.7 }}>
                {h}
              </li>
            ))}
          </ul>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
            {project.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  padding: "0.25rem 0.625rem",
                  background: "rgba(31,31,46,0.8)",
                  border: "1px solid #27273A",
                  borderRadius: 4,
                  fontSize: "0.6875rem",
                  color: "#3C3F52",
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </SectionReveal>
  );
}

export default function ProjectsPage() {
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
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            style={{
              fontSize: "0.6875rem",
              fontWeight: 600,
              letterSpacing: "0.18em",
              color: "#FF3B2F",
              textTransform: "uppercase",
              marginBottom: "0.75rem",
              fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            }}
          >
            Projects
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 800,
              fontSize: "clamp(2rem,4vw,3rem)",
              color: "#F0F2F8",
              marginBottom: "0.5rem",
            }}
          >
            Work that matters
          </h1>
          <p style={{ color: "#787F96", fontSize: "1rem", maxWidth: 560 }}>
            Personal ventures and notable engineering projects — from founding a product to deploying production infrastructure at scale.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "4rem" }}>

        {/* ── Personal Projects ── */}
        <section style={{ marginBottom: "5rem" }}>
          <SectionHeader
            icon={<Zap size={13} />}
            label="Personal"
            title="Personal Projects"
            subtitle="Products and platforms I've built independently."
          />

          {/* FloAud.io hero card */}
          {personalProjects.map((project, i) => {
            const status = STATUS_STYLES[project.status];
            return (
              <SectionReveal key={project.id} delay={i * 0.07}>
                <div
                  style={{
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderTop: "1px solid rgba(255,59,47,0.3)",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: "1.5rem",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      padding: "2rem",
                      borderBottom: "1px solid #1F1F2E",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1.5rem",
                    }}
                  >
                    {/* Logo block */}
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 10,
                        background: "rgba(255,59,47,0.1)",
                        border: "1px solid rgba(255,59,47,0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                        fontWeight: 800,
                        fontSize: "1rem",
                        color: "#FF3B2F",
                        flexShrink: 0,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      FA
                    </div>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.75rem",
                          marginBottom: "0.5rem",
                          flexWrap: "wrap",
                        }}
                      >
                        <h2
                          style={{
                            fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                            fontWeight: 800,
                            fontSize: "1.5rem",
                            color: "#F0F2F8",
                            margin: 0,
                          }}
                        >
                          {project.name}
                        </h2>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.375rem",
                            fontSize: "0.625rem",
                            fontWeight: 600,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: status.color,
                            background: status.bg,
                            border: `1px solid ${status.border}`,
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                          }}
                        >
                          <span
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: "50%",
                              background: status.dot,
                              boxShadow: `0 0 5px ${status.dot}`,
                              display: "inline-block",
                            }}
                          />
                          {status.label}
                        </span>
                      </div>
                      <p
                        style={{
                          color: "#787F96",
                          fontSize: "0.9375rem",
                          lineHeight: 1.7,
                          margin: "0 0 1rem",
                          maxWidth: 640,
                        }}
                      >
                        {project.description}
                      </p>
                      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                        <a
                          href={project.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.375rem",
                            padding: "0.5rem 1.25rem",
                            background: "#FF3B2F",
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
                      </div>
                    </div>
                  </div>

                  {/* Key highlights */}
                  <div style={{ padding: "1.75rem 2rem", borderBottom: "1px solid #1F1F2E" }}>
                    <div
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        color: "#3C3F52",
                        textTransform: "uppercase",
                        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                        marginBottom: "1rem",
                      }}
                    >
                      What I built
                    </div>
                    <ul
                      style={{
                        margin: 0,
                        paddingLeft: "1.25rem",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                        gap: "0.5rem 2rem",
                      }}
                    >
                      {project.highlights.map((h, idx) => (
                        <li
                          key={idx}
                          style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.7 }}
                        >
                          {h}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Six tools grid */}
                  <div style={{ padding: "1.75rem 2rem", borderBottom: "1px solid #1F1F2E" }}>
                    <div
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 600,
                        letterSpacing: "0.12em",
                        color: "#3C3F52",
                        textTransform: "uppercase",
                        fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                        marginBottom: "1.25rem",
                      }}
                    >
                      6 tools · 1 platform
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                        gap: "1rem",
                      }}
                    >
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
                              padding: "1.125rem 1.25rem",
                              background: "rgba(8,8,12,0.6)",
                              border: "1px solid #1F1F2E",
                              borderRadius: 8,
                              height: "100%",
                              transition: "border-color 0.2s",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: "0.5rem",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontSize: "0.625rem",
                                    fontWeight: 600,
                                    letterSpacing: "0.12em",
                                    color: "#FF3B2F",
                                    textTransform: "uppercase",
                                    fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                                    marginBottom: "0.2rem",
                                  }}
                                >
                                  {tool.label}
                                </div>
                                <div
                                  style={{
                                    fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                                    fontWeight: 700,
                                    fontSize: "1rem",
                                    color: "#F0F2F8",
                                  }}
                                >
                                  {tool.name}
                                </div>
                              </div>
                              <ArrowUpRight size={14} style={{ color: "#3C3F52", flexShrink: 0 }} />
                            </div>
                            <p
                              style={{
                                fontSize: "0.8125rem",
                                color: "#787F96",
                                lineHeight: 1.6,
                                margin: 0,
                              }}
                            >
                              {tool.detail}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div style={{ padding: "1.25rem 2rem", display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                    {project.tags.map((tag) => (
                      <span
                        key={tag}
                        style={{
                          padding: "0.25rem 0.625rem",
                          background: "rgba(31,31,46,0.8)",
                          border: "1px solid #27273A",
                          borderRadius: 4,
                          fontSize: "0.6875rem",
                          color: "#3C3F52",
                          fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </SectionReveal>
            );
          })}

          {/* rndr.work card */}
          {(() => {
            const project = personalProjects.find(p => p.id === "rndrwork")!;
            const status = STATUS_STYLES[project.status];
            return (
              <SectionReveal delay={0.07}>
                <div
                  style={{
                    background: "rgba(15,15,21,0.9)",
                    border: "1px solid #1F1F2E",
                    borderTop: "1px solid rgba(127,219,255,0.2)",
                    borderRadius: 12,
                    overflow: "hidden",
                    marginBottom: "1.5rem",
                  }}
                >
                  {/* Header */}
                  <div
                    style={{
                      padding: "2rem",
                      borderBottom: "1px solid #1F1F2E",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "1.5rem",
                    }}
                  >
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 10,
                        background: "rgba(127,219,255,0.08)",
                        border: "1px solid rgba(127,219,255,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                        fontWeight: 800,
                        fontSize: "0.875rem",
                        color: "#7FDBFF",
                        flexShrink: 0,
                        letterSpacing: "-0.02em",
                      }}
                    >
                      RW
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                        <h2
                          style={{
                            fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                            fontWeight: 800,
                            fontSize: "1.5rem",
                            color: "#F0F2F8",
                            margin: 0,
                          }}
                        >
                          {project.name}
                        </h2>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.375rem",
                            fontSize: "0.625rem",
                            fontWeight: 600,
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            color: status.color,
                            background: status.bg,
                            border: `1px solid ${status.border}`,
                            padding: "3px 8px",
                            borderRadius: 4,
                            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                          }}
                        >
                          <span style={{ width: 5, height: 5, borderRadius: "50%", background: status.dot, boxShadow: `0 0 5px ${status.dot}`, display: "inline-block" }} />
                          {status.label}
                        </span>
                      </div>
                      <p style={{ color: "#787F96", fontSize: "0.9375rem", lineHeight: 1.7, margin: "0 0 1rem", maxWidth: 640 }}>
                        {project.description}
                      </p>
                      <a
                        href={project.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.375rem",
                          padding: "0.5rem 1.25rem",
                          background: "rgba(127,219,255,0.1)",
                          border: "1px solid rgba(127,219,255,0.25)",
                          color: "#7FDBFF",
                          borderRadius: 6,
                          fontWeight: 600,
                          fontSize: "0.875rem",
                          textDecoration: "none",
                          fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
                        }}
                      >
                        Visit rndr.work <ArrowUpRight size={14} />
                      </a>
                    </div>
                  </div>

                  {/* Highlights */}
                  <div style={{ padding: "1.75rem 2rem", borderBottom: "1px solid #1F1F2E" }}>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.12em", color: "#3C3F52", textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "1rem" }}>
                      What I built
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "1.25rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.5rem 2rem" }}>
                      {project.highlights.map((h, idx) => (
                        <li key={idx} style={{ fontSize: "0.875rem", color: "#787F96", lineHeight: 1.7 }}>{h}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Pricing tiers */}
                  <div style={{ padding: "1.75rem 2rem", borderBottom: "1px solid #1F1F2E" }}>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.12em", color: "#3C3F52", textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "1.25rem" }}>
                      Compute tiers · per node-hour
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.875rem" }}>
                      {rndrTiers.map((tier) => (
                        <div
                          key={tier.name}
                          style={{
                            padding: "1rem 1.125rem",
                            background: "rgba(8,8,12,0.6)",
                            border: "1px solid #1F1F2E",
                            borderRadius: 8,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                            <span style={{ fontSize: "0.625rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: tier.type === "GPU" ? "#7FDBFF" : "#FF3B2F", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>{tier.type}</span>
                            <span style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "1rem", color: "#F0F2F8" }}>{tier.price}</span>
                          </div>
                          <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "#F0F2F8", marginBottom: "0.25rem" }}>{tier.name}</div>
                          <div style={{ fontSize: "0.75rem", color: "#3C3F52", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "0.5rem" }}>
                            {tier.hardware}{tier.vram ? ` · ${tier.vram}` : ""}<br />{tier.vcpu} · {tier.ram}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "#787F96" }}>{tier.useCase}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tags */}
                  <div style={{ padding: "1.25rem 2rem", display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                    {project.tags.map((tag) => (
                      <span key={tag} style={{ padding: "0.25rem 0.625rem", background: "rgba(31,31,46,0.8)", border: "1px solid #27273A", borderRadius: 4, fontSize: "0.6875rem", color: "#3C3F52", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </SectionReveal>
            );
          })()}
        </section>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "linear-gradient(to right, #FF3B2F, #1F1F2E 60%)",
            marginBottom: "5rem",
          }}
        />

        {/* ── GPL Projects ── */}
        <section>
          <SectionHeader
            icon={<Building2 size={13} />}
            label="GPL Technologies"
            title="Notable Work Projects"
            subtitle="Significant engineering deployments and infrastructure builds at GPL Technologies."
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {gplProjects.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
