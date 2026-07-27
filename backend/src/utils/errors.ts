export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function hasErrorMessage(error: unknown, message: string): boolean {
  return error instanceof Error && error.message === message;
}
