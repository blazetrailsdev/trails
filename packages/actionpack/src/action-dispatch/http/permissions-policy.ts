import { ArgumentError, hashDelete, rbFSend, rbInspect } from "@blazetrails/ruby-compat";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { FEATURE_POLICY } from "../constants.js";
import { ActionDispatch } from "../../namespaces.js";
import { deepDup } from "@blazetrails/activesupport";

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
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [, headers] = response;

    if (this.policyPresent(headers)) return response;

    const request = new ActionDispatch.Request(env) as {
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
    return policy != null && Object.keys(policy.directives).length === 0;
  }
}

export class PermissionsPolicy {
  /** @internal */
  directives: Record<string, PolicySource[]> = {};

  constructor(block?: (policy: PermissionsPolicy) => void) {
    if (block) block(this);
  }

  accelerometer(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["accelerometer"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "accelerometer");
    }
  }
  ambientLightSensor(
    ...sources: Array<PolicySource | false | null | undefined>
  ): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["ambient-light-sensor"] = this.applyMappings(
        sources as PolicySource[],
      ));
    } else {
      return hashDelete(this.directives, "ambient-light-sensor");
    }
  }
  autoplay(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["autoplay"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "autoplay");
    }
  }
  camera(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["camera"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "camera");
    }
  }
  displayCapture(
    ...sources: Array<PolicySource | false | null | undefined>
  ): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["display-capture"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "display-capture");
    }
  }
  encryptedMedia(
    ...sources: Array<PolicySource | false | null | undefined>
  ): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["encrypted-media"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "encrypted-media");
    }
  }
  fullscreen(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["fullscreen"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "fullscreen");
    }
  }
  geolocation(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["geolocation"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "geolocation");
    }
  }
  gyroscope(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["gyroscope"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "gyroscope");
    }
  }
  hid(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["hid"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "hid");
    }
  }
  idleDetection(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["idle-detection"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "idle-detection");
    }
  }
  keyboardMap(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["keyboard-map"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "keyboard-map");
    }
  }
  magnetometer(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["magnetometer"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "magnetometer");
    }
  }
  microphone(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["microphone"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "microphone");
    }
  }
  midi(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["midi"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "midi");
    }
  }
  payment(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["payment"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "payment");
    }
  }
  pictureInPicture(
    ...sources: Array<PolicySource | false | null | undefined>
  ): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["picture-in-picture"] = this.applyMappings(
        sources as PolicySource[],
      ));
    } else {
      return hashDelete(this.directives, "picture-in-picture");
    }
  }
  screenWakeLock(
    ...sources: Array<PolicySource | false | null | undefined>
  ): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["screen-wake-lock"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "screen-wake-lock");
    }
  }
  serial(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["serial"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "serial");
    }
  }
  syncXhr(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["sync-xhr"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "sync-xhr");
    }
  }
  usb(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["usb"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "usb");
    }
  }
  webShare(...sources: Array<PolicySource | false | null | undefined>): PolicySource[] | null {
    if (sources[0] != null && sources[0] !== false) {
      return (this.directives["web-share"] = this.applyMappings(sources as PolicySource[]));
    } else {
      return hashDelete(this.directives, "web-share");
    }
  }

  initializeCopy(other: PermissionsPolicy): Record<string, PolicySource[]> {
    return (this.directives = deepDup(other.directives));
  }

  build(context?: unknown): string {
    return this.buildDirectives(context)
      .filter((v): v is string => v !== null)
      .join("; ");
  }

  /** @internal */
  private applyMappings(sources: PolicySource[]): PolicySource[] {
    return sources.map((source) => {
      if (typeof source === "string" && source.startsWith(":")) {
        return this.applyMapping(source);
      }
      if (typeof source === "string" || typeof source === "function") {
        return source;
      }
      throw new ArgumentError(`Invalid HTTP permissions policy source: ${rbInspect(source)}`);
    });
  }

  /** @internal */
  private applyMapping(source: string): string {
    if (!Object.hasOwn(MAPPINGS, source.slice(1))) {
      throw new ArgumentError(
        `Unknown HTTP permissions policy source mapping: ${rbInspect(source)}`,
      );
    }
    return MAPPINGS[source.slice(1)];
  }

  /** @internal */
  private buildDirectives(context?: unknown): Array<string | null> {
    const result: Array<string | null> = [];
    for (const [directive, sources] of Object.entries(this.directives)) {
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
