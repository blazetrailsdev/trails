export class GlobalID {
  readonly uri: string;

  constructor(gid: string, _options: Record<string, unknown> = {}) {
    this.uri = gid;
  }

  toParam(): string {
    return this.uri;
  }

  toString(): string {
    return this.uri;
  }
}
