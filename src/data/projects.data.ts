export interface Project {
  id: string;
  name: string;
  description: string;
  highlights: string[];
  tags: string[];
  href?: string;
  status: "live" | "in-progress" | "completed";
}

export interface FloTool {
  name: string;
  label: string;
  description: string;
  detail: string;
  href: string;
}

export const floaudTools: FloTool[] = [
  {
    name: "AudioFlo",
    label: "Visual Editor",
    description: "Drag-and-drop audio processing chain builder",
    detail:
      "A node-based visual processor where users build custom signal chains by connecting effects — compressors, limiters, noise gates, parametric EQ, filters, distortion, modulation, spatial effects, pitch/time tools, and mastering processors. Built on React Flow with a real-time audio engine.",
    href: "https://floaud.io/advanced-audio",
  },
  {
    name: "StemFlo",
    label: "Stem Separation",
    description: "Neural AI stem separation for any song",
    detail:
      "State-of-the-art neural models separate any track into vocals, drums, bass, and instruments. Supports standard presets (vocals only, instrumental, 4-stem, 6-stem) and an advanced mode. Accepts MP3, WAV, FLAC, AAC, OGG, and Opus up to 100MB.",
    href: "https://floaud.io/stemflo",
  },
  {
    name: "MasterFlo",
    label: "AI Mastering",
    description: "Reference-matched AI mastering in seconds",
    detail:
      "Intelligent mastering that matches a track to a professional reference — either a genre preset (Rock, Pop, Hip-Hop, Classical, Electronic) or a user-uploaded reference. Outputs WAV, MP3, or FLAC. Handles loudness targeting, dynamics, and spectral balance automatically.",
    href: "https://floaud.io/masterflo",
  },
  {
    name: "MidiFlo",
    label: "Audio to MIDI",
    description: "AI-powered pitch detection converts audio to MIDI",
    detail:
      "Converts any audio recording into a playable MIDI file using AI pitch detection. Instrument-optimized presets for vocals, piano, guitar, bass, and mixed recordings. Supports batch processing of up to 5 files simultaneously and live microphone recording up to 15 minutes.",
    href: "https://floaud.io/midiflo",
  },
  {
    name: "Audio Cleanup",
    label: "Noise Removal",
    description: "Remove noise, hiss, and hum from any recording",
    detail:
      "Preset-driven noise removal and voice processing covering podcast cleanup, heavy noise reduction, voice clarity, broadcast voice, and interview cleanup. Also includes music mastering and normalization categories. Processes any format up to 100MB.",
    href: "https://floaud.io/cleanup",
  },
  {
    name: "TeachMe",
    label: "Education Platform",
    description: "Structured audio engineering curriculum with certificates",
    detail:
      "21 modules, 263+ lessons, 205+ hours of content covering everything from sound physics to advanced DSP and genre-specific production. 13 core modules (fundamentals through EDM production) plus 8 genre specializations (Rock, Hip-Hop, Metal, Country, R&B, Post-Production, Jazz, Podcast). Includes 600+ quiz questions, XP progression, ear training, mix challenges, and 21 certificates. First lesson of every module is free.",
    href: "https://floaud.io/teachme",
  },
];

export interface RndrTier {
  name: string;
  type: "GPU" | "CPU";
  price: string;
  hardware: string;
  vram?: string;
  vcpu: string;
  ram: string;
  useCase: string;
}

export const rndrTiers: RndrTier[] = [
  { name: "GPU Standard", type: "GPU", price: "$1.80/hr", hardware: "NVIDIA T4", vram: "16GB VRAM", vcpu: "4 vCPU", ram: "16GB RAM", useCase: "Animation, arch-viz, product renders" },
  { name: "GPU Pro", type: "GPU", price: "$4.50/hr", hardware: "NVIDIA A10G", vram: "24GB VRAM", vcpu: "16 vCPU", ram: "64GB RAM", useCase: "VFX, large scenes, GPU-intensive renders" },
  { name: "CPU Standard", type: "CPU", price: "$1.20/hr", hardware: "Intel Xeon (c6i.2xlarge)", vcpu: "8 vCPU", ram: "16GB RAM", useCase: "Arnold, RenderMan, CPU-native engines" },
  { name: "CPU Pro", type: "CPU", price: "$3.50/hr", hardware: "Intel Xeon (c6i.8xlarge)", vcpu: "32 vCPU", ram: "64GB RAM", useCase: "Heavy Houdini sims, large mesh renders" },
];

