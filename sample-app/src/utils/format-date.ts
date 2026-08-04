const PAD = 2;

export function formatDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(PAD, '0');
  const day = String(date.getDate()).padStart(PAD, '0');
  return `${year}-${month}-${day}`;
}

export function isSameDay(left: Date, right: Date): boolean {
  return formatDate(left) === formatDate(right);
}
