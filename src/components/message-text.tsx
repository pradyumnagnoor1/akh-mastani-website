import { messageParts } from "@/features/communication/links";

export function MessageText({ text }: { text: string }) {
  return messageParts(text).map((part, index) =>
    part.href ? (
      <a
        key={index}
        className="message-link"
        href={part.href}
        target="_blank"
        rel="noopener noreferrer"
      >
        {part.text}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ) : (
      part.text
    ),
  );
}
