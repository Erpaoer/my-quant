import { describe, expect, it } from "vitest";
import { jsonObject } from "./json";

describe("jsonObject", () => {
  it("preserves plain JSON objects and rejects non-object JSON values", () => {
    expect(jsonObject({ progress: 0.5 })).toEqual({ progress: 0.5 });
    expect(jsonObject(null)).toEqual({});
    expect(jsonObject(["not", "an", "object"])).toEqual({});
    expect(jsonObject("text")).toEqual({});
  });
});
