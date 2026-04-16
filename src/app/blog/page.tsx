import { getAllPosts } from "@/lib/blog";
import PostCard from "@/components/blog/PostCard";
import type { BlogCategory } from "@/types/blog";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Blog",
  description: "Thoughts on AWS, DevOps, VFX pipeline engineering, and building FloAud.io in public.",
  path: "/blog",
});

const CATEGORIES: ("All" | BlogCategory)[] = ["All", "AWS", "DevOps", "Personal"];

interface BlogPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
  const { category } = await searchParams;
  const allPosts = getAllPosts();
  const featured = allPosts.find((p) => p.featured);
  const filtered =
    category && category !== "All"
      ? allPosts.filter((p) => p.category === category)
      : allPosts;
  const grid = filtered.filter((p) => !p.featured || category);

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
          <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.18em", color: "#FF3B2F", textTransform: "uppercase", marginBottom: "0.75rem", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" }}>
            Blog
          </div>
          <h1 style={{ fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(2rem,4vw,3rem)", color: "#F0F2F8", marginBottom: "0.5rem" }}>
            Writing
          </h1>
          <p style={{ color: "#787F96", fontSize: "1rem" }}>
            AWS infrastructure, VFX pipeline engineering, DevOps, and building FloAud.io in public.
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "3rem 4rem" }}>
        {/* Category filter */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2.5rem", flexWrap: "wrap" }}>
          {CATEGORIES.map((cat) => {
            const active = (category ?? "All") === cat;
            return (
              <a
                key={cat}
                href={cat === "All" ? "/blog" : `/blog?category=${cat}`}
                style={{
                  padding: "0.4rem 1rem",
                  borderRadius: 6,
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  textDecoration: "none",
                  background: active ? "#FF3B2F" : "rgba(15,15,21,0.9)",
                  color: active ? "#F0F2F8" : "#787F96",
                  border: `1px solid ${active ? "#FF3B2F" : "#1F1F2E"}`,
                  transition: "all 0.2s",
                }}
              >
                {cat}
              </a>
            );
          })}
        </div>

        {/* Featured post */}
        {featured && !category && (
          <div style={{ marginBottom: "3rem" }}>
            <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.12em", color: "#3C3F52", textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "1rem" }}>
              Featured
            </div>
            <PostCard post={featured} variant="featured" />
          </div>
        )}

        {/* Grid */}
        {grid.length > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.5rem" }}>
            {grid.map((post) => (
              <PostCard key={post.slug} post={post} />
            ))}
          </div>
        ) : (
          <p style={{ color: "#3C3F52", textAlign: "center", padding: "4rem 0" }}>
            No posts in this category yet.
          </p>
        )}
      </div>
    </div>
  );
}
