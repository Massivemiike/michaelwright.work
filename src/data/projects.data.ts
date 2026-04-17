export interface Project {
  id: string;
  name: string;
  description: string;
  highlights: string[];
  tags: string[];
  href?: string;
  status: "live" | "in-progress" | "completed";
}

export const personalProjects: Project[] = [
  {
    id: "floaudio",
    name: "FloAud.io",
    description:
      "AI-powered audio platform built from the ground up — full-stack founder role spanning cloud architecture, backend API design, and product strategy.",
    highlights: [
      "Architected multi-tenant SaaS infrastructure on AWS with auto-scaling and high availability",
      "Built backend services with real-time audio processing pipelines",
      "Designed the product from concept to production as solo technical founder",
      "Integrated AI/ML models for audio analysis and generation workflows",
    ],
    tags: ["AWS", "Python", "AI/ML", "SaaS", "Full-Stack", "Founder"],
    href: "https://floaud.io",
    status: "in-progress",
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
