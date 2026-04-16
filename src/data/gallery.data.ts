export interface GalleryImage {
  id: string;
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}

export const galleryImages: GalleryImage[] = [
  {
    id: "1",
    src: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1200&q=80",
    alt: "Server room infrastructure",
    caption: "AWS Deadline Cloud render farm deployment",
    width: 1200, height: 800,
  },
  {
    id: "2",
    src: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&q=80",
    alt: "Circuit board detail",
    caption: "Hardware infrastructure — circuit-level detail",
    width: 800, height: 1000,
  },
  {
    id: "3",
    src: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1200&q=80",
    alt: "Data center corridor",
    caption: "CoSA VFX — render farm operations",
    width: 1200, height: 800,
  },
  {
    id: "4",
    src: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1000&q=80",
    alt: "Global network visualization",
    caption: "Multi-region AWS architecture",
    width: 1000, height: 1000,
  },
  {
    id: "5",
    src: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80",
    alt: "Digital security interface",
    caption: "Security architecture — VPC design",
    width: 800, height: 1100,
  },
  {
    id: "6",
    src: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=1200&q=80",
    alt: "Server rack closeup",
    caption: "On-premises to cloud migration",
    width: 1200, height: 800,
  },
  {
    id: "7",
    src: "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=900&q=80",
    alt: "Code on dark terminal",
    caption: "Python pipeline automation",
    width: 900, height: 600,
  },
  {
    id: "8",
    src: "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=800&q=80",
    alt: "Laptop with code in dark setting",
    caption: "FloAud.io — backend development",
    width: 800, height: 900,
  },
  {
    id: "9",
    src: "https://images.unsplash.com/photo-1667372393119-3d4c48d07fc9?w=1200&q=80",
    alt: "Kubernetes cluster diagram",
    caption: "EKS cluster architecture",
    width: 1200, height: 750,
  },
];
