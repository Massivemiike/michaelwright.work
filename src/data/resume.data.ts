export interface TimelineEntry {
  id: string;
  company: string;
  role: string;
  period: string;
  location: string;
  type: "full-time" | "contract" | "consulting" | "self-employed";
  bullets: string[];
  technologies: string[];
  logoInitials: string;
  current?: boolean;
}

export interface Skill {
  category: string;
  items: { name: string; level: number }[];
}

export interface Certification {
  name: string;
  issuer: string;
  year: string;
  badge: string;
  credlyUrl: string;
}

export const timeline: TimelineEntry[] = [
  {
    id: "floaudio",
    company: "FloAud.io",
    role: "Founder & Chief Architect",
    period: "Dec 2025 – Present",
    location: "Los Angeles, CA · Remote",
    type: "self-employed",
    current: true,
    bullets: [
      "Founded and architected FloAud.io — a browser-native professional audio platform that shipped six production tools and a full audio engineering education system, serving musicians, podcasters, content creators, and students with no software installation required.",
      "Built the complete product suite end-to-end: AudioFlo (node-based visual effects chain on React Flow), StemFlo (neural stem separation up to 6-stem split), MasterFlo (reference-matched AI mastering with genre presets), MidiFlo (batch audio-to-MIDI with instrument-specific pitch detection), and Audio Cleanup (preset-driven noise removal and broadcast normalization).",
      "Designed and shipped TeachMe, a structured audio engineering curriculum covering 21 modules, 263+ lessons, and 205+ hours of content across 13 core modules and 8 genre specializations — with 600+ quiz questions, XP progression, ear training, mix challenges, and 21 certificates.",
      "Architected the full multi-tenant SaaS infrastructure on AWS, including audio processing pipelines, credit billing, user authentication, and secure file delivery — all scaled to handle real-time neural inference across the tool suite.",
      "Implemented a credit-based billing system with a free tier (3 previews, no credit card required), one-time credit packs, and a monthly subscription path — designed to eliminate subscription overhead for occasional creators while supporting high-volume users.",
      "Integrated state-of-the-art neural models for stem separation, pitch detection, and reference-driven mastering; engineered the serving layer for low-latency browser delivery.",
    ],
    technologies: ["AWS", "React", "TypeScript", "Python", "Java", "React Flow", "Neural Audio DSP", "FFmpeg", "Pedalboard", "EC2", "S3", "Stripe"],
    logoInitials: "FA",
  },
  {
    id: "gpltech",
    company: "GPL Technologies",
    role: "System Engineer, Cloud + DevOps",
    period: "Jul 2022 – Present",
    location: "Los Angeles, CA · Remote",
    type: "full-time",
    current: true,
    bullets: [
      // UPDATE: Replace these with your actual GPL Tech bullets once confirmed
      "Specialize in AWS Deadline Cloud render solutions and post-production pipeline architecture for major VFX studios and broadcast facilities.",
      "Design and deploy AWS Deadline Cloud POCs for major studios; architect Service-Managed and Customer-Managed Fleet render farms supporting Cinema4D, Maya, Houdini, Nuke, and After Effects workflows.",
      "Manage and optimize Redshift, Arnold, and V-Ray GPU/CPU rendering at scale with hybrid on-premises/cloud storage integration.",
      "Build custom deployment solutions including conda packages, Rez environments, and Python automation for integrations where standard tooling doesn't exist.",
      "Troubleshoot complex multi-system integrations spanning VPCs, Site-to-Site VPNs, licensing endpoints (FlexLM, RLM), and path mapping across Windows/Linux environments.",
      "Lead requirements gathering, POC scoping, and technical documentation for non-technical stakeholders at studio and executive level.",
    ],
    technologies: ["AWS Deadline Cloud", "EC2", "VPC", "S3", "Python", "conda", "Rez", "Cinema4D", "Houdini", "Maya", "Nuke", "After Effects", "Windows", "Linux"],
    logoInitials: "GPL",
  },
  {
    id: "cosavfx",
    company: "CoSA VFX",
    role: "I.T. Operations Administrator",
    period: "Mar 2018 – Jul 2022",
    location: "North Hollywood, CA · Hybrid",
    type: "full-time",
    bullets: [
      "Managed all IT infrastructure, render performance optimization, and security across three CoSA VFX studio locations.",
      "Pioneered cost-cutting solutions that reduced on-premises hardware overhead and enabled remote collaboration capabilities for VFX production teams.",
      "Administered licensing servers including FlexLM, RLM, LM-X, and SideFX Hkey across a complex multi-studio production environment.",
      "Managed procurement of all technical hardware across all three studios; maintained vendor relationships from concept to completion for complex network and hardware upgrades.",
      "Supported full production software stack: Cinema 4D, Houdini, Maya, Deadline, Nuke, Da Vinci Resolve, Avid Media Composer, Pro Tools, After Effects, Premiere, Redshift, V-Ray, and more.",
    ],
    technologies: ["Deadline", "Cinema4D", "Houdini", "Maya", "Nuke", "FlexLM", "Windows Server", "Linux", "Networking", "VMware", "After Effects", "Redshift", "V-Ray"],
    logoInitials: "CoSA",
  },
  {
    id: "jacksonjjherapy",
    company: "Jackson Jade Speech, OT, PT & ABA Therapy",
    role: "IT Manager",
    period: "May 2016 – Jan 2018",
    location: "Long Beach, CA · Hybrid",
    type: "full-time",
    bullets: [
      "Launched company-wide IT help desk ticketing system with integrated asset management across two clinic locations connected via MPLS link.",
      "Maintained Active Directory and Exchange 2010 environment; implemented MDM security policies across iPhone and Android devices.",
      "Maintained HIPAA compliance throughout all clinic systems including copier security, HID Proxcard door access, and digital fax routing.",
      "Reduced monthly printing costs by 24% by implementing Ricoh copiers with HID Proxcard pull-print security.",
      "Maintained dual Dell PowerEdge R720 servers running Windows SBS 2011 and Server 2008 R2; managed WatchGuard M200 Firebox firewalls.",
    ],
    technologies: ["Active Directory", "Exchange 2010", "Windows Server", "WatchGuard", "Shoretel", "HIPAA", "HID Proxcard", "MPLS", "MDM"],
    logoInitials: "JJ",
  },
];

