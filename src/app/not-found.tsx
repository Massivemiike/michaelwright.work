import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        position: "relative",
        zIndex: 10,
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: "0.6875rem",
          fontWeight: 600,
          letterSpacing: "0.18em",
          color: "#FF3B2F",
          textTransform: "uppercase",
          marginBottom: "1rem",
          fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
        }}
      >
        404 · Not Found
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display-var,'Syne'),sans-serif",
          fontWeight: 800,
          fontSize: "clamp(3rem,8vw,6rem)",
          color: "#F0F2F8",
          lineHeight: 1,
          marginBottom: "1.5rem",
        }}
      >
        Lost in the cloud
      </h1>
      <p style={{ color: "#787F96", fontSize: "1rem", maxWidth: 400, marginBottom: "2.5rem" }}>
        This route doesn&apos;t exist — it may have been removed or the URL is wrong.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.875rem 2rem",
          background: "#FF3B2F",
          color: "#F0F2F8",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: "0.9375rem",
          textDecoration: "none",
          fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
        }}
      >
        Back to home
      </Link>
    </div>
  );
}
