"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

/**
 * Identifies the signed-in admin user with PostHog so admin browsing
 * events land on the staff Person directly — rather than back-stitching
 * onto a customer Person via a test purchase (the pattern that briefly
 * stitched Greg's admin browsing onto his M1 test order during the
 * 2026-06-03 spike).
 *
 * Mount only inside the admin layout so customers visiting marketing
 * pages remain anonymous to PostHog until they identify via the
 * Shopify Custom Pixel.
 */
export function PosthogAdminIdentify({ email }: { email: string }) {
  useEffect(() => {
    if (!email) return;
    posthog.identify(
      email,
      { is_admin: true, admin_last_seen_at: new Date().toISOString() },
      { admin_first_seen_at: new Date().toISOString() },
    );
  }, [email]);
  return null;
}
