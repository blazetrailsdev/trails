/**
 * ActionDispatch::RemoteIp
 *
 * Calculates the IP address of the remote client by inspecting REMOTE_ADDR,
 * HTTP_CLIENT_IP, and HTTP_X_FORWARDED_FOR, then discarding trusted proxies.
 *
 * Mirrors Rails actionpack/lib/action_dispatch/middleware/remote_ip.rb.
 */

import type { RackEnv, RackResponse } from "@blazetrails/rack";

type RackApp = (env: RackEnv) => Promise<RackResponse> | RackResponse;

export class IpSpoofAttackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IpSpoofAttackError";
  }
}

/** Default trusted proxy ranges, mirroring Rails RemoteIp::TRUSTED_PROXIES. */
export const TRUSTED_PROXIES: readonly string[] = [
  "127.0.0.0/8",
  "::1",
  "fc00::/7",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
];

export type Proxy = string | RegExp;

/**
 * What `RemoteIp` accepts as `custom_proxies`. Iterable of proxies, but
 * intentionally excludes bare `string` (which is technically `Iterable<string>`)
 * so `new RemoteIp(app, true, "10.0.0.0/8")` fails to type-check rather than
 * being silently spread into per-character entries. Rails treats String as
 * a single value and raises ArgumentError. The `length?: never` branch
 * shape excludes anything with a `length: number` (strings) while still
 * admitting generators and other non-indexed iterables. Custom iterables
 * that happen to expose `length: number` for unrelated reasons should
 * either pre-spread into an array or cast — runtime accepts any iterable
 * other than `string`/`String`.
 */
export type CustomProxies =
  | ReadonlyArray<Proxy>
  | ReadonlySet<Proxy>
  | (Iterable<Proxy> & { readonly length?: never });

interface ParsedIp {
  value: bigint;
  bits: 32 | 128;
}
interface ParsedCidr extends ParsedIp {
  prefix: number;
}

/** Parse an IPv4 or IPv6 address (no netmask). Returns null on invalid input. */
function parseIp(s: string): ParsedIp | null {
  if (!s || s.includes("/")) return null;
  if (s.includes(".") && !s.includes(":")) {
    const parts = s.split(".");
    if (parts.length !== 4) return null;
    let v = 0n;
    for (const p of parts) {
      if (!/^\d{1,3}$/.test(p)) return null;
      const n = Number(p);
      if (n > 255) return null;
      v = (v << 8n) | BigInt(n);
    }
    return { value: v, bits: 32 };
  }
  if (!s.includes(":")) return null;
  const dc = s.indexOf("::");
  let parts: string[];
  if (dc !== -1) {
    if (s.indexOf("::", dc + 1) !== -1) return null;
    const hParts = dc === 0 ? [] : s.slice(0, dc).split(":");
    const tParts = dc === s.length - 2 ? [] : s.slice(dc + 2).split(":");
    const missing = 8 - hParts.length - tParts.length;
    if (missing < 0) return null;
    parts = [...hParts, ...new Array<string>(missing).fill("0"), ...tParts];
  } else {
    parts = s.split(":");
  }
  if (parts.length !== 8) return null;
  let v = 0n;
  for (const p of parts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
    v = (v << 16n) | BigInt(parseInt(p, 16));
  }
  return { value: v, bits: 128 };
}

function parseCidr(s: string): ParsedCidr | null {
  const slash = s.indexOf("/");
  const ip = parseIp(slash === -1 ? s : s.slice(0, slash));
  if (!ip) return null;
  if (slash === -1) return { ...ip, prefix: ip.bits };
  const prefix = Number(s.slice(slash + 1));
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > ip.bits) return null;
  return { ...ip, prefix };
}

function cidrContains(cidr: ParsedCidr, ip: ParsedIp): boolean {
  if (cidr.bits !== ip.bits) return false;
  if (cidr.prefix === 0) return true;
  const shift = BigInt(cidr.bits - cidr.prefix);
  return cidr.value >> shift === ip.value >> shift;
}

function proxyMatches(proxy: Proxy, ipStr: string): boolean {
  if (proxy instanceof RegExp) return proxy.test(ipStr);
  const cidr = parseCidr(proxy);
  const ip = parseIp(ipStr);
  return !!cidr && !!ip && cidrContains(cidr, ip);
}

/** Lazy IP calculator. Stored in env["action_dispatch.remote_ip"] by RemoteIp. */
export class GetIp {
  private readonly env: RackEnv;
  private readonly checkIp: boolean;
  private readonly proxies: readonly Proxy[];
  private memoized: string | null | undefined;

  constructor(env: RackEnv, checkIp: boolean, proxies: readonly Proxy[]) {
    this.env = env;
    this.checkIp = checkIp;
    this.proxies = proxies;
  }

