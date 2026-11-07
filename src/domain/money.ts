const MAX_PAISE = 999_999_999_999;

export function parseInrToPaise(value: string): number | null {
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const rupees = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const paise = rupees * 100 + Number(fraction);
  if (!Number.isSafeInteger(paise) || paise < 0 || paise > MAX_PAISE) return null;
  return paise;
}

export function paiseToInr(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0 || paise > MAX_PAISE) {
    throw new RangeError('INR amount is out of range');
  }
  const rupees = Math.floor(paise / 100);
  const fraction = paise % 100;
  return `${rupees}.${String(fraction).padStart(2, '0')}`;
}
