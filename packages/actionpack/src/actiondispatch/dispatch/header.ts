/**
 * ActionDispatch::Http::Headers
 *
 * Provides a thin wrapper over the request environment hash, giving
 * case-insensitive access to HTTP headers. Headers can be accessed by
 * their HTTP name ("Content-Type") or their CGI env name ("CONTENT_TYPE"
 * or "HTTP_CONTENT_MD5").
 */

const CGI_VARIABLES = new Set([
  "AUTH_TYPE",
  "CONTENT_LENGTH",
  "CONTENT_TYPE",
  "GATEWAY_INTERFACE",
  "HTTPS",
  "PATH_INFO",
  "PATH_TRANSLATED",
  "QUERY_STRING",
  "REMOTE_ADDR",
  "REMOTE_HOST",
  "REMOTE_IDENT",
  "REMOTE_USER",
  "REQUEST_METHOD",
  "SCRIPT_NAME",
  "SERVER_NAME",
  "SERVER_PORT",
  "SERVER_PROTOCOL",
  "SERVER_SOFTWARE",
]);

function envName(key: string): string {
  const str = String(key);
  if (str.includes(".")) return str;
  if (CGI_VARIABLES.has(str) || str.startsWith("HTTP_")) return str;
  const upper = str.toUpperCase().replace(/-/g, "_");
  if (CGI_VARIABLES.has(upper)) return upper;
  if (upper.startsWith("HTTP_")) return upper;
  return "HTTP_" + upper;
}

export class Headers {
  private _env: Record<string, unknown>;

  constructor(env: Record<string, unknown>) {
    this._env = env;
  }

  get env(): Record<string, unknown> {
    return this._env;
  }

  get(key: string): unknown {
    return this._env[envName(String(key))];
  }

  set(key: string, value: unknown): void {
    this._env[envName(String(key))] = value;
  }

  has(key: string): boolean {
    return envName(String(key)) in this._env;
  }

  add(key: string, value: unknown): void {
    if (value == null) return;
    const envKey = envName(String(key));
    const strValue = String(value);
    const existing = this._env[envKey];
    if (existing != null) {
      this._env[envKey] = String(existing) + "," + strValue;
    } else {
      this._env[envKey] = strValue;
    }
  }

  fetch(key: string, ...args: unknown[]): unknown {
    const envKey = envName(String(key));
    if (envKey in this._env) return this._env[envKey];
    if (args.length > 0) {
      const fallback = args[0];
      if (typeof fallback === "function") return (fallback as () => unknown)();
      return fallback;
    }
    throw new Error(`key not found: "${key}"`);
  }

  each(fn: (pair: [string, unknown]) => void): void {
    for (const [key, value] of Object.entries(this._env)) {
      fn([key, value]);
    }
  }

  merge(other: Record<string, unknown>): Headers {
    const newEnv = { ...this._env };
    for (const [key, value] of Object.entries(other)) {
      newEnv[envName(String(key))] = value;
    }
    return new Headers(newEnv);
  }

  mergeInPlace(other: Record<string, unknown>): this {
    for (const [key, value] of Object.entries(other)) {
      this._env[envName(String(key))] = value;
    }
    return this;
  }
}
