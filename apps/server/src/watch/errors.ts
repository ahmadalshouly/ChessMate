/** An error the watch API returns to the client with an HTTP status. */
export class WatchError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

/** Throws a validation error (a function declaration, so TypeScript narrows after it). */
export function fail(r: { error: string; field?: string }): never {
  throw new WatchError(400, r.error, r.field);
}
