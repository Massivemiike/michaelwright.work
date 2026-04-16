import HeroSlider from "@/components/hero/HeroSlider";
import AboutSection from "@/components/sections/AboutSection";
import { buildMetadata } from "@/lib/metadata";

export const metadata = buildMetadata({
  title: "Michael Wright — Cloud Infrastructure Architect",
  description: "DevOps & Systems Engineer specializing in AWS cloud infrastructure, platform reliability, and engineering leadership.",
  path: "",
});

export default function HomePage() {
  return (
    <>
      <HeroSlider />
      <AboutSection />
    </>
  );
}
