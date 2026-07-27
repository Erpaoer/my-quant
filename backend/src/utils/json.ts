import type { Prisma } from "@prisma/client";

export function jsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
