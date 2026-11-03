// Numbers and times written the way OpenChamber's own Usage section writes
// them, in the language of the section's texts (`messages.locale`), so a date
// never comes out in another language than the sentence around it.

export const formatPercent = (value) => `${Math.round(value)}%`;

const sameDay = (a, b) => a.toDateString() === b.toDateString();

export const formatTime = (ms, messages) => new Date(ms).toLocaleTimeString(messages.locale, { hour: 'numeric', minute: '2-digit' });

const weekdayTime = (ms, messages) => new Date(ms).toLocaleString(messages.locale, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Reset label as in the Usage section: the time today, else weekday, date and time. */
export const formatReset = (ms, now, messages) => {
  const date = new Date(ms);
  if (sameDay(date, new Date(now))) return formatTime(ms, messages);
  return date.toLocaleString(messages.locale, { month: 'short', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit' });
};

/** A moment within the coming week: "heute, 16:48", "morgen, 9:00", "Sa., 16:48". */
export const formatMoment = (ms, now, messages) => {
  const date = new Date(ms);
  const today = new Date(now);
  if (sameDay(date, today)) return `${messages.today}, ${formatTime(ms, messages)}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(date, tomorrow)) return `${messages.tomorrow}, ${formatTime(ms, messages)}`;
  return weekdayTime(ms, messages);
};

/** When a reading was taken: the time today, else weekday and time. */
export const formatStamp = (ms, now, messages) => (
  sameDay(new Date(ms), new Date(now)) ? formatTime(ms, messages) : weekdayTime(ms, messages)
);

/** Whole hours, at least one, for "1 Tag 10 Std.". */
export const formatDuration = (ms, messages) => messages.duration(Math.max(1, Math.round(ms / 3_600_000)));
