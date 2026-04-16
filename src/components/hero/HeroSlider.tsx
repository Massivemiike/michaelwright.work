"use client";

import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import HeroSlide from "./HeroSlide";
import SlideProgress from "./SlideProgress";
import { heroSlides } from "@/data/heroSlides.data";
import { ChevronLeft, ChevronRight } from "lucide-react";

const SLIDE_DURATION = 6000;

export default function HeroSlider() {
  const [emblaRef, emblaApi] = useEmblaCarousel(
    { loop: true, duration: 40 },
    [Autoplay({ delay: SLIDE_DURATION, stopOnMouseEnter: true, stopOnInteraction: false })]
  );

  const [current, setCurrent] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setCurrent(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi, onSelect]);

  const prev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const next = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  return (
    <section
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Embla viewport */}
      <div
        ref={emblaRef}
        style={{ overflow: "hidden", width: "100%", height: "100%" }}
      >
        <div style={{ display: "flex", height: "100%" }}>
          {heroSlides.map((slide, i) => (
            <div
              key={slide.id}
              style={{ flex: "0 0 100%", minWidth: 0, height: "100%" }}
            >
              <HeroSlide
                slide={slide}
                isActive={i === current}
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom bar — progress + nav arrows */}
      <div
        style={{
          position: "absolute",
          bottom: "2rem",
          left: "4rem",
          right: "4rem",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SlideProgress
          total={heroSlides.length}
          current={current}
          duration={SLIDE_DURATION}
        />

        <div style={{ display: "flex", gap: "0.5rem" }}>
          {[
            { fn: prev, icon: <ChevronLeft size={18} />, label: "Previous" },
            { fn: next, icon: <ChevronRight size={18} />, label: "Next" },
          ].map(({ fn, icon, label }) => (
            <button
              key={label}
              onClick={fn}
              aria-label={label}
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "rgba(15,15,21,0.7)",
                border: "1px solid #27273A",
                color: "#787F96",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backdropFilter: "blur(8px)",
                transition: "border-color 0.2s, color 0.2s",
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Slide counter */}
      <div
        style={{
          position: "absolute",
          top: "50%",
          right: "2rem",
          transform: "translateY(-50%)",
          zIndex: 10,
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          alignItems: "center",
        }}
      >
        {heroSlides.map((_, i) => (
          <button
            key={i}
            onClick={() => emblaApi?.scrollTo(i)}
            aria-label={`Go to slide ${i + 1}`}
            style={{
              width: i === current ? 3 : 2,
              height: i === current ? 24 : 14,
              borderRadius: 2,
              background: i === current ? "#FF3B2F" : "#27273A",
              border: "none",
              cursor: "pointer",
              padding: 0,
              transition: "all 0.3s ease",
            }}
          />
        ))}
      </div>
    </section>
  );
}
