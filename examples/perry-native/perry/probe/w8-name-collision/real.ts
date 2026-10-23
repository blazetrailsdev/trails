export class Shared {
  constructor(block?: (s: Shared) => void) {
    if (block !== undefined) block(this);
  }
  defineThing(name: string): string {
    return `thing:${name}`;
  }
}
