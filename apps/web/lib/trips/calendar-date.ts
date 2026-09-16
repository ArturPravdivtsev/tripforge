const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [
    31,
    leapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]!;
}

export function formatCalendarDate(value: string): string {
  const match = CALENDAR_DATE_PATTERN.exec(value);

  if (!match || !isCalendarDate(value)) {
    return value;
  }

  const month = Number(match[2]);

  return `${Number(match[3])} ${MONTH_NAMES[month - 1]} ${match[1]}`;
}

export function formatTripDates(
  startsOn: string | null,
  endsOn: string | null,
): string {
  if (startsOn && endsOn) {
    return `${formatCalendarDate(startsOn)} – ${formatCalendarDate(endsOn)}`;
  }

  if (startsOn) {
    return `From ${formatCalendarDate(startsOn)}`;
  }

  if (endsOn) {
    return `Until ${formatCalendarDate(endsOn)}`;
  }

  return "Dates not set";
}
