export const VERSION = "3.2.0";
export const RELEASE = VERSION;

export function release(): string {
  return VERSION;
}

/** The Rack environment — a Record of CGI-like headers plus rack.* keys. */
export type RackEnv = Record<string, unknown>;

/** A Rack response body: async iterable of string/Buffer chunks. */
export type RackBody = AsyncIterable<string | Uint8Array>;

/** The three-element Rack response tuple: [status, headers, body]. */
export type RackResponse = [number, Record<string, string>, RackBody];

/**
 * A Rack application: an async function from env to response.
 * Ruby Rack is synchronous (`call(env) -> [status, headers, body]`);
 * in TypeScript we make it async by default.
 */
export type RackApp = (env: RackEnv) => Promise<RackResponse>;

/**
 * A Rack middleware wraps an inner app.
 * Construct with an app (and options), then call as a RackApp.
 */
export interface RackMiddleware {
  call(env: RackEnv): Promise<RackResponse>;
}

/** Helper to create an async body from a single string. */
export async function* bodyFromString(str: string): RackBody {
  yield str;
}

/** Collect an async body into a single string. */
export async function bodyToString(body: RackBody): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of body) {
    chunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
  }
  return chunks.join("");
}
