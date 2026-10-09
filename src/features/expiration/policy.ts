export function expirationDate(expiresAt?: string | null) {
  if (!expiresAt) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.parse(expiresAt) - 1));
}
export function validateExpiration(value: string) {
  if (!value) return null;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value ||
    value < today ||
    value > "2100-12-31"
  )
    throw new Error("Choose an expiration date today or later.");
  return value;
}
