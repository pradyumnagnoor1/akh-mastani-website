import { describe, expect, it, vi } from "vitest";
import {
  notificationDeviceEnabled,
  stopDeviceNotifications,
} from "../src/components/notification-device";

describe("notification device delivery consent", () => {
  it.each(["false", "throws"])(
    "stays disabled after reload when browser unsubscribe %s",
    async (failure) => {
      let deviceRegistered = true;
      let enabled = true;
      const subscription = {
        endpoint: "https://push.example/device",
        unsubscribe: vi.fn(async () => {
          expect(deviceRegistered).toBe(false);
          expect(enabled).toBe(false);
          if (failure === "throws") throw new Error("Browser unavailable");
          return false;
        }),
      };
      const unregister = vi.fn(async () => {
        deviceRegistered = false;
        return {};
      });
      const result = await stopDeviceNotifications(
        subscription,
        unregister,
        () => {
          enabled = false;
        },
      );
      expect(result).toMatchObject({
        removed: false,
        error: expect.stringContaining("Delivery is disabled"),
      });
      expect(
        notificationDeviceEnabled(
          { configured: true, deviceRegistered },
          true,
          "granted",
        ),
      ).toBe(false);
      expect(unregister).toHaveBeenCalledExactlyOnceWith(subscription.endpoint);
    },
  );
  it("preserves enabled delivery and browser subscription when server removal fails", async () => {
    const unsubscribe = vi.fn(async () => true);
    const stopped = vi.fn();
    expect(
      await stopDeviceNotifications(
        { endpoint: "endpoint", unsubscribe },
        async () => ({ error: "Retry" }),
        stopped,
      ),
    ).toEqual({ removed: false, error: "Retry" });
    expect(stopped).not.toHaveBeenCalled();
    expect(unsubscribe).not.toHaveBeenCalled();
  });
  it("requires server ownership, supported configuration, browser subscription and permission", () => {
    expect(
      notificationDeviceEnabled(
        { configured: true, deviceRegistered: true },
        true,
        "granted",
      ),
    ).toBe(true);
    expect(
      notificationDeviceEnabled(
        { configured: true, deviceRegistered: false },
        true,
        "granted",
      ),
    ).toBe(false);
    expect(
      notificationDeviceEnabled(
        { configured: false, deviceRegistered: true },
        true,
        "granted",
      ),
    ).toBe(false);
    expect(
      notificationDeviceEnabled(
        { configured: true, deviceRegistered: true },
        false,
        "granted",
      ),
    ).toBe(false);
    expect(
      notificationDeviceEnabled(
        { configured: true, deviceRegistered: true },
        true,
        "denied",
      ),
    ).toBe(false);
  });
});