  toString(): string {
    return this.calculate() ?? "";
  }

  calculate(): string | null {
    if (this.memoized !== undefined) return this.memoized;
    this.memoized = this.calculateIp();
    return this.memoized;
  }

  private calculateIp(): string | null {
    const remoteAddrs = this.ipsFrom(this.env["REMOTE_ADDR"] as string | undefined);
    const remoteAddr = remoteAddrs[remoteAddrs.length - 1];
    const clientIps = this.ipsFrom(this.env["HTTP_CLIENT_IP"] as string | undefined).reverse();
    const forwardedIps = this.ipsFrom(
      this.env["HTTP_X_FORWARDED_FOR"] as string | undefined,
    ).reverse();

    const clientLast = clientIps[clientIps.length - 1];
    const forwardedLast = forwardedIps[forwardedIps.length - 1];
    if (this.checkIp && clientLast && forwardedLast && !forwardedIps.includes(clientLast)) {
      throw new IpSpoofAttackError(
        `IP spoofing attack?! ` +
          `HTTP_CLIENT_IP=${JSON.stringify(this.env["HTTP_CLIENT_IP"] ?? null)} ` +
          `HTTP_X_FORWARDED_FOR=${JSON.stringify(this.env["HTTP_X_FORWARDED_FOR"] ?? null)}`,
      );
    }

    const ips = [...forwardedIps, ...clientIps];
    const withRemote = remoteAddr ? [...ips, remoteAddr] : ips;
    const filtered = withRemote.filter((ip) => !this.proxies.some((p) => proxyMatches(p, ip)));
    return filtered[0] ?? ips[ips.length - 1] ?? remoteAddr ?? null;
  }

  private ipsFrom(header: string | undefined): string[] {
    if (!header) return [];
    return header
      .trim()
      .split(/[,\s]+/)
      .filter((ip) => !!ip && parseIp(ip) !== null);
  }
}

/**
 * RemoteIp middleware. Wires a GetIp instance into env so downstream
 * Request#remoteIp can resolve the calculated value lazily.
 */
export class RemoteIp {
  static readonly TRUSTED_PROXIES = TRUSTED_PROXIES;

  readonly checkIp: boolean;
  readonly proxies: readonly Proxy[];
  private readonly app: RackApp;

  constructor(app: RackApp, ipSpoofingCheck = true, customProxies?: CustomProxies | null) {
    this.app = app;
    this.checkIp = ipSpoofingCheck;
    // Rails: `if custom_proxies.blank?` then `elsif custom_proxies.respond_to?(:any?)`.
    // The TS analogue is "iterable but not a String" — Ruby `String` does not
    // include `Enumerable` and therefore doesn't respond to `:any?`, so a bare
    // CIDR like `"10.0.0.0/8"` must hit the "single value" raise, not be
    // spread into characters.
    //
    // `blank?` in Rails only fires on values that respond to `:empty?`. Arrays
    // and Sets do; Enumerators / generators do not. So an empty Array/Set
    // falls back to `TRUSTED_PROXIES`, but an empty generator is accepted as-is
    // (and trusts no proxies, matching Rails' behavior with an `Enumerator`).
    // Rails: ActiveSupport `blank?` is true for nil/false/empty/whitespace
    // strings/empty collections. Treat the scalar-blank cases (false, "",
    // whitespace) the same way before falling through to the iterable check.
    // The cast to `unknown` is deliberate — the static `CustomProxies` type
    // excludes strings/false, but callers can still hit this at runtime via
    // `as Iterable<Proxy>` casts (Rails users coming from Ruby configs).
    const raw = customProxies as unknown;
    const isBlankScalar =
      raw === false ||
      (typeof raw === "string" && raw.trim() === "") ||
      (raw instanceof String && String(raw).trim() === "");
    if (customProxies == null || isBlankScalar) {
      this.proxies = TRUSTED_PROXIES;
    } else if (
      typeof customProxies !== "string" &&
      !(customProxies instanceof String) &&
      Symbol.iterator in Object(customProxies)
    ) {
      const isEmptyCollection =
        (Array.isArray(customProxies) && customProxies.length === 0) ||
        (customProxies instanceof Set && customProxies.size === 0);
      this.proxies = isEmptyCollection ? TRUSTED_PROXIES : [...customProxies];
    } else {
      throw new TypeError(
        "Setting config.action_dispatch.trusted_proxies to a single value isn't supported. " +
          "Please set this to an enumerable instead.",
      );
    }
  }

  async call(env: RackEnv): Promise<RackResponse> {
    env["action_dispatch.remote_ip"] = new GetIp(env, this.checkIp, this.proxies);
    return await this.app(env);
  }
}
