export interface HeroSlideData {
  id: number;
  imageSrc: string;
  imageAlt: string;
  eyebrow: string;
  headline: string[];
  subheadline: string;
  ctaLabel: string;
  ctaHref: string;
  /** App-screenshot slides: pin the image right and add a strong left scrim so the headline stays legible. */
  appShowcase?: boolean;
}

// Order interleaves brand slides with application showcases: brand, app, brand, app, brand, app.
export const heroSlides: HeroSlideData[] = [
  {
    id: 1,
    imageSrc:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1920&q=80",
    imageAlt: "Data center server rows",
    eyebrow: "AWS · Cloud Architecture",
    headline: ["Built Wright.", "Every time."],
    subheadline:
      "12+ years building infrastructure that engineering teams rely on — resilient, observable, and designed to scale from day one.",
    ctaLabel: "View Resume",
    ctaHref: "/resume",
  },
  {
    id: 4,
    imageSrc: "/images/projects/trnscode/01-dashboard.png",
    imageAlt: "The TRNSCODE console dashboard — dark UI with live job, worker, and queue telemetry",
    eyebrow: "TRNSCODE · Founder · M&E + VFX",
    headline: ["Broadcast-grade delivery.", "Yours."],
    subheadline:
      "An on-prem Media & Entertainment delivery and VFX ingest platform — 46 presets, a seven-verifier correctness pass, and NLE round-trip. Built as solo technical founder.",
    ctaLabel: "Explore TRNSCODE",
    ctaHref: "/projects/trnscode",
    appShowcase: true,
  },
  {
    id: 2,
    imageSrc:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1920&q=80",
    imageAlt: "Circuit board close-up",
    eyebrow: "DevOps · CI/CD · Automation",
    headline: ["Zero downtime.", "By design."],
    subheadline:
      "Turning on-call nightmares into boring, predictable systems through disciplined platform engineering and thoughtful automation.",
    ctaLabel: "Read the Blog",
    ctaHref: "/blog",
  },
  {
    id: 5,
    imageSrc: "/images/projects/condascope/01-browse.png",
    imageAlt: "CondaScope's Browse screen listing the AWS Deadline Cloud software catalog with exact versions",
    eyebrow: "CondaScope · AWS Deadline Cloud",
    headline: ["Your render farm,", "fully mapped."],
    subheadline:
      "A click-to-run desktop tool for Deadline Cloud admins — every version in AWS's managed conda channel, and the queue environment that pins it, generated in minutes.",
    ctaLabel: "Explore CondaScope",
    ctaHref: "/projects/condascope",
    appShowcase: true,
  },
  {
    id: 3,
    imageSrc:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=80",
    imageAlt: "Global network infrastructure",
    eyebrow: "Platform Engineering · SRE",
    headline: ["Infrastructure", "at scale."],
    subheadline:
      "AWS-certified systems engineer with a track record of 99.9% SLA delivery across multi-region cloud environments.",
    ctaLabel: "Get in Touch",
    ctaHref: "/contact",
  },
  {
    id: 6,
    imageSrc: "/images/projects/sieve/01-download-page.png",
    imageAlt: "The Sieve for Android download page — dark UI with amber accents and a phone mockup of the app",
    eyebrow: "Sieve · Android · Open Source",
    headline: ["Paste a link.", "Get the file."],
    subheadline:
      "A free, open-source media downloader and transcoder for Android — 1,000+ sites through yt-dlp, hardware-accelerated on-device conversion, no ads, no trackers, no accounts.",
    ctaLabel: "Explore Sieve",
    ctaHref: "/projects/sieve",
    appShowcase: true,
  },
];
