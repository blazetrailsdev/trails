export class NotAModel {
  doThing(): void {
    // this.attribute("name", "string") — should NOT be virtualized.
  }
}

export class AlsoNotAModel extends Object {
  static {
    // @ts-ignore — not a real call; just verifying the walker skips it.
    (this as any).attribute?.("x", "string");
  }
}
