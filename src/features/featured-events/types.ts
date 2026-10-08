export type FeaturedEvent = {
  id: string;
  title: string;
  description: string;
  event_date: string;
  start_time: string | null;
  location: string;
  event_link: string;
  version: number;
  deleted_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
export function featuredWhen(event: FeaturedEvent) {
  const day = new Intl.DateTimeFormat("en-US", {
    dateStyle: "full",
    timeZone: "UTC",
  }).format(new Date(`${event.event_date}T12:00:00Z`));
  if (!event.start_time) return `${day} · All day`;
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(`2000-01-01T${event.start_time}Z`));
  return `${day} · ${time} Central`;
}
