export const ATTENDANCE_DAYS_LIMIT = 12;

export function parseAttendanceDays(value: string): number[] {
  const nums = value.split(",").map((part) => Number(part.trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 31);
  return [...new Set(nums)].sort((a, b) => a - b);
}

export function attendanceDaysToLegacy(value: string): string {
  const nums = parseAttendanceDays(value);
  if (!nums.length) return "";
  const odd = nums.filter((n) => n % 2 === 1).length;
  const even = nums.length - odd;
  return `${nums.length} days · ${odd} odd, ${even} even`;
}

function legacyToNumbers(value: string): string {
  if (/odd days/i.test(value)) return Array.from({ length: 12 }, (_, index) => 1 + index * 2).join(",");
  if (/even days/i.test(value)) return Array.from({ length: 12 }, (_, index) => 2 + index * 2).join(",");
  return "";
}

export function initAttendanceDays(value: string): string {
  if (parseAttendanceDays(value).length) return value;
  return legacyToNumbers(value);
}