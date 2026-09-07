import { Image } from "@mantine/core";
import { useMediaQuery, useReducedMotion } from "@mantine/hooks";
import { useEffect, useRef } from "react";
import classes from "./HeroArtwork.module.css";

export function HeroArtwork() {
  const logoRef = useRef<HTMLDivElement>(null);
  const finePointer = useMediaQuery("(hover: hover) and (pointer: fine)");
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const logo = logoRef.current;
    if (!logo || !finePointer || reducedMotion) return;

    let frame = 0;
    const handleMouseMove = (event: MouseEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = logo.getBoundingClientRect();
        const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
        const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
        logo.style.setProperty("--parallax-x", `${Math.max(-4, Math.min(4, dx * 0.5))}px`);
        logo.style.setProperty("--parallax-y", `${Math.max(-4, Math.min(4, dy * 0.5))}px`);
      });
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      logo.style.removeProperty("--parallax-x");
      logo.style.removeProperty("--parallax-y");
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.documentElement.addEventListener("mouseleave", reset);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.documentElement.removeEventListener("mouseleave", reset);
      window.removeEventListener("blur", reset);
      reset();
    };
  }, [finePointer, reducedMotion]);

  return (
    <div className={classes.artwork} aria-hidden>
      <div ref={logoRef} className={classes.characters}>
        <Image
          className={classes.logoBackground}
          src="/logo_background.webp"
          width={1200}
          height={735}
          alt=""
          fetchPriority="high"
        />
        <Image
          className={classes.logoForeground}
          src="/logo_foreground.webp"
          width={1200}
          height={735}
          alt=""
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
