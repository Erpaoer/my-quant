import type { Response } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  classifyUpstreamFailure,
  sendOperationalDataError,
  sendUpstreamDataError,
} from "./operational-data-errors";

function upstreamFailure(status: number) {
  return Object.assign(new Error("upstream failed"), {
    response: { status },
  });
}

function responseDouble() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    json,
    status,
    response: { status } as unknown as Response,
  };
}

function assertOperationalErrorDetailsRejectReservedFields(response: Response) {
  const successDetails = { source: "database", success: true };
  const codeDetails = { source: "database", code: "INTERNAL_ERROR" };
  const messageDetails = { source: "database", message: "spoofed" };
  const dataDetails = { source: "database", data: [] };

  // @ts-expect-error Operational error details must never include success.
  sendOperationalDataError(response, 502, "NO_DATA", "No data", successDetails);
  // @ts-expect-error Operational error details must never include code.
  sendOperationalDataError(response, 502, "NO_DATA", "No data", codeDetails);
  // @ts-expect-error Operational error details must never include message.
  sendOperationalDataError(response, 502, "NO_DATA", "No data", messageDetails);
  // @ts-expect-error Operational error details must never include data.
  sendOperationalDataError(response, 502, "NO_DATA", "No data", dataDetails);
}

describe("classifyUpstreamFailure", () => {
  it.each([
    [401, 503, "SOURCE_AUTH_FAILED", false],
    [403, 503, "SOURCE_AUTH_FAILED", false],
    [429, 503, "SOURCE_RATE_LIMITED", true],
    [500, 502, "SOURCE_UNREACHABLE", true],
  ])("maps upstream status %i", (upstreamStatus, status, code, retryable) => {
    expect(classifyUpstreamFailure(upstreamFailure(upstreamStatus))).toEqual({
      status,
      code,
      retryable,
      upstreamStatus,
    });
  });

  it("maps network failures without an upstream status", () => {
    expect(classifyUpstreamFailure(new Error("socket timeout"))).toEqual({
      status: 502,
      code: "SOURCE_UNREACHABLE",
      retryable: true,
    });
  });
});

describe("sendOperationalDataError", () => {
  it("sends the stable failure shape without a data property", () => {
    const { json, status, response } = responseDouble();

    sendOperationalDataError(
      response,
      502,
      "NO_DATA",
      "No usable market data was returned",
      { source: "database", retryable: false },
    );

    expect(status).toHaveBeenCalledWith(502);
    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "NO_DATA",
      message: "No usable market data was returned",
      source: "database",
      retryable: false,
    });
    expect(json.mock.calls[0][0]).not.toHaveProperty("data");
  });

  it("does not let coerced details override stable fields", () => {
    const { json, response } = responseDouble();
    const maliciousDetails = {
      source: "database",
      success: true,
      code: "INTERNAL_ERROR",
      message: "spoofed",
    } as unknown as Parameters<typeof sendOperationalDataError>[4];

    sendOperationalDataError(
      response,
      502,
      "NO_DATA",
      "No usable market data was returned",
      maliciousDetails,
    );

    expect(json).toHaveBeenCalledWith({
      source: "database",
      success: false,
      code: "NO_DATA",
      message: "No usable market data was returned",
    });
  });
});

describe("sendUpstreamDataError", () => {
  it("sends the classified failure with source details", () => {
    const { json, status, response } = responseDouble();

    sendUpstreamDataError(
      response,
      "binance",
      upstreamFailure(403),
      "Binance is unavailable",
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "SOURCE_AUTH_FAILED",
      message: "Binance is unavailable",
      source: "binance",
      retryable: false,
      upstreamStatus: 403,
    });
  });

  it("omits upstreamStatus for network failures", () => {
    const { json, response } = responseDouble();

    sendUpstreamDataError(
      response,
      "binance",
      new Error("socket timeout"),
      "Binance is unavailable",
    );

    expect(json).toHaveBeenCalledWith({
      success: false,
      code: "SOURCE_UNREACHABLE",
      message: "Binance is unavailable",
      source: "binance",
      retryable: true,
    });
  });
});
