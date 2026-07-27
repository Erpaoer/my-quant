import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({
  default: {
    config: () => ({ parsed: {} }),
  },
}));

const originalWindowMs = process.env.RATE_LIMIT_WINDOW_MS;
const originalMaxRequests = process.env.RATE_LIMIT_MAX_REQUESTS;

async function loadRateLimitConfig(
  windowMs: string | undefined,
  maxRequests: string | undefined,
) {
  if (windowMs === undefined) {
    delete process.env.RATE_LIMIT_WINDOW_MS;
  } else {
    process.env.RATE_LIMIT_WINDOW_MS = windowMs;
  }

  if (maxRequests === undefined) {
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
  } else {
    process.env.RATE_LIMIT_MAX_REQUESTS = maxRequests;
  }

  vi.resetModules();

  const { default: config } = await import("./index");
  return config;
}

afterEach(() => {
  if (originalWindowMs === undefined) {
    delete process.env.RATE_LIMIT_WINDOW_MS;
  } else {
    process.env.RATE_LIMIT_WINDOW_MS = originalWindowMs;
  }

  if (originalMaxRequests === undefined) {
    delete process.env.RATE_LIMIT_MAX_REQUESTS;
  } else {
    process.env.RATE_LIMIT_MAX_REQUESTS = originalMaxRequests;
  }

  vi.resetModules();
});

describe("rate limit environment configuration", () => {
  it("parses configured values into runtime numbers", async () => {
    const config = await loadRateLimitConfig("60000", "250");

    expect(config.RATE_LIMIT_WINDOW_MS).toBe(60000);
    expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(250);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["whitespace", "   "],
    ["non-numeric", "invalid"],
    ["non-finite", "Infinity"],
    ["zero", "0"],
    ["negative", "-1"],
    ["fractional", "1.5"],
  ])("falls back to defaults for %s values", async (_label, value) => {
    const config = await loadRateLimitConfig(value, value);

    expect(config.RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000);
    expect(config.RATE_LIMIT_MAX_REQUESTS).toBe(100);
  });
});
