import { ExternalLink, Zap, Building2 } from "lucide-react";
import SectionReveal from "@/components/sections/SectionReveal";
import { personalProjects, gplProjects, type Project } from "@/data/projects.data";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Projects",
  description: "Personal projects and notable engineering work — from FloAud.io to AWS infrastructure deployments at GPL Technologies.",
  path: "/projects",
});

const STATUS_STYLES: Record<Project["status"], { label: string; color: string; bg: string; border: string }> = {
  live: { label: "Live", color: "#7FDBFF", bg: "rgba(127,219,255,0.08)", border: "rgba(127,219,255,0.2)" },
  "in-progress": { label: "In Progress", color: "#FF3B2F", bg: "rgba(255,59,47,0.08)", border: "rgba(255,59,47,0.2)" },
  completed: { label: "Completed", color: "#787F96", bg: "rgba(120,127,150,0.08)", border: "rgba(120,127,150,0.2)" },
};

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
          transition: "border-color 0.2s",
        }}
      >
        {/* Card header */}
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
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
                transition: "background 0.2s",
                textDecoration: "none",
              }}
            >
              <ExternalLink size={15} />
            </a>
          )}
        </div>

        {/* Highlights */}
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

          {/* Tags */}
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
    <div style={{ marginBottom: "2rem" }}>
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

export default function ProjectsPage() {
  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Header */}
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

      {/* Body */}
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "4rem" }}>

        {/* Personal Projects */}
        <section style={{ marginBottom: "5rem" }}>
          <SectionHeader
            icon={<Zap size={13} />}
            label="Personal"
            title="Personal Projects"
            subtitle="Products and platforms I've built independently."
          />
          <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {personalProjects.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i} />
            ))}
          </div>
        </section>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background: "linear-gradient(to right, #FF3B2F, #1F1F2E 60%)",
            marginBottom: "5rem",
          }}
        />

        {/* GPL Projects */}
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
