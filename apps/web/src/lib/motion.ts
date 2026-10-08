import type { Transition, Variants } from "motion/react";

/** Shared motion presets so every screen moves the same way. */
export const spring: Transition = { type: "spring", stiffness: 380, damping: 32, mass: 0.8 };
export const easeOut: Transition = { duration: 0.35, ease: [0.22, 1, 0.36, 1] };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: easeOut },
};

export const stagger = (delay = 0.05): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: delay } },
});

/** Wizard steps slide in the direction of travel. */
export const slide: Variants = {
  enter: (dir: number) => ({ x: dir > 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: easeOut },
  exit: (dir: number) => ({ x: dir > 0 ? -48 : 48, opacity: 0, transition: { duration: 0.2 } }),
};
