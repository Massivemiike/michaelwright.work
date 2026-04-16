"use client";

interface SlideProgressProps {
  total: number;
  current: number;
  duration: number; // ms per slide
}

export default function SlideProgress({ total, current, duration }: SlideProgressProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.375rem",
        alignItems: "center",
      }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 2,
            width: i === current ? 48 : 24,
            borderRadius: 1,
            background: "#27273A",
            overflow: "hidden",
            transition: "width 0.3s ease",
            flexShrink: 0,
          }}
        >
          {i === current && (
            <div
              key={current} // remount on slide change to restart animation
              style={{
                height: "100%",
                background: "#FF3B2F",
                borderRadius: 1,
                animation: `progressFill ${duration}ms linear forwards`,
              }}
            />
          )}
          {i < current && (
            <div style={{ height: "100%", background: "#FF3B2F", borderRadius: 1, width: "100%" }} />
          )}
        </div>
      ))}

      <style>{`
        @keyframes progressFill {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
