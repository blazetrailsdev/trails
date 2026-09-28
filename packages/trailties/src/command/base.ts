export class Base {
  options: object;

  static classUsage(): string | undefined {
    return undefined;
  }

  constructor(options: object = {}) {
    this.options = options;
  }

  /** @noRailsEquivalent PERMANENT */
  say(message: unknown = "", _color: string | null = null): void {
    console.log(String(message));
  }
}
