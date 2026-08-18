"use client";

import { useLenis } from "lenis/react";
import { useCallback } from "react";

type EasingFunction = (t: number) => number;

const easeIn: EasingFunction = (t) => t * t;
const easeOut: EasingFunction = (t) => t * (2 - t);
const easeInOut: EasingFunction = (t) =>
  t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
const linear: EasingFunction = (t) => t;

const easingMap = {
  easeIn,
  easeOut,
  easeInOut,
  linear,
};

export const useLenisScrollTo = () => {
  const lenis = useLenis();

  const scrollToId = useCallback(
    (
      id: string,
      options?: {
        duration?: number;
        easing?: keyof typeof easingMap | EasingFunction;
        offset?: number;
      },
    ) => {
      const element = document.getElementById(id);
      if (element && lenis) {
        const rect = element.getBoundingClientRect();
        const scrollTop =
          window.pageYOffset || document.documentElement.scrollTop;
        const targetY = rect.top + scrollTop + (options?.offset ?? 0);

        let easing: EasingFunction = easingMap.easeInOut;

        if (typeof options?.easing === "function") {
          easing = options.easing;
        } else if (options?.easing && easingMap[options.easing]) {
          easing = easingMap[options.easing];
        }

        lenis.scrollTo(targetY, {
          duration: options?.duration ?? 0.5,
          easing,
        });
      }
    },
    [lenis],
  );

  return scrollToId;
};

export default useLenisScrollTo;