export const personalProjects: Project[] = [
  {
    id: "floaudio",
    name: "FloAud.io",
    description:
      "Browser-based professional audio platform — six studio-grade tools and a full audio engineering education system, built as solo technical founder from architecture through product.",
    highlights: [
      "Architected and deployed the full multi-tenant SaaS platform on AWS, including audio processing pipelines, credit billing system, and user authentication",
      "Built six production tools: AudioFlo (visual node-based effects chain), StemFlo (neural stem separation), MasterFlo (AI reference mastering), MidiFlo (audio-to-MIDI), Audio Cleanup, and TeachMe education platform",
      "Designed TeachMe: 21 modules, 263+ lessons, 205+ hours of structured curriculum across 13 core modules and 8 genre specializations with XP, quizzes, and certificates",
      "Integrated state-of-the-art neural models for stem separation, pitch detection, and AI-driven mastering with reference matching",
      "Implemented credit-based billing with free tier (3 previews), one-time credit packs, and monthly subscription plans",
      "Serves musicians, podcasters, content creators, and students — free to try with no credit card required",
    ],
    tags: ["AWS", "Python", "AI/ML", "React", "SaaS", "Audio DSP", "Node-Based UI", "Founder"],
    href: "https://floaud.io",
    status: "live",
  },
  {
    id: "rndrwork",
    name: "rndr.work",
    description:
      "Cloud rendering platform built on AWS Deadline Cloud — modern GPU infrastructure, DCC-native submitters, and transparent per-node-hour pricing for VFX professionals.",
    highlights: [
      "Built on AWS Deadline Cloud with auto-scaling from 0 to 100+ workers based on job queue demand — zero infrastructure management for end users",
      "NVIDIA A10G (24GB VRAM) and T4 (16GB VRAM) GPU nodes plus CPU tiers — the same hardware running production VFX pipelines",
      "DCC-native submitters for Blender, Maya, Houdini, and Cinema 4D with one-click install — no separate desktop app required",
      "DAG-based multi-step job pipelines: chain Houdini simulations → Maya renders → post-processing in a single automated workflow",
      "Auto-refund on job failure — credits instantly returned with no support tickets required; only render farm offering this",
      "Real-time monitoring with per-frame status, ETA estimates, live logs, and email notifications with signed download links on completion",
      "Transparent per-node-hour pricing ($1.20–$4.50/hr), credits never expire, $25 free trial with no credit card required",
      "Priority levels from Economy (spot) through Rush (dedicated on-demand) with volume discount packages up to 25% off",
    ],
    tags: ["AWS", "Deadline Cloud", "VFX", "GPU", "Blender", "Maya", "Houdini", "Cinema 4D", "SaaS", "Founder"],
    href: "https://rndr.work",
    status: "live",
  },
];

export const gplProjects: Project[] = [
  {
    id: "deadline-cloud",
    name: "AWS Deadline Cloud — VFX Render Farm",
    description:
      "Designed and deployed a fully managed cloud render farm on AWS Deadline Cloud for high-volume VFX production workloads.",
    highlights: [
      "Provisioned and configured Deadline Cloud managed workers with custom AMIs for VFX tooling",
      "Integrated NeatVideo and BorisFX Sapphire plugins across the managed worker fleet",
      "Built cost controls and fleet scaling policies to optimize render spend",
      "Coordinated rollout across production pipelines with zero downtime",
    ],
    tags: ["AWS", "Deadline Cloud", "VFX", "HPC", "Python", "EC2"],
    status: "completed",
  },
  {
    id: "conda-rez",
    name: "Conda + Rez Package Pipeline",
    description:
      "Implemented a reproducible software environment pipeline using Conda and Rez for cross-platform VFX package management.",
    highlights: [
      "Standardized artist and render environments across Linux and Windows workstations",
      "Replaced ad-hoc dependency management with versioned, auditable Rez packages",
      "Reduced environment-related production incidents significantly",
      "Enabled rapid onboarding of new software versions without disrupting active productions",
    ],
    tags: ["Conda", "Rez", "Python", "DevOps", "Linux", "Windows"],
    status: "completed",
  },
  {
    id: "vpc-security",
    name: "Multi-Region VPC Security Architecture",
    description:
      "Designed and implemented a hardened multi-region VPC architecture with layered security controls for production workloads.",
    highlights: [
      "Built hub-and-spoke VPC topology with Transit Gateway across multiple AWS regions",
      "Implemented security group policies, NACLs, and WAF rules aligned to compliance requirements",
      "Set up centralized VPC Flow Logs and GuardDuty for threat detection",
      "Achieved and maintained 99.9%+ uptime SLA across all managed infrastructure",
    ],
    tags: ["AWS", "VPC", "Security", "Transit Gateway", "GuardDuty", "WAF"],
    status: "completed",
  },
  {
    id: "onprem-cloud-migration",
    name: "On-Premises to AWS Cloud Migration",
    description:
      "Led full migration of on-premises infrastructure to AWS, replacing legacy hardware with scalable cloud-native services.",
    highlights: [
      "Assessed existing on-prem workloads and designed target-state AWS architecture",
      "Executed phased migration with rollback plans, maintaining production continuity",
      "Reduced infrastructure operating costs and eliminated hardware refresh cycles",
      "Implemented IaC with Terraform for all migrated resources",
    ],
    tags: ["AWS", "Terraform", "Migration", "EC2", "S3", "RDS"],
    status: "completed",
  },
];
