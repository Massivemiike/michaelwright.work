export interface HeroSlideData {
  id: number;
  imageSrc: string;
  imageAlt: string;
  eyebrow: string;
  headline: string[];
  subheadline: string;
  ctaLabel: string;
  ctaHref: string;
}

export const heroSlides: HeroSlideData[] = [
  {
    id: 1,
    imageSrc:
      "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1920&q=80",
    imageAlt: "Data center server rows",
    eyebrow: "AWS · Cloud Architecture",
    headline: ["Built right.", "Every time."],
    subheadline:
      "12+ years building infrastructure that engineering teams rely on — resilient, observable, and designed to scale from day one.",
    ctaLabel: "View Resume",
    ctaHref: "/resume",
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
    id: 4,
    imageSrc:
      "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1920&q=80",
    imageAlt: "Server infrastructure at scale",
    eyebrow: "Leadership · Engineering Culture",
    headline: ["The team", "behind the uptime."],
    subheadline:
      "Building not just infrastructure but the DevOps culture, tooling, and practices that let engineering teams ship with confidence.",
    ctaLabel: "About Me",
    ctaHref: "/#about",
  },
];
