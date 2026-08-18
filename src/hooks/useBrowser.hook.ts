"use client";

import { useEffect, useState } from "react";

export type BrowserName =
  | "chrome"
  | "firefox"
  | "safari"
  | "edge"
  | "ie"
  | "unknown";

function detectBrowserFromUA(userAgent: string): BrowserName {
  if (userAgent.includes("Chrome") && !userAgent.includes("Edge")) {
    return "chrome";
  } else if (userAgent.includes("Firefox")) {
    return "firefox";
  } else if (userAgent.includes("Safari") && !userAgent.includes("Chrome")) {
    return "safari";
  } else if (userAgent.includes("Edge")) {
    return "edge";
  } else if (userAgent.includes("MSIE") || userAgent.includes("Trident")) {
    return "ie";
  }
  return "unknown";
}

interface UseBrowserReturn {
  isChrome: boolean;
  isFirefox: boolean;
  isSafari: boolean;
  isEdge: boolean;
  isIe: boolean;
  isUnknown: boolean;
}

export function useBrowser(): UseBrowserReturn {
  const [browser, setBrowser] = useState<BrowserName>("unknown");

  useEffect(() => {
    if (typeof navigator === "undefined") {
      setBrowser("unknown");
      return;
    }

    try {
      setBrowser(detectBrowserFromUA(navigator.userAgent));
    } catch {
      setBrowser("unknown");
    }
  }, []);

  return {
    isChrome: browser === "chrome",
    isFirefox: browser === "firefox",
    isSafari: browser === "safari",
    isEdge: browser === "edge",
    isIe: browser === "ie",
    isUnknown: browser === "unknown",
  };
}

export default useBrowser;
