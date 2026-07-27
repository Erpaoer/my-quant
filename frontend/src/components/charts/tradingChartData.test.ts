import { describe, expect, it } from "vitest";
import { formatAxisValue, generateCandlestickData } from "./tradingChartData";

describe("generateCandlestickData", () => {
  it("returns deterministic finite numeric OHLC values", () => {
    const points = generateCandlestickData(2, () => 0.5, 100_000);

    expect(points).toEqual([
      [40_000, 45_000, 45_025, 44_975, 45_000],
      [100_000, 45_000, 45_025, 44_975, 45_000],
    ]);
    expect(
      points.every((point) =>
        point.slice(1).every((value) => Number.isFinite(value)),
      ),
    ).toBe(true);
  });

  it("keeps OHLC values finite when the random source is invalid", () => {
    const points = generateCandlestickData(1, () => Number.NaN, 100_000);

    expect(points[0].slice(1).every((value) => Number.isFinite(value))).toBe(
      true,
    );
  });
});

describe("formatAxisValue", () => {
  it.each([
    [45_000.126, "45000.13"],
    ["45000.126", "45000.13"],
  ])("formats numeric input %p", (value, expected) => {
    expect(formatAxisValue(value)).toBe(expected);
  });

  it.each([
    ["not-a-number"],
    [""],
    [null],
    [undefined],
    [Number.POSITIVE_INFINITY],
  ])("returns a placeholder for invalid input %p", (value) => {
    expect(() => formatAxisValue(value)).not.toThrow();
    expect(formatAxisValue(value)).toBe("--");
  });
});
