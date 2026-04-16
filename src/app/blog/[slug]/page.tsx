import { notFound } from "next/navigation";
import Image from "next/image";
import { MDXRemote } from "next-mdx-remote/rsc";
import rehypePrettyCode from "rehype-pretty-code";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import MDXComponents from "@/components/blog/MDXComponents";
import { buildMetadata } from "@/lib/metadata";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return buildMetadata({
    title: post.title,
    description: post.excerpt,
    path: `/blog/${slug}`,
    image: post.coverImage,
  });
}

const CATEGORY_COLORS: Record<string, string> = {
  AWS: "#7FDBFF",
  DevOps: "#FF3B2F",
  Personal: "#F0F2F8",
};

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const accentColor = CATEGORY_COLORS[post.category] ?? "#787F96";

  return (
    <div style={{ minHeight: "100vh", paddingTop: 66, position: "relative", zIndex: 10 }}>
      {/* Cover image */}
      <div style={{ position: "relative", height: "45vh", minHeight: 320 }}>
        <Image
          src={post.coverImage}
          alt={post.title}
          fill
          priority
          style={{ objectFit: "cover" }}
          sizes="100vw"
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(to bottom, rgba(8,8,12,0.3) 0%, rgba(8,8,12,0.95) 100%)",
          }}
        />
      </div>

      {/* Article */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 4rem 6rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 260px", gap: "4rem", alignItems: "start" }}>

          {/* Main content */}
          <article>
            {/* Meta */}
            <div style={{ marginBottom: "2.5rem", paddingTop: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
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
                <span style={{ fontSize: "0.8125rem", color: "#3C3F52" }}>
                  {new Date(post.date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                </span>
                <span style={{ fontSize: "0.8125rem", color: "#3C3F52" }}>·</span>
                <span style={{ fontSize: "0.8125rem", color: "#3C3F52" }}>{post.readingTime} min read</span>
              </div>

              <h1
                style={{
                  fontFamily: "var(--font-display-var,'Syne'),sans-serif",
                  fontWeight: 800,
                  fontSize: "clamp(1.75rem,3.5vw,2.75rem)",
                  color: "#F0F2F8",
                  lineHeight: 1.1,
                  marginBottom: "1rem",
                }}
              >
                {post.title}
              </h1>

              <p style={{ color: "#787F96", fontSize: "1.125rem", lineHeight: 1.7 }}>
                {post.excerpt}
              </p>
            </div>

            {/* MDX */}
            <div style={{ borderTop: "1px solid #1F1F2E", paddingTop: "2rem" }}>
              <MDXRemote
                source={post.content}
                components={MDXComponents}
                options={{
                  mdxOptions: {
                    rehypePlugins: [
                      [rehypePrettyCode as never, { theme: "github-dark-dimmed", keepBackground: false }],
                    ],
                  },
                }}
              />
            </div>
          </article>

          {/* Sidebar */}
          <aside style={{ position: "sticky", top: "calc(66px + 2rem)" }}>
            <div
              style={{
                padding: "1.5rem",
                background: "rgba(15,15,21,0.9)",
                border: "1px solid #1F1F2E",
                borderRadius: 10,
                marginBottom: "1.5rem",
              }}
            >
              <div style={{ fontSize: "0.6875rem", fontWeight: 600, letterSpacing: "0.12em", color: "#3C3F52", textTransform: "uppercase", fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace", marginBottom: "1rem" }}>
                Tags
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: "0.6875rem",
                      color: "#787F96",
                      background: "rgba(31,31,46,0.8)",
                      border: "1px solid #27273A",
                      padding: "3px 8px",
                      borderRadius: 4,
                      fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <a
              href="/blog"
              style={{
                display: "block",
                padding: "0.75rem 1rem",
                background: "rgba(15,15,21,0.9)",
                border: "1px solid #1F1F2E",
                borderRadius: 8,
                fontSize: "0.8125rem",
                color: "#787F96",
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              ← All posts
            </a>
          </aside>
        </div>
      </div>
    </div>
  );
}
