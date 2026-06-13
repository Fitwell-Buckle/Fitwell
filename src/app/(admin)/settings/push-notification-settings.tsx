"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Convert the URL-safe base64 VAPID public key to the Uint8Array the
// PushManager expects as its applicationServerKey.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  // Back it with a concrete ArrayBuffer so the type is Uint8Array<ArrayBuffer>,
  // which satisfies PushManager's applicationServerKey (BufferSource).
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari exposes this non-standard flag for home-screen apps.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

type State = "loading" | "unsupported" | "ios-not-installed" | "off" | "on";

export function PushNotificationSettings() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  // Determine the current state on mount.
  useEffect(() => {
    let alive = true;
    (async () => {
      const supported =
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;
      if (!supported) {
        // On iOS, push is supported only once added to the home screen.
        if (alive) setState(isIos() && !isStandalone() ? "ios-not-installed" : "unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (alive) setState(sub ? "on" : "off");
    })().catch(() => {
      if (alive) setState("unsupported");
    });
    return () => {
      alive = false;
    };
  }, []);

  async function enable() {
    if (!VAPID_PUBLIC_KEY) {
      toast.error("Push isn't configured yet (VAPID keys missing).");
      return;
    }
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        toast.error("Notifications were blocked. Allow them in browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error(`Subscribe failed (${res.status})`);
      setState("on");
      toast.success("Notifications enabled on this device.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      toast.success("Notifications disabled on this device.");
    } catch {
      toast.error("Couldn't disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Test failed (${res.status})`);
      toast.success("Test sent — check your notifications.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send test.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return <p className="text-sm text-zinc-400">Checking this device…</p>;
  }

  if (state === "unsupported") {
    return (
      <p className="text-sm text-zinc-500">
        This browser doesn&apos;t support push notifications.
      </p>
    );
  }

  if (state === "ios-not-installed") {
    return (
      <div className="flex items-start gap-2 text-sm text-zinc-600">
        <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
        <span>
          To get notifications on iPhone, first add this app to your home screen:
          tap the <strong>Share</strong> button, then{" "}
          <strong>Add to Home Screen</strong>. Open it from there and come back
          to this page to enable notifications.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <>
          <Button variant="outline" onClick={disable} disabled={busy}>
            <BellOff className="h-4 w-4" /> Disable on this device
          </Button>
          <Button variant="outline" onClick={sendTest} disabled={busy}>
            <Send className="h-4 w-4" /> Send test notification
          </Button>
        </>
      ) : (
        <Button onClick={enable} disabled={busy}>
          <Bell className="h-4 w-4" /> Enable notifications on this device
        </Button>
      )}
    </div>
  );
}
