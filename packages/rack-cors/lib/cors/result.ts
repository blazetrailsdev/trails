import { Rack, type RackEnv } from "@blazetrails/rack";

export class Result {
  static readonly HEADER_KEY = "x-rack-cors";

  static readonly MISS_NO_ORIGIN = "no-origin";
  static readonly MISS_NO_PATH = "no-path";

  static readonly MISS_NO_METHOD = "no-method";
  static readonly MISS_DENY_METHOD = "deny-method";
  static readonly MISS_DENY_HEADER = "deny-header";

  preflight: boolean | null = null;
  hit: boolean | null = null;
  missReason: string | null = null;

  isHit(): boolean {
    return this.hit != null && this.hit !== false;
  }

  isPreflight(): boolean {
    return this.preflight != null && this.preflight !== false;
  }

  miss(reason: string | null): string | null {
    this.hit = false;
    return (this.missReason = reason);
  }

  static hit(env: RackEnv): Result {
    const r = new Result();
    r.preflight = false;
    r.hit = true;
    return (env[Rack.Cors!.ENV_KEY] = r);
  }

  static miss(env: RackEnv, reason: string | null): Result {
    const r = new Result();
    r.preflight = false;
    r.hit = false;
    r.missReason = reason;
    return (env[Rack.Cors!.ENV_KEY] = r);
  }

  static preflight(env: RackEnv): Result {
    const r = new Result();
    r.preflight = true;
    return (env[Rack.Cors!.ENV_KEY] = r);
  }

  appendHeader(headers: Record<string, unknown>): string {
    return (headers[Result.HEADER_KEY] = this.isHit()
      ? this.isPreflight()
        ? "preflight-hit"
        : "hit"
      : [this.isPreflight() ? "preflight-miss" : "miss", this.missReason].join("; "));
  }
}
