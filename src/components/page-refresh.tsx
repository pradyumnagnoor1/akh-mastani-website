"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";

export function PageRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const [message, setMessage] = useState("");
  const busy = useRef(false);

  useEffect(() => {
    busy.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4_000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    let lastRefresh = Date.now();
    let gesture: { x: number; y: number; distance: number } | null = null;
    const dirty = new Set<HTMLFormElement>();
    const editing = () => {
      for (const form of dirty) if (!form.isConnected) dirty.delete(form);
      return (
        dirty.size > 0 ||
        !!document.querySelector('dialog[open], [data-refresh-busy="true"]') ||
        document.activeElement?.matches(
          'input, textarea, select, [contenteditable="true"]',
        )
      );
    };
    const refresh = (manual = false) => {
      if (
        busy.current ||
        !navigator.onLine ||
        document.visibilityState !== "visible"
      )
        return;
      if (editing()) {
        if (manual)
          setMessage("Finish or reset your changes before refreshing.");
        return;
      }
      if (!manual && Date.now() - lastRefresh < 5_000) return;
      lastRefresh = Date.now();
      busy.current = true;
      setMessage("");
      startTransition(() => router.refresh());
    };
    const change = (event: Event) => {
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        if (target.form && target.form.method !== "get") dirty.add(target.form);
      }
    };
    const reset = (event: Event) => {
      if (event.target instanceof HTMLFormElement) dirty.delete(event.target);
    };
    const resume = () => refresh();
    const start = (event: TouchEvent) => {
      gesture = null;
      if (event.touches.length !== 1 || window.scrollY > 0 || busy.current)
        return;
      const target = event.target;
      if (
        !(target instanceof Element) ||
        target.closest(
          "button, a, input, textarea, select, iframe, dialog, [contenteditable], .sidebar",
        )
      )
        return;
      // Let independently scrolling panels keep their own touch gestures.
      for (
        let node: Element | null = target;
        node && node !== document.body;
        node = node.parentElement
      ) {
        const style = getComputedStyle(node);
        if (
          /(auto|scroll)/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight
        )
          return;
      }
      gesture = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
        distance: 0,
      };
      setMessage("");
    };
    const move = (event: TouchEvent) => {
      if (!gesture) return;
      const touch = event.touches[0];
      if (event.touches.length !== 1 || !touch) {
        gesture = null;
        setPull(0);
        return;
      }
      const y = touch.clientY - gesture.y;
      if (Math.abs(touch.clientX - gesture.x) > Math.max(12, y) || y < 0) {
        gesture = null;
        setPull(0);
        return;
      }
      if (y > 10) {
        if (event.cancelable) event.preventDefault();
        gesture.distance = Math.min(y * 0.5, 90);
        setPull(gesture.distance);
      }
    };
    const end = () => {
      if (gesture && gesture.distance >= 60) refresh(true);
      gesture = null;
      setPull(0);
    };
    const cancel = () => {
      gesture = null;
      setPull(0);
    };
    const timer = window.setInterval(resume, 30_000);
    window.addEventListener("focus", resume);
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    document.addEventListener("input", change);
    document.addEventListener("change", change);
    document.addEventListener("reset", reset);
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchmove", move, { passive: false });
    document.addEventListener("touchend", end);
    document.addEventListener("touchcancel", cancel);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", resume);
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
      document.removeEventListener("input", change);
      document.removeEventListener("change", change);
      document.removeEventListener("reset", reset);
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  }, [pathname, router]);

  return (
    <>
      {(pull > 0 || pending) && (
        <div
          className="page-refresh-indicator"
          role="status"
          aria-label={
            pending
              ? "Refreshing page"
              : pull >= 60
                ? "Release to refresh"
                : "Pull to refresh"
          }
          style={{ transform: `translate(-50%, ${pending ? 24 : pull}px)` }}
        >
          <RotateCw
            size={22}
            className={pending ? "page-refresh-spin" : undefined}
            style={
              pending ? undefined : { transform: `rotate(${pull * 4}deg)` }
            }
            aria-hidden="true"
          />
        </div>
      )}
      {message && !pending && (
        <div className="page-refresh-message" role="status">
          {message}
        </div>
      )}
    </>
  );
}
