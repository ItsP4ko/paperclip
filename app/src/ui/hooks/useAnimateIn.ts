import { useRef } from "react";
import { gsap, useGSAP } from "@/ui/lib/gsap";
import { presets } from "@/ui/lib/animations";

type PresetName = keyof typeof presets;

interface UseAnimateInOptions {
  /** Preset name or custom gsap.from() vars */
  preset?: PresetName | gsap.TweenVars;
  /** Delay before animation starts (seconds) */
  delay?: number;
  /** Only animate once (default true) */
  once?: boolean;
}

/**
 * Animate an element into view when it mounts.
 *
 * Usage:
 *   const { scope } = useAnimateIn({ preset: "fadeUp" });
 *   return <div ref={scope}>...</div>;
 *
 * For staggered children:
 *   const { scope } = useAnimateIn({ preset: "staggerFadeUp" });
 *   return <div ref={scope}><Card /><Card /><Card /></div>;
 */
export function useAnimateIn(opts: UseAnimateInOptions = {}) {
  const scope = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!scope.current) return;

      // respect prefers-reduced-motion
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const vars =
        typeof opts.preset === "string"
          ? { ...presets[opts.preset] }
          : opts.preset ?? { ...presets.fadeUp };

      if (opts.delay) (vars as gsap.TweenVars).delay = opts.delay;

      // If the preset has stagger, animate direct children; otherwise animate the scope itself
      if ("stagger" in vars) {
        gsap.from(scope.current.children, vars);
      } else {
        gsap.from(scope.current, vars);
      }
    },
    { scope, dependencies: [] }
  );

  return { scope };
}
