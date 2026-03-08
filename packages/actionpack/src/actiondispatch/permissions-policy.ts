/**
 * ActionDispatch::PermissionsPolicy
 *
 * Builds Permissions-Policy HTTP headers.
 * Mirrors Rails' permissions_policy configuration DSL.
 */

export type PermissionSource = "self" | "none" | "*" | string;

const DIRECTIVES = [
  "accelerometer", "ambient-light-sensor", "autoplay", "bluetooth",
  "camera", "display-capture", "encrypted-media", "fullscreen",
  "geolocation", "gyroscope", "hid", "idle-detection",
  "keyboard-map", "magnetometer", "microphone", "midi",
  "payment", "picture-in-picture", "publickey-credentials-get",
  "screen-wake-lock", "serial", "sync-xhr", "usb",
  "web-share", "xr-spatial-tracking",
] as const;

export type DirectiveName = (typeof DIRECTIVES)[number];

export class PermissionsPolicy {
  private directives: Map<string, PermissionSource[]> = new Map();

  /** Set a directive to allow specific origins. */
  allow(directive: string, ...sources: PermissionSource[]): this {
    this.directives.set(directive, sources);
    return this;
  }

  /** Convenience methods for common directives. */
  accelerometer(...sources: PermissionSource[]): this { return this.allow("accelerometer", ...sources); }
  camera(...sources: PermissionSource[]): this { return this.allow("camera", ...sources); }
  geolocation(...sources: PermissionSource[]): this { return this.allow("geolocation", ...sources); }
  gyroscope(...sources: PermissionSource[]): this { return this.allow("gyroscope", ...sources); }
  magnetometer(...sources: PermissionSource[]): this { return this.allow("magnetometer", ...sources); }
  microphone(...sources: PermissionSource[]): this { return this.allow("microphone", ...sources); }
  midi(...sources: PermissionSource[]): this { return this.allow("midi", ...sources); }
  payment(...sources: PermissionSource[]): this { return this.allow("payment", ...sources); }
  usb(...sources: PermissionSource[]): this { return this.allow("usb", ...sources); }
  fullscreen(...sources: PermissionSource[]): this { return this.allow("fullscreen", ...sources); }
  autoplay(...sources: PermissionSource[]): this { return this.allow("autoplay", ...sources); }
  pictureInPicture(...sources: PermissionSource[]): this { return this.allow("picture-in-picture", ...sources); }
  displayCapture(...sources: PermissionSource[]): this { return this.allow("display-capture", ...sources); }
  encryptedMedia(...sources: PermissionSource[]): this { return this.allow("encrypted-media", ...sources); }
  idleDetection(...sources: PermissionSource[]): this { return this.allow("idle-detection", ...sources); }
  screenWakeLock(...sources: PermissionSource[]): this { return this.allow("screen-wake-lock", ...sources); }
  serial(...sources: PermissionSource[]): this { return this.allow("serial", ...sources); }
  syncXhr(...sources: PermissionSource[]): this { return this.allow("sync-xhr", ...sources); }
  webShare(...sources: PermissionSource[]): this { return this.allow("web-share", ...sources); }
  xrSpatialTracking(...sources: PermissionSource[]): this { return this.allow("xr-spatial-tracking", ...sources); }
  hid(...sources: PermissionSource[]): this { return this.allow("hid", ...sources); }
  bluetooth(...sources: PermissionSource[]): this { return this.allow("bluetooth", ...sources); }
  ambientLightSensor(...sources: PermissionSource[]): this { return this.allow("ambient-light-sensor", ...sources); }
  keyboardMap(...sources: PermissionSource[]): this { return this.allow("keyboard-map", ...sources); }
  publickeyCredentialsGet(...sources: PermissionSource[]): this { return this.allow("publickey-credentials-get", ...sources); }

  /** Build the Permissions-Policy header value. */
  build(): string {
    const parts: string[] = [];
    for (const [directive, sources] of this.directives) {
      const formatted = this.formatSources(sources);
      parts.push(`${directive}=${formatted}`);
    }
    return parts.join(", ");
  }

  /** Get the header name and value as a tuple. */
  toHeader(): [string, string] {
    return ["permissions-policy", this.build()];
  }

  /** Clone this policy. */
  dup(): PermissionsPolicy {
    const copy = new PermissionsPolicy();
    for (const [k, v] of this.directives) {
      copy.directives.set(k, [...v]);
    }
    return copy;
  }

  /** Check if any directives are set. */
  get empty(): boolean {
    return this.directives.size === 0;
  }

  private formatSources(sources: PermissionSource[]): string {
    if (sources.length === 0 || (sources.length === 1 && sources[0] === "none")) {
      return "()";
    }
    if (sources.length === 1 && sources[0] === "*") {
      return "*";
    }
    const formatted = sources.map((s) => {
      if (s === "self") return "self";
      if (s === "*") return "*";
      return `"${s}"`;
    });
    return `(${formatted.join(" ")})`;
  }
}
