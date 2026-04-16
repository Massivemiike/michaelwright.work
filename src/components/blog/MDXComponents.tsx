import type { MDXComponents } from "mdx/types";

const baseText = { fontFamily: "var(--font-body-var,'Outfit'),sans-serif" };
const monoFont = { fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace" };

const components: MDXComponents = {
  h1: ({ children }) => (
    <h1 style={{ ...baseText, fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 800, fontSize: "clamp(1.75rem,3vw,2.5rem)", color: "#F0F2F8", lineHeight: 1.1, margin: "2rem 0 1rem" }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ ...baseText, fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 700, fontSize: "clamp(1.375rem,2.5vw,1.875rem)", color: "#F0F2F8", lineHeight: 1.2, margin: "2.5rem 0 1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #1F1F2E" }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ ...baseText, fontFamily: "var(--font-display-var,'Syne'),sans-serif", fontWeight: 600, fontSize: "1.25rem", color: "#F0F2F8", margin: "2rem 0 0.75rem" }}>
      {children}
    </h3>
  ),
  p: ({ children }) => (
    <p style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1.0625rem", margin: "0 0 1.25rem" }}>
      {children}
    </p>
  ),
  ul: ({ children }) => (
    <ul style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1.0625rem", margin: "0 0 1.25rem", paddingLeft: "1.5rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol style={{ color: "#787F96", lineHeight: 1.85, fontSize: "1.0625rem", margin: "0 0 1.25rem", paddingLeft: "1.5rem", display: "flex", flexDirection: "column", gap: "0.375rem" }}>
      {children}
    </ol>
  ),
  li: ({ children }) => <li style={{ color: "#787F96" }}>{children}</li>,
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: "3px solid #FF3B2F", paddingLeft: "1.25rem", margin: "1.5rem 0", color: "#787F96", fontStyle: "italic" }}>
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code style={{ ...monoFont, fontSize: "0.875em", background: "rgba(31,31,46,0.8)", border: "1px solid #27273A", padding: "2px 6px", borderRadius: 4, color: "#7FDBFF" }}>
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre style={{ ...monoFont, background: "rgba(10,10,16,0.95)", border: "1px solid #27273A", borderRadius: 8, padding: "1.25rem 1.5rem", overflowX: "auto", fontSize: "0.875rem", lineHeight: 1.7, margin: "1.5rem 0", color: "#E8EDF5" }}>
      {children}
    </pre>
  ),
  strong: ({ children }) => <strong style={{ color: "#F0F2F8", fontWeight: 600 }}>{children}</strong>,
  a: ({ href, children }) => (
    <a href={href} style={{ color: "#FF3B2F", textDecoration: "underline", textDecorationColor: "rgba(255,59,47,0.4)" }} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}>
      {children}
    </a>
  ),
  hr: () => <hr style={{ border: "none", borderTop: "1px solid #1F1F2E", margin: "2rem 0" }} />,
};

export default components;
