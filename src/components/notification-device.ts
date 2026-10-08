/** Browser subscriptions alone are not evidence of server delivery consent. */
export function notificationDeviceEnabled(
  settings: { configured: boolean; deviceRegistered: boolean },
  hasBrowserSubscription: boolean,
  permission: NotificationPermission,
) {
  return (
    settings.configured &&
    settings.deviceRegistered &&
    hasBrowserSubscription &&
    permission === "granted"
  );
}

export async function stopDeviceNotifications(
  subscription: Pick<PushSubscription, "endpoint" | "unsubscribe">,
  unregister: (endpoint: string) => Promise<{ error?: string }>,
  onDeliveryStopped: () => void,
): Promise<{ removed: boolean; error?: string }> {
  const result = await unregister(subscription.endpoint);
  if (result.error) return { removed: false, error: result.error };
  onDeliveryStopped();
  try {
    if (await subscription.unsubscribe()) return { removed: true };
  } catch {
    // Server consent has already been removed; browser cleanup can be retried.
  }
  return {
    removed: false,
    error:
      "Delivery is disabled. Tap Disable notifications again to finish removing the browser subscription.",
  };
}
