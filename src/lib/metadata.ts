import type { Metadata } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://michaelwright.work";
const SITE_NAME = "Michael Wright";
const DEFAULT_DESCRIPTION =
  "DevOps & Systems Engineer specializing in AWS cloud infrastructure, platform reliability, and engineering leadership.";

interface BuildMetadataOptions {
  title: string;
  description?: string;
  path?: string;
  image?: string;
}

export function buildMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path = "",
  image = "/opengraph-image.png",
}: BuildMetadataOptions): Metadata {
  const url = `${SITE_URL}${path}`;
  const imageUrl = image.startsWith("http") ? image : `${SITE_URL}${image}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url,
      siteName: SITE_NAME,
      type: "website",
      locale: "en_US",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
      images: [imageUrl],
    },
  };
}

export { SITE_URL, SITE_NAME };
