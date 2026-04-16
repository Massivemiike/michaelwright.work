import Link from "next/link";
import Image from "next/image";
import type { BlogPost } from "@/types/blog";

const CATEGORY_COLORS: Record<string, string> = {
  AWS:     "#7FDBFF",
  DevOps:  "#FF3B2F",
  Personal:"#F0F2F8",
};

interface PostCardProps {
  post: BlogPost;
  variant?: "featured" | "default";
}

export default function PostCard({ post, variant = "default" }: PostCardProps) {
  const accentColor = CATEGORY_COLORS[post.category] ?? "#787F96";

  if (variant === "featured") {
    return (
      <Link
        href={`/blog/${post.slug}`}
        style={{ textDecoration: "none", display: "block" }}
      >
        <article
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 0,
            background: "rgba(15,15,21,0.9)",
            border: "1px solid #27273A",
            borderRadius: 12,
            overflow: "hidden",
            transition: "border-color 0.2s",
          }}
        >
          {/* Image */}
          <div style={{ position: "relative", minHeight: 320 }}>
            <Image
              src={post.coverImage}
              alt={post.title}
              fill
              style={{ objectFit: "cover" }}
              sizes="50vw"
            />
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "linear-gradient(to right, transparent 60%, rgba(15,15,21,0.95))",
              }}
            />
          </div>

          {/* Content */}
          <div style={{ padding: "2.5rem", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <span
                style={{
                  fontSize: "0.625rem",
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: accentColor,
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                  background: `${accentColor}12`,
                  padding: "3px 8px",
                  borderRadius: 3,
                  border: `1px solid ${accentColor}30`,
                }}
              >
                {post.category}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#3C3F52" }}>
                {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
              </span>
              <span style={{ fontSize: "0.75rem", color: "#3C3F52" }}>·</span>
              <span style={{ fontSize: "0.75rem", color: "#3C3F52" }}>{post.readingTime} min read</span>
            </div>

            <h2
              style={{
                fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                fontWeight: 800,
                fontSize: "clamp(1.25rem,2vw,1.75rem)",
                color: "#F0F2F8",
                lineHeight: 1.2,
                marginBottom: "1rem",
              }}
            >
              {post.title}
            </h2>

            <p style={{ color: "#787F96", fontSize: "0.9375rem", lineHeight: 1.7, marginBottom: "1.5rem" }}>
              {post.excerpt}
            </p>

            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: "#FF3B2F",
              }}
            >
              Read article →
            </div>
          </div>
        </article>
      </Link>
    );
  }

  return (
    <Link href={`/blog/${post.slug}`} style={{ textDecoration: "none", display: "block" }}>
      <article
        style={{
          background: "rgba(15,15,21,0.9)",
          border: "1px solid #1F1F2E",
          borderRadius: 10,
          overflow: "hidden",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          transition: "border-color 0.2s",
        }}
      >
        {/* Cover image */}
        <div style={{ position: "relative", height: 200, flexShrink: 0 }}>
          <Image
            src={post.coverImage}
            alt={post.title}
            fill
            style={{ objectFit: "cover" }}
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "linear-gradient(to bottom, transparent 40%, rgba(15,15,21,0.9))",
            }}
          />
          <div style={{ position: "absolute", top: "1rem", left: "1rem" }}>
            <span
              style={{
                fontSize: "0.625rem",
                fontWeight: 700,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: accentColor,
                fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                background: "rgba(8,8,12,0.8)",
                padding: "3px 8px",
                borderRadius: 3,
                border: `1px solid ${accentColor}40`,
              }}
            >
              {post.category}
            </span>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "1.5rem", flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.875rem" }}>
            <span style={{ fontSize: "0.75rem", color: "#3C3F52" }}>
              {new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
            </span>
            <span style={{ fontSize: "0.75rem", color: "#3C3F52" }}>·</span>
            <span style={{ fontSize: "0.75rem", color: "#3C3F52" }}>{post.readingTime} min read</span>
          </div>

          <h3
            style={{
              fontFamily: "var(--font-display-var,'Syne'),sans-serif",
              fontWeight: 700,
              fontSize: "1.0625rem",
              color: "#F0F2F8",
              lineHeight: 1.3,
              marginBottom: "0.75rem",
            }}
          >
            {post.title}
          </h3>

          <p style={{ color: "#787F96", fontSize: "0.875rem", lineHeight: 1.7, flex: 1 }}>
            {post.excerpt}
          </p>

          <div
            style={{
              marginTop: "1.25rem",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.375rem",
            }}
          >
            {post.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: "0.6875rem",
                  color: "#3C3F52",
                  background: "rgba(31,31,46,0.8)",
                  border: "1px solid #1F1F2E",
                  padding: "2px 6px",
                  borderRadius: 3,
                  fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </article>
    </Link>
  );
}
