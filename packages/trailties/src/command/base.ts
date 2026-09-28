export class Base {
  options: object;

  constructor(options: object = {}) {
    this.options = options;
  }

  /** @noRailsEquivalent PERMANENT */
  say(message: unknown = "", _color: string | null = null): void {
    console.log(String(message));
  }
}
