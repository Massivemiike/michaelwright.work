"use client";

import Lightbox from "yet-another-react-lightbox";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import { type GalleryImage } from "@/data/gallery.data";

interface LightboxWrapperProps {
  images: GalleryImage[];
  open: boolean;
  index: number;
  onClose: () => void;
}

export default function LightboxWrapper({ images, open, index, onClose }: LightboxWrapperProps) {
  const slides = images.map((img) => ({
    src: img.src,
    alt: img.alt,
    width: img.width,
    height: img.height,
  }));

  return (
    <Lightbox
      open={open}
      close={onClose}
      index={index}
      slides={slides}
      plugins={[Zoom, Thumbnails]}
      styles={{
        container: { backgroundColor: "rgba(8,8,12,0.97)" },
        thumbnail: { border: "1px solid #1F1F2E" },
        thumbnailsContainer: { backgroundColor: "rgba(8,8,12,0.9)" },
      }}
    />
  );
}
