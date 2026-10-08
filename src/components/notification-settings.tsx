"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import {
  getPushSettings,
  subscribePush,
  unsubscribePush,
} from "@/features/notifications/actions";

import {
  notificationDeviceEnabled,
  stopDeviceNotifications,
} from "./notification-device";

type State = "loading" | "ready" | "unsupported" | "install" | "denied";
function applicationKey(value: string) {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(
    atob(padded.replace(/-/g, "+").replace(/_/g, "/")),
    (c) => c.charCodeAt(0),
  );
}

async function readyWorker() {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error("Notifications couldn’t start. Refresh and try again."),
            ),
          10000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function NotificationSettings() {
  const [state, setState] = useState<State>("loading");
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<PushSubscription | null>(
    null,
  );
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const standalone =
        matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      const appleMobile =
        /iPhone|iPad|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      setInstalled(standalone);
      setIos(appleMobile);
      if (appleMobile && !standalone) {
        setState("install");
        return;
      }
      if (
        !window.isSecureContext ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setState("unsupported");
        return;
      }
      try {
        const settings = await getPushSettings();
        await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        const registration = await readyWorker();
        const existing = await registration.pushManager.getSubscription();
        if (!active) return;
        setKey(settings.configured ? settings.publicKey : null);
        setLoaded(true);
        setSubscription(existing);
        setState(Notification.permission === "denied" ? "denied" : "ready");
        setEnabled(
          notificationDeviceEnabled(
            settings,
            Boolean(existing),
            Notification.permission,
          ),
        );
      } catch {
        if (active) {
          setState("ready");
          setError(
            "Unable to load notification settings. Refresh to try again.",
          );
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    if (!key || busy) return;
    setBusy(true);
    setError("");
    try {
      // Permission is requested directly from this button gesture.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        if (permission === "denied") setState("denied");
        return;
      }
      const registration = await readyWorker();
      const next =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey(key),
        }));
      setSubscription(next);
      const result = await subscribePush(next.toJSON());
      if (result.error) throw new Error(result.error);
      setEnabled(true);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to enable notifications. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscription || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await stopDeviceNotifications(
        subscription,
        unsubscribePush,
        () => setEnabled(false),
      );
      if (result.error) setError(result.error);
      if (result.removed) setSubscription(null);
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to disable notifications. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel notification-settings"
      aria-labelledby="notification-heading"
    >
      <div className="panel-title">
        <Bell size={20} />
        <h2 id="notification-heading">Notifications</h2>
      </div>
      <p className="muted small">
        Get announcements, your to-dos, payment updates and practices on this
        device.
      </p>
      {!installed && (
        <p className="muted small">
          {ios
            ? "In Safari, tap Share → Add to Home Screen, then open Mastani to enable notifications."
            : "Add Mastani to your home screen using your browser’s install menu."}
        </p>
      )}
      <div aria-live="polite">
        {state === "loading" && (
          <p className="muted small">Loading settings…</p>
        )}
        {state === "unsupported" && (
          <p className="muted small">
            Notifications aren’t supported in this browser. You can still use
            the team hub.
          </p>
        )}
        {state === "denied" && (
          <p className="muted small">
            Notifications are blocked. Allow them in your browser or device
            settings to enable updates.
          </p>
        )}
        {state === "ready" && loaded && !key && (
          <p className="muted small">
            Notifications aren’t configured yet. You can still use the team hub.
          </p>
        )}
        {enabled && <p className="small">Enabled on this device.</p>}
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
      </div>
      {subscription ? (
        <button className="button secondary" disabled={busy} onClick={disable}>
          {busy ? "Updating…" : "Disable notifications"}
        </button>
      ) : null}
      {!enabled && state === "ready" && key && (
        <button className="button primary" disabled={busy} onClick={enable}>
          {busy ? "Enabling…" : "Enable notifications"}
        </button>
      )}
    </section>
  );
}
