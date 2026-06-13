"use client";

import { useEffect } from "react";

// Registers the push service worker once, on mount, for signed-in admins.
// Renders nothing. Registration is idempotent — the browser no-ops if /sw.js
// is already registered and unchanged. Subscribing to push (permission prompt)
// happens separately, in Settings, on an explicit user action.
export function RegisterServiceWorker() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Non-fatal: the portal works fine without push; just log for debugging.
      console.error("Service worker registration failed:", err);
    });
  }, []);

  return null;
}
