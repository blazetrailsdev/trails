import { ArgumentError } from "@blazetrails/ruby-compat";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { FEATURE_POLICY } from "../constants.js";
import { _RequestCtor } from "./request-slot.js";

/** @internal */
const MAPPINGS: Record<string, string> = {
  self: "'self'",
  none: "'none'",
};

export type PolicySource = string | ((context: unknown) => string);

export class Middleware {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    const response = await this.app(env);
    const [, headers] = response;

    if (this.policyPresent(headers)) return response;

    const request = new _RequestCtor!(env) as {
      permissionsPolicy?: PermissionsPolicy | null;
      controllerInstance?: unknown;
    };

    const policy = request.permissionsPolicy;
    if (policy) {
      headers[FEATURE_POLICY] = policy.build(request.controllerInstance);
    }

    if (this.policyEmpty(policy)) {
      delete headers[FEATURE_POLICY];
    }

    return response;
  }

  private policyPresent(headers: Record<string, string | string[]>): boolean {
    return headers[FEATURE_POLICY] != null;
  }

  private policyEmpty(policy: PermissionsPolicy | null | undefined): boolean {
    return policy?.directives.size === 0;
  }
}

export class PermissionsPolicy {
  /** @internal */
  directives: Map<string, PolicySource[]> = new Map();

  constructor(block?: (policy: PermissionsPolicy) => void) {
    if (block) block(this);
  }

  accelerometer(...sources: Array<PolicySource | null | undefined>): void {
    this._set("accelerometer", sources);
  }
  ambientLightSensor(...sources: Array<PolicySource | null | undefined>): void {
    this._set("ambient-light-sensor", sources);
  }
  autoplay(...sources: Array<PolicySource | null | undefined>): void {
    this._set("autoplay", sources);
  }
  camera(...sources: Array<PolicySource | null | undefined>): void {
    this._set("camera", sources);
  }
  displayCapture(...sources: Array<PolicySource | null | undefined>): void {
    this._set("display-capture", sources);
  }
  encryptedMedia(...sources: Array<PolicySource | null | undefined>): void {
    this._set("encrypted-media", sources);
  }
  fullscreen(...sources: Array<PolicySource | null | undefined>): void {
    this._set("fullscreen", sources);
  }
  geolocation(...sources: Array<PolicySource | null | undefined>): void {
    this._set("geolocation", sources);
  }
  gyroscope(...sources: Array<PolicySource | null | undefined>): void {
    this._set("gyroscope", sources);
  }
  hid(...sources: Array<PolicySource | null | undefined>): void {
    this._set("hid", sources);
  }
  idleDetection(...sources: Array<PolicySource | null | undefined>): void {
    this._set("idle-detection", sources);
  }
  keyboardMap(...sources: Array<PolicySource | null | undefined>): void {
    this._set("keyboard-map", sources);
  }
  magnetometer(...sources: Array<PolicySource | null | undefined>): void {
    this._set("magnetometer", sources);
  }
  microphone(...sources: Array<PolicySource | null | undefined>): void {
    this._set("microphone", sources);
  }
  midi(...sources: Array<PolicySource | null | undefined>): void {
    this._set("midi", sources);
  }
  payment(...sources: Array<PolicySource | null | undefined>): void {
    this._set("payment", sources);
  }
  pictureInPicture(...sources: Array<PolicySource | null | undefined>): void {
    this._set("picture-in-picture", sources);
  }
  screenWakeLock(...sources: Array<PolicySource | null | undefined>): void {
    this._set("screen-wake-lock", sources);
  }
  serial(...sources: Array<PolicySource | null | undefined>): void {
    this._set("serial", sources);
  }
  syncXhr(...sources: Array<PolicySource | null | undefined>): void {
    this._set("sync-xhr", sources);
  }
  usb(...sources: Array<PolicySource | null | undefined>): void {
    this._set("usb", sources);
  }
  webShare(...sources: Array<PolicySource | null | undefined>): void {
    this._set("web-share", sources);
  }

  /** @internal */
  private _set(directive: string, sources: Array<PolicySource | null | undefined>): void {
    if (sources.length === 0 || sources[0] == null) {
      this.directives.delete(directive);
    } else {
      this.directives.set(directive, this.applyMappings(sources as PolicySource[]));
    }
  }

  /** @internal */
  initializeCopy(other: PermissionsPolicy): this {
    this.directives = new Map(Array.from(other.directives.entries()).map(([k, v]) => [k, [...v]]));
    return this;
  }

  build(context?: unknown): string {
    return this.buildDirectives(context)
      .filter((v): v is string => v !== null)
      .join("; ");
  }

  /** @internal */
  private applyMappings(sources: PolicySource[]): PolicySource[] {
    return sources.map((source) => this.applyMapping(source));
  }

  /** @internal */
  private applyMapping(source: PolicySource): PolicySource {
    if (typeof source === "function") return source;
    if (typeof source === "string") {
      if (Object.prototype.hasOwnProperty.call(MAPPINGS, source)) {
        return MAPPINGS[source];
      }
      return source;
    }
    throw new ArgumentError(`Invalid HTTP permissions policy source: ${JSON.stringify(source)}`);
  }

  /** @internal */
  private buildDirectives(context?: unknown): Array<string | null> {
    const result: Array<string | null> = [];
    for (const [directive, sources] of this.directives) {
      if (Array.isArray(sources)) {
        result.push(`${directive} ${this.buildDirective(sources, context).join(" ")}`);
      } else if (sources) {
        result.push(directive);
      } else {
        result.push(null);
      }
    }
    return result;
  }

  /** @internal */
  private buildDirective(sources: PolicySource[], context?: unknown): string[] {
    return sources.map((source) => this.resolveSource(source, context));
  }

  /** @internal */
  private resolveSource(source: PolicySource, context?: unknown): string {
    if (typeof source === "string") return source;
    if (typeof source === "function") {
      if (context == null) {
        throw new Error(`Missing context for the dynamic permissions policy source: ${source}`);
      }
      return source(context);
    }
    throw new Error(`Unexpected permissions policy source: ${JSON.stringify(source)}`);
  }
}
