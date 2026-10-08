export function validateFeatured(input: {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  link: string;
}) {
  const title = input.title.trim(),
    description = input.description.trim(),
    location = input.location.trim();
  if (!title || [...title].length > 160 || /[\u0000-\u001f\u007f]/.test(title))
    throw new Error("Enter a title of 1–160 characters.");
  if (
    [...description].length > 3000 ||
    [...location].length > 200 ||
    /[\u0000-\u001f\u007f]/.test(location)
  )
    throw new Error(
      "Use up to 3,000 characters for details and 200 for location.",
    );
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
    input.date < "2000-01-01" ||
    input.date > "2100-12-31" ||
    !Number.isFinite(Date.parse(input.date)) ||
    new Date(input.date).toISOString().slice(0, 10) !== input.date
  )
    throw new Error("Choose a valid event date.");
  if (input.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
    throw new Error(
      "Choose a valid time or leave it blank for an all-day event.",
    );
  let link = input.link.trim();
  if (link) {
    const url = new URL(link);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      /[\s\\]/.test(link) ||
      link.length > 2048
    )
      throw new Error("Use a valid http or https link.");
    link = url.href;
  }
  return {
    title,
    description,
    date: input.date,
    time: input.time || null,
    location,
    link,
  };
}