export const skills: Skill[] = [
  {
    category: "Cloud & Infrastructure",
    items: [
      { name: "AWS (EC2, VPC, S3, Deadline Cloud)", level: 97 },
      { name: "AWS Deadline Cloud / Render Farms", level: 95 },
      { name: "Hybrid Cloud Architecture", level: 90 },
      { name: "Network Administration", level: 88 },
    ],
  },
  {
    category: "Render Pipeline & VFX",
    items: [
      { name: "AWS Deadline Cloud", level: 95 },
      { name: "Houdini / Maya / Cinema4D / Nuke", level: 85 },
      { name: "Redshift / Arnold / V-Ray", level: 82 },
      { name: "conda / Rez Environments", level: 88 },
    ],
  },
  {
    category: "DevOps & Automation",
    items: [
      { name: "Python Scripting & Automation", level: 88 },
      { name: "CI/CD Pipelines", level: 80 },
      { name: "Infrastructure as Code", level: 82 },
      { name: "Linux / Windows Cross-Platform", level: 92 },
    ],
  },
  {
    category: "Platform & Product",
    items: [
      { name: "AWS Backend Architecture", level: 90 },
      { name: "React / TypeScript", level: 72 },
      { name: "API Design", level: 80 },
      { name: "Audio DSP / FFmpeg", level: 78 },
    ],
  },
  {
    category: "IT Operations",
    items: [
      { name: "Licensing Servers (FlexLM, RLM, LM-X)", level: 90 },
      { name: "Active Directory / Exchange", level: 85 },
      { name: "HIPAA Compliance", level: 80 },
      { name: "Hardware Procurement & Vendor Mgmt", level: 85 },
    ],
  },
];

export const certifications: Certification[] = [
  { name: "AWS Certified Cloud Practitioner",          issuer: "Amazon Web Services", year: "Expires Mar 2029", badge: "CLF",   credlyUrl: "https://www.credly.com/badges/71ee0faa-f10b-4174-b407-d27e3d991728" },
  { name: "AWS Partner: Generative AI Technical",      issuer: "Amazon Web Services", year: "Mar 2026",         badge: "GenAI", credlyUrl: "https://www.credly.com/badges/542b2049-0438-45ec-bb1f-fa870e7a34df" },
  { name: "AWS Partner: Technical Accredited",         issuer: "Amazon Web Services", year: "Mar 2026",         badge: "TAP",   credlyUrl: "https://www.credly.com/badges/1fb727b8-2493-4585-921a-2f16f3cb155c" },
];

export const education = [
  {
    school: "Western Governors University",
    degree: "Bachelor of Science — Network Engineering & Security",
    period: "Jul 2022 – Jun 2023",
  },
  {
    school: "The Los Angeles Recording School",
    degree: "Associate of Science — Recording Arts Technology",
    period: "2012 – 2013",
    note: "GPA 3.92 · Graduated",
  },
];
