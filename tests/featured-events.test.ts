import { describe, it, expect } from "vitest";
import { validateFeatured } from "../src/features/featured-events/policy";
import {
  featuredWhen,
  type FeaturedEvent,
} from "../src/features/featured-events/types";
const input = {
  title: "Showcase",
  description: "Bring shoes",
  date: "2026-12-12",
  time: "18:30",
  location: "Rudder",
  link: "https://example.com",
};
describe("featured event validation", () => {
  it("accepts custom all-day or Central-time events and canonical links", () => {
    expect(validateFeatured(input)).toMatchObject({
      title: "Showcase",
      time: "18:30",
      link: "https://example.com/",
    });
    expect(validateFeatured({ ...input, time: "", link: "" }).time).toBeNull();
    expect(
      featuredWhen({
        event_date: input.date,
        start_time: "18:30:00",
      } as FeaturedEvent),
    ).toContain("6:30 PM Central");
    expect(
      featuredWhen({
        event_date: input.date,
        start_time: null,
      } as FeaturedEvent),
    ).toContain("All day");
  });
  it("rejects impossible dates/times and unsafe links before a write", () => {
    for (const date of ["2026-02-30", "infinity", "1999-12-31", "2101-01-01"])
      expect(() => validateFeatured({ ...input, date })).toThrow();
    for (const time of ["24:00", "12:60", "1:00"])
      expect(() => validateFeatured({ ...input, time })).toThrow();
    for (const link of [
      "javascript:alert(1)",
      "https://user:secret@example.com",
      "https://example.com\\evil",
      "https://example.com/space here",
    ])
      expect(() => validateFeatured({ ...input, link })).toThrow();
  });
});
