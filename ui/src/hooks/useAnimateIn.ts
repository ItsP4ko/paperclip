import { useCallback, useRef } from "react";
import { gsap } from "@/lib/gsap";
import { presets } from "@/lib/animations";

type PresetName = keyof typeof presets;

interface UseAnimateInOptions {
  /** Preset name or custom gsap.from() vars */
  preset?: PresetName | gsap.TweenVars;
  /** Delay before animation starts (seconds) */
  delay?: number;
}

/**
 * Animate an element into view when it mounts.
 * Uses a callback ref so it works with conditional rendering (loading states).
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
  const animated = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const scope = useCallback((node: HTMLDivElement | null) => {
    if (!node || animated.current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    animated.current = true;

    const o = optsRef.current;
    const vars =
      typeof o.preset === "string"
        ? { ...presets[o.preset] }
        : o.preset ?? { ...presets.fadeUp };

    if (o.delay) (vars as gsap.TweenVars).delay = o.delay;

    if ("stagger" in vars) {
      gsap.from(node.children, vars);
    } else {
      gsap.from(node, vars);
    }
  }, []);

  return { scope };
}
