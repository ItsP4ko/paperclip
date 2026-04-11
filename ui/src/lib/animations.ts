/**
 * Reusable GSAP animation presets for Paperclip UI.
 *
 * Usage:
 *   gsap.from(el, presets.fadeUp);
 *   gsap.from(els, { ...presets.staggerFadeUp, stagger: 0.06 });
 */

export const presets = {
  /** Fade in + slide up 20px */
  fadeUp: {
    y: 20,
    opacity: 0,
    duration: 0.5,
    ease: "power2.out",
  },

  /** Fade in + slide down 20px */
  fadeDown: {
    y: -20,
    opacity: 0,
    duration: 0.5,
    ease: "power2.out",
  },

  /** Fade in + slide from left */
  fadeLeft: {
    x: -20,
    opacity: 0,
    duration: 0.5,
    ease: "power2.out",
  },

  /** Fade in + slide from right */
  fadeRight: {
    x: 20,
    opacity: 0,
    duration: 0.5,
    ease: "power2.out",
  },

  /** Scale in from 0.95 */
  scaleIn: {
    scale: 0.95,
    opacity: 0,
    duration: 0.4,
    ease: "back.out(1.4)",
  },

  /** Staggered children fade up — spread across a list */
  staggerFadeUp: {
    y: 14,
    opacity: 0,
    duration: 0.4,
    ease: "power2.out",
    stagger: 0.06,
  },

  /** Neon glow pulse for cyberpunk cards (dark mode) */
  neonPulse: {
    boxShadow: "0 0 35px rgba(74,222,128,1), 0 0 60px rgba(74,222,128,0.4)",
    duration: 0.8,
    ease: "power1.inOut",
    yoyo: true,
    repeat: -1,
  },
} as const;
