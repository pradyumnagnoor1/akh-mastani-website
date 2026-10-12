const zone = "America/Chicago";
export function reminderFields(at?: string | null) {
  if (!at) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
export function chicagoReminderTime(date: string, time: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
    date < "2000-01-01" ||
    date > "2100-12-31"
  )
    throw new Error("Choose a reminder date and time in Texas time.");
  const nominal = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(nominal))
    throw new Error("Choose a valid reminder date.");
  const candidates = [5, 6]
    .map((hours) => new Date(nominal + hours * 3600_000))
    .filter((d) => {
      const fields = reminderFields(d.toISOString());
      return fields.date === date && fields.time === time;
    });
  if (candidates.length !== 1)
    throw new Error(
      "That time is skipped or repeated by daylight saving. Choose another reminder time.",
    );
  return candidates[0].toISOString();
}
export function validateAnnouncementReminder(form: FormData) {
  if (form.get("reminder_enabled") !== "true")
    return {
      reminder_time: null,
      reminder_type: null,
      reminder_text: "",
      linked_task: null,
    };
  const mode = String(form.get("reminder_mode") ?? "");
  if (!["acknowledgment", "preparation", "linked-task"].includes(mode))
    throw new Error("Choose a reminder stop condition.");
  const text = String(form.get("reminder_message") ?? "").trim();
  if ([...text].length > 200 || /[\u0000-\u001f\u007f]/.test(text))
    throw new Error("Use a reminder message of up to 200 characters.");
  const task =
    mode === "linked-task" ? String(form.get("reminder_task_id") ?? "") : null;
  if (
    (task &&
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        task,
      )) ||
    (mode === "linked-task" && !task)
  )
    throw new Error("Choose a linked task.");
  return {
    reminder_time: chicagoReminderTime(
      String(form.get("reminder_date") ?? ""),
      String(form.get("reminder_time") ?? ""),
    ),
    reminder_type: mode,
    reminder_text: text,
    linked_task: task,
  };
}
