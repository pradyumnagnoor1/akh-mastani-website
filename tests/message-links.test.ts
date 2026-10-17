import { describe, expect, it } from "vitest";
import { messageParts } from "../src/features/communication/links";

describe("message links", () => {
  it("keeps text, line breaks, queries and balanced URL parentheses intact", () => {
    const text =
      "See https://example.com/a_(dance)?x=1&y=2.\nThen (www.example.org/info).";
    const parts = messageParts(text);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual([
      "https://example.com/a_(dance)?x=1&y=2",
      "https://www.example.org/info",
    ]);
  });
  it("leaves unsafe schemes and malformed addresses as plain text", () => {
    const text = "javascript:alert(1) data:text/html,test https:// www.";
    expect(messageParts(text).some((p) => p.href)).toBe(false);
    expect(
      messageParts(text)
        .map((p) => p.text)
        .join(""),
    ).toBe(text);
  });
  it("preserves surrounding punctuation and multiple links", () => {
    const text = "[https://example.org/a], https://example.org/b!";
    const parts = messageParts(text);
    expect(parts.map((p) => p.text).join("")).toBe(text);
    expect(parts.filter((p) => p.href).map((p) => p.href)).toEqual([
      "https://example.org/a",
      "https://example.org/b",
    ]);
  });
});
