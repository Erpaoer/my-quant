export function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  if (!value?.trim()) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallback;
}
