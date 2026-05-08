"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const UTM_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export function UtmCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const utmData: Record<string, string> = {};
    let hasUtm = false;

    for (const key of UTM_PARAMS) {
      const value = params.get(key);
      if (value) {
        utmData[key] = value;
        hasUtm = true;
      }
    }

    if (hasUtm) {
      localStorage.setItem("fitwell_utm", JSON.stringify(utmData));
      posthog.capture("utm_captured", utmData);
    }
  }, []);

  return null;
}
