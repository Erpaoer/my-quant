export type CandlestickPoint = [
  timestamp: number,
  open: number,
  high: number,
  low: number,
  close: number,
];

const normalizeRandomValue = (value: number) => {
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1, Math.max(0, value));
};

const roundPrice = (value: number) => Number(value.toFixed(2));

export function generateCandlestickData(
  count = 100,
  random = Math.random,
  now = Date.now(),
): CandlestickPoint[] {
  const data: CandlestickPoint[] = [];
  let basePrice = 45_000;
  const pointCount = Number.isFinite(count)
    ? Math.max(0, Math.floor(count))
    : 0;
  const timestamp = Number.isFinite(now) ? now : Date.now();
  const nextRandom = () => normalizeRandomValue(random());

  for (let i = pointCount - 1; i >= 0; i -= 1) {
    const time = timestamp - i * 60_000;
    const change = (nextRandom() - 0.5) * 0.002 * basePrice;

    basePrice += change;
    const high = basePrice + nextRandom() * 50;
    const low = basePrice - nextRandom() * 50;
    const open = basePrice + (nextRandom() - 0.5) * 20;

    data.push([
      time,
      roundPrice(open),
      roundPrice(high),
      roundPrice(low),
      roundPrice(basePrice),
    ]);
  }

  return data;
}

export function formatAxisValue(value: unknown): string {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(numericValue) ? numericValue.toFixed(2) : "--";
}
