"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

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
        Error · Something went wrong
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display-var,'Syne'),sans-serif",
          fontWeight: 800,
          fontSize: "clamp(2rem,5vw,3.5rem)",
          color: "#F0F2F8",
          marginBottom: "1rem",
        }}
      >
        Unexpected failure
      </h1>
      <p style={{ color: "#787F96", fontSize: "1rem", maxWidth: 400, marginBottom: "2.5rem" }}>
        An error occurred while rendering this page. Try again or return home.
      </p>
      <div style={{ display: "flex", gap: "1rem" }}>
        <button
          onClick={reset}
          style={{
            padding: "0.875rem 2rem",
            background: "#FF3B2F",
            color: "#F0F2F8",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.9375rem",
            cursor: "pointer",
            fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
          }}
        >
          Try again
        </button>
        <a
          href="/"
          style={{
            padding: "0.875rem 2rem",
            background: "transparent",
            color: "#787F96",
            border: "1px solid #1F1F2E",
            borderRadius: 8,
            fontWeight: 600,
            fontSize: "0.9375rem",
            textDecoration: "none",
            fontFamily: "var(--font-body-var,'Outfit'),sans-serif",
          }}
        >
          Go home
        </a>
      </div>
    </div>
  );
}
