import { useEffect, useRef } from "react";
import Lenis from "lenis";

interface UseLenisOptions {
  /** Scroll wrapper element — defaults to `document.documentElement` */
  wrapper?: HTMLElement | null;
  /** Content element inside the wrapper */
  content?: HTMLElement | null;
  /** Smoothness multiplier (default 0.08) */
  lerp?: number;
  /** Enable/disable (default true) */
  enabled?: boolean;
}

/**
 * Smooth-scroll hook powered by Lenis.
 *
 * Attach to a scrollable container:
 *   const ref = useRef<HTMLDivElement>(null);
 *   useLenis({ wrapper: ref.current });
 *
 * Or call without args for whole-page smooth scroll.
 */
export function useLenis(opts: UseLenisOptions = {}) {
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    if (opts.enabled === false) return;

    // respect prefers-reduced-motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: opts.lerp ?? 0.08,
      wrapper: opts.wrapper ?? undefined,
      content: opts.content ?? undefined,
    });
    lenisRef.current = lenis;

    let raf: number;
    function tick(time: number) {
      lenis.raf(time);
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [opts.wrapper, opts.content, opts.lerp, opts.enabled]);

  return lenisRef;
}
