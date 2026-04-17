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
    id: "cbfx-poc",
    name: "Chicken Bone VFX — Deadline Cloud POC & Cross-Account Architecture Validation",
    description:
      "Proof-of-concept engagement validating AWS Deadline Cloud for a full CBFX production pipeline — including cross-account RLM license connectivity and a hardened Rocky Linux 9 artist workstation image.",
    highlights: [
      "Designed cross-account RLM licensing via VPC Lattice to let Deadline Cloud workers reach the studio's on-prem license server without bridging networks",
      "Authored the CBFX AMI blueprint and gap analysis covering DCC coverage, NICE DCV, driver pinning, and NVMe cache policy",
      "Validated Nuke, Houdini, Maya, Blender, MochaPro, EmberGen, and LiquiGen running on SMF workers end-to-end",
      "Delivered architecture reference doc used as the basis for the production rollout",
    ],
    tags: ["AWS", "Deadline Cloud", "VPC Lattice", "RLM", "Rocky Linux", "Nuke", "Houdini", "Maya"],
    status: "completed",
  },
  {
    id: "cbfx-production",
    name: "Chicken Bone VFX — Deadline Cloud Production Farm Rollout",
    description:
      "Production deployment of the full CBFX render farm on AWS Deadline Cloud — from infrastructure-as-code foundation through a Rocky Linux 9 artist workstation image used studio-wide.",
    highlights: [
      "Authored the complete CloudFormation deploy for the CBFX farm, queues, fleets, and worker IAM",
      "Built a reproducible Rocky Linux 9 workstation image as Ansible playbooks — DCC stack, NICE DCV, LDAP/Kerberos, pinned NVIDIA driver, and 64 GB swap on NVMe cache",
      "Configured Nuke OFX plugin worker host scripts and Windows worker host scripts for 3ds Max / V-Ray 7 and After Effects",
      "Integrated NinjaOne RMM, studio pipeline mounts, and Flow desktop as part of the shipped image",
      "Shipped as a deployable GitHub repo with inventories, S3-hosted installer checklists, runbooks, and diagnostic scripts",
    ],
    tags: ["AWS", "Deadline Cloud", "CloudFormation", "Ansible", "Rocky Linux", "NICE DCV", "3ds Max", "V-Ray", "After Effects"],
    status: "completed",
  },
  {
    id: "cbfx-neatvideo-smf",
    name: "Chicken Bone VFX — Custom NeatVideo SMF Worker Image for Deadline Cloud",
    description:
      "Custom Service Managed Fleet worker build that brought licensed NeatVideo OFX plugins to Deadline Cloud — a solution AWS did not ship out of the box.",
    highlights: [
      "Packaged NeatVideo OFX into the SMF worker host bootstrap so every worker had the plugin registered at job start",
      "Wired license activation through cross-account RLM to satisfy NeatVideo's licensing model on ephemeral SMF hosts",
      "Delivered a repeatable worker configuration script as part of the Deadline-Cloud repo for long-term studio ownership",
      "First known NeatVideo-on-SMF implementation referenced internally as the pattern for other third-party OFX plugin integrations",
    ],
    tags: ["AWS", "Deadline Cloud", "SMF", "NeatVideo", "Nuke OFX", "Bash", "RLM"],
    status: "completed",
  },
  {
    id: "frame48-poc",
    name: "Frame48 VFX — SideFX Houdini 21 Deadline Cloud Farm (POC)",
    description:
      "Production-ready CloudFormation template deploying a full Houdini 21 render farm on AWS Deadline Cloud — farm, queue, fleet, S3 attachments, IAM, and monitoring in a single stack.",
    highlights: [
      "Authored a single-stack CFN template provisioning the complete Deadline Cloud topology for Frame48's 3D pipeline",
      "Configured a dedicated Houdini 21 fleet with IAM scoped to queue access and S3 job attachments",
      "Wrote artist-facing workstation setup documentation delivered as both DOCX and PDF",
      "Deployment was pure IaC — stack up, stack down, no click-ops",
    ],
    tags: ["AWS", "Deadline Cloud", "CloudFormation", "Houdini 21", "IaC"],
    status: "completed",
  },
  {
    id: "transit-poc",
    name: "Transit — Cinema 4D + Redshift / Arnold on Deadline Cloud (SMF + Spot)",
    description:
      "POC proving out GPU rendering on AWS Deadline Cloud with two parallel queues — Cinema 4D 2026 with Redshift 2026.1, and Cinema 4D 2026 with C4DtoA (Arnold) — using Service Managed Fleets and Spot capacity.",
    highlights: [
      "Deployed the full two-queue / two-fleet topology via CloudFormation: Redshift fleet and Arnold fleet isolated for clean benchmarking",
      "Enabled Usage-Based Licensing so the studio paid per render-hour instead of managing license servers",
      "Tuned Windows SMF configuration for GPU rendering with Spot Instance resilience",
      "Produced deployment questionnaire, POC instructions, and artist workstation setup documentation",
    ],
    tags: ["AWS", "Deadline Cloud", "SMF", "Cinema 4D", "Redshift", "Arnold", "Spot", "UBL"],
    status: "completed",
  },
  {
    id: "alliance-poc",
    name: "Alliance VFX — AWS-Funded Multi-Phase Startup VFX Partnership POC",
    description:
      "Multi-phase AWS-funded engagement standing up a startup VFX studio on AWS — from network architecture through cost modeling, security, and delivery timeline — in partnership with AWS's Startup VFX program.",
    highlights: [
      "Delivered five revisions of the AWS Network Architecture (v1 → v5) as the design firmed up against cost and performance targets",
      "Produced the Security & Data Flow Diagram covering studio-to-cloud transit, artist access, and production data isolation",
      "Built the AWS Cost Estimate and Gantt-based project timeline used in the Statement of Work",
      "Scoped and documented the full infrastructure SOW as the deliverable AWS funded against",
    ],
    tags: ["AWS", "Deadline Cloud", "VPC", "Network Architecture", "Cost Modeling", "Startup VFX"],
    status: "completed",
  },
  {
    id: "jamm-poc",
    name: "JAMM VFX — Deadline Cloud POC",
    description:
      "Proof-of-concept engagement moving JAMM VFX workloads onto AWS Deadline Cloud with a studio-specific SMF worker configuration and queue topology.",
    highlights: [
      "Scoped the studio's DCC and render engine mix against Deadline Cloud SMF capabilities",
      "Deployed POC farm, queues, and fleets via CloudFormation with IAM scoped per queue",
      "Validated end-to-end job submission from artist workstations into the cloud farm",
      "Delivered architecture documentation and artist-facing submitter guidance",
    ],
    tags: ["AWS", "Deadline Cloud", "SMF", "CloudFormation", "VFX"],
    status: "completed",
  },
  {
    id: "buck-poc",
    name: "Buck Design (Buck.tv) — Deadline Cloud POC",
    description:
      "Proof-of-concept deployment validating Deadline Cloud as a render backend for Buck's motion design and VFX pipeline.",
    highlights: [
      "Provisioned Deadline Cloud infrastructure via CloudFormation tailored to Buck's DCC pipeline",
      "Configured SMF fleets and queues aligned to Buck's render engine and frame-delivery requirements",
      "Coordinated artist submitter setup and job attachment workflows",
      "Delivered POC architecture + operational documentation for internal handoff",
    ],
    tags: ["AWS", "Deadline Cloud", "SMF", "Motion Design", "VFX"],
    status: "completed",
  },
  {
    id: "cantina-poc",
    name: "Cantina Creative — Deadline Cloud POC",
    description:
      "Proof-of-concept for Cantina Creative that had to beat on-prem render hardware on both speed and cost — benchmarked against a real 20K-resolution, 2,000-frame production sequence.",
    highlights: [
      "Benchmark: on-prem hardware rendered each 20K-res frame in ~11 minutes — a full 2,000-frame pass would take ~15 days wall-time on a single box",
      "Deployed Linux SMF worker fleet on AWS Deadline Cloud tuned for the studio's DCC stack and 20K frame workload",
      "Per-frame time on cloud workers: 1:30–1:40 vs. 11:00 on-prem — a ~7× per-frame speedup on the same shot",
      "Full 2,000-frame job completed in ~2h 12m across 24 parallel workers, vs. the on-prem baseline of ~15 days single-threaded",
      "Validated the cost model beat on-prem amortized hardware spend at Cantina's render volume, clearing the bar the studio set for the POC",
    ],
    tags: ["AWS", "Deadline Cloud", "SMF", "Linux", "20K Render", "Feature VFX", "CloudFormation"],
    status: "completed",
  },
  {
    id: "sight-sound-poc",
    name: "Sight & Sound — Deadline Cloud POC",
    description:
      "Proof-of-concept engagement deploying AWS Deadline Cloud infrastructure and validating end-to-end render workflows for Sight & Sound.",
    highlights: [
      "Stood up the POC farm, queues, and SMF fleet via CloudFormation",
      "Configured worker bootstrap to match the studio's DCC and plugin environment",
      "Ran production-representative jobs to validate throughput and cost characteristics",
      "Delivered architecture documentation and artist submitter guidance",
    ],
    tags: ["AWS", "Deadline Cloud", "SMF", "CloudFormation", "VFX"],
    status: "completed",
  },
  {
    id: "andresen-maya-tile",
    name: "Andresen Digital — Custom Maya Tile Render Solution on Deadline Cloud (Production)",
    description:
      "Production deployment of a custom Maya tile-render solution on AWS Deadline Cloud, enabling distributed tile-based rendering of oversized Maya frames across the SMF worker fleet.",
    highlights: [
      "Designed a tile-render workflow that splits oversized Maya renders into tiles distributed across SMF workers and re-assembled on completion",
      "Implemented the custom worker bootstrap and job-submission glue to orchestrate tile jobs and their assembly stage",
      "Delivered the solution into production, handling real client deadlines on Andresen Digital's frame-level output",
      "Reduced per-frame wall-clock time meaningfully vs. single-node rendering on the same hardware",
    ],
    tags: ["AWS", "Deadline Cloud", "Maya", "Tile Rendering", "Python", "SMF"],
    status: "completed",
  },
];
