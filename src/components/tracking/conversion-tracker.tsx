"use client";

import { useCallback } from "react";
import posthog from "posthog-js";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

interface ConversionEvent {
  event: string;
  value?: number;
  currency?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
}

export function useConversionTracker() {
  const trackConversion = useCallback((conv: ConversionEvent) => {
    // PostHog
    posthog.capture(conv.event, {
      value: conv.value,
      currency: conv.currency,
      order_id: conv.orderId,
      ...conv.metadata,
    });

    // Google Analytics gtag
    if (window.gtag) {
      window.gtag("event", conv.event, {
        value: conv.value ? conv.value / 100 : undefined,
        currency: conv.currency ?? "USD",
        transaction_id: conv.orderId,
        ...conv.metadata,
      });
    }
  }, []);

  return { trackConversion };
}
