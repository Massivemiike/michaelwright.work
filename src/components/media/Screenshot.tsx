import Image from "next/image";

export interface ScreenshotProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  priority?: boolean;
  sizes?: string;
}

const DEFAULT_SIZES = "(max-width: 720px) 100vw, (max-width: 1100px) 90vw, 1040px";

export default function Screenshot({
  src,
  alt,
  width,
  height,
  caption,
  priority = false,
  sizes = DEFAULT_SIZES,
}: ScreenshotProps) {
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          background: "rgba(8,8,12,0.6)",
          border: "1px solid #1F1F2E",
          borderRadius: 12,
          padding: 6,
          overflow: "hidden",
          lineHeight: 0,
        }}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes={sizes}
          style={{
            width: "100%",
            height: "auto",
            display: "block",
            borderRadius: 8,
          }}
        />
      </div>
      {caption && (
        <figcaption
          style={{
            fontSize: "0.6875rem",
            letterSpacing: "0.08em",
            color: "#787F96",
            fontFamily: "var(--font-mono-var,'JetBrains Mono'),monospace",
            marginTop: "0.625rem",
            textTransform: "uppercase",
          }}
        >
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
