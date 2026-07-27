import { describe, expect, it } from "vitest";
import { errorMessage, hasErrorMessage } from "./errors";

describe("error utilities", () => {
  it("extracts a stable message from unknown thrown values", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain failure")).toBe("plain failure");
    expect(errorMessage({ code: 500 })).toBe("Unknown error");
  });

  it("matches only Error instances with the requested message", () => {
    expect(hasErrorMessage(new Error("not found"), "not found")).toBe(true);
    expect(hasErrorMessage("not found", "not found")).toBe(false);
  });
});
