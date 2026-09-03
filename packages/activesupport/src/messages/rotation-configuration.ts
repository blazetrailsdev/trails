export type RotationKind = "signed" | "encrypted";

export class RotationConfiguration {
  readonly signed: unknown[][];
  readonly encrypted: unknown[][];

  constructor() {
    this.signed = [];
    this.encrypted = [];
  }

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
