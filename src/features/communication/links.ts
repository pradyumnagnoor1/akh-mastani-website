export type MessagePart = { text: string; href?: string };

/** Parse plain text only; never interpret user content as HTML. */
export function messageParts(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  const urls = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
  let offset = 0;
  for (const match of text.matchAll(urls)) {
    let label = match[0].replace(/[.,!?;:]+$/, "");
    // Keep balanced parentheses in URLs, but leave surrounding prose outside.
    for (const [open, close] of [
      ["(", ")"],
      ["[", "]"],
      ["{", "}"],
    ]) {
      while (
        label.endsWith(close) &&
        label.split(close).length > label.split(open).length
      )
        label = label.slice(0, -1);
    }
    label = label.replace(/[.,!?;:]+$/, "");
    const href = /^www\./i.test(label) ? `https://${label}` : label;
    try {
      const url = new URL(href);
      if (!url.hostname || !["https:", "http:"].includes(url.protocol))
        continue;
    } catch {
      continue;
    }
    if (match.index > offset)
      parts.push({ text: text.slice(offset, match.index) });
    parts.push({ text: label, href });
    offset = match.index + label.length;
  }
  if (offset < text.length) parts.push({ text: text.slice(offset) });
  return parts;
}
