import { useEffect, useState } from "react";

type Breakpoint = "small" | "medium" | "large" | "xLarge" | "xxLarge";

const getBreakpoint = (width: number): Breakpoint => {
  if (width >= 2040) return "xxLarge";
  if (width >= 1450) return "xLarge";
  if (width >= 1025) return "large";
  if (width >= 820) return "medium";
  return "small";
};

interface UseResponsiveReturn {
  breakpoint: Breakpoint | null;
  isMobile: boolean;
  isTablet: boolean;
  isLaptop: boolean;
  isDesktop: boolean;
  isXLarge: boolean;
  isMounted: boolean;
  useBreakpoint: (width: number) => Breakpoint;
}

const useResponsive = (): UseResponsiveReturn => {
  const [breakpoint, setBreakpoint] = useState<Breakpoint | null>(() => {
    if (globalThis.window !== undefined) {
      return getBreakpoint(window.innerWidth);
    }
    return null;
  });

  const [isMounted, setIsMounted] = useState(false);

  const isMobile = breakpoint === "small";
  const isTablet =
    breakpoint === "medium" ||
    ["large", "xLarge", "xxLarge"].includes(breakpoint ?? "");
  const isLaptop = ["large", "xLarge", "xxLarge"].includes(breakpoint ?? "");
  const isDesktop = ["xLarge", "xxLarge"].includes(breakpoint ?? "");
  const isXLarge = breakpoint === "xxLarge";

  useEffect(() => {
    if (globalThis.window === undefined) return;

    const handleWindowResize = () => {
      setBreakpoint(getBreakpoint(window.innerWidth));
    };

    window.addEventListener("resize", handleWindowResize);
    handleWindowResize();
    setIsMounted(true);

    return () => {
      window.removeEventListener("resize", handleWindowResize);
    };
  }, []);

  const useBreakpoint = (width: number): Breakpoint => getBreakpoint(width);

  return {
    breakpoint,
    isMobile,
    isTablet,
    isLaptop,
    isDesktop,
    isXLarge,
    isMounted,
    useBreakpoint,
  };
};

export default useResponsive;
