export type RotationKind = "signed" | "encrypted";

export class RotationConfiguration {
  readonly signed: unknown[][];
  readonly encrypted: unknown[][];

  constructor() {
    this.signed = [];
    this.encrypted = [];
  }

  /**
   * Ruby collects trailing keyword arguments into an options hash and appends
   * it to `args` only when non-empty. JavaScript has no implicit keyword
   * collection, so callers pass the options object as the final argument and
   * it is stored verbatim.
   */
  rotate(kind: RotationKind, ...args: unknown[]): void {
    switch (kind) {
      case "signed":
        this.signed.push(args);
        break;
      case "encrypted":
        this.encrypted.push(args);
        break;
    }
  }
}
