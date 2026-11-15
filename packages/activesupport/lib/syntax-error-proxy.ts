import {
  DelegateClass,
  Location,
  excBacktrace,
  excBacktraceLocations,
  rbFSend,
} from "@blazetrails/ruby-compat";

export class SyntaxErrorProxy extends DelegateClass(SyntaxError) {
  backtrace(): string[] {
    return [...this.parseMessageForTrace(), ...(excBacktrace(this.__getobj__()) ?? [])];
  }

  static BacktraceLocation: typeof BacktraceLocation;
  static BacktraceLocationProxy: typeof BacktraceLocationProxy;

  backtraceLocations(): unknown[] | null {
    const locations = excBacktraceLocations(this.__getobj__());
    if (locations == null) return null;

    return [
      ...this.parseMessageForTrace().map((trace) => {
        const match = /^(.+?):(\d+).*$/.exec(trace);
        const [file, line] = match ? [match[1], match[2]] : [trace, null];
        return new BacktraceLocation(file, line == null ? 0 : parseInt(line, 10), trace);
      }),
      ...locations.map((loc) => new BacktraceLocationProxy(loc, this)),
    ];
  }

  /** @internal */
  private parseMessageForTrace(): string[] {
    const obj = this.__getobj__();
    if (obj.message.startsWith("(eval")) {
      const location = excBacktraceLocations(obj)![0];
      return [`${location.path}:${location.lineno}: ${obj.message}`];
    } else {
      return obj.message.split("\n");
    }
  }
}

class BacktraceLocation {
  #toS: string;

  constructor(
    public path: string,
    public lineno: number,
    toS: string,
  ) {
    this.#toS = toS;
  }

  toString(): string {
    return this.#toS;
  }

  spot(_: unknown): void {}

  label(): void {}
}

class BacktraceLocationProxy extends DelegateClass(Location) {
  declare ex: SyntaxErrorProxy;

  constructor(loc: Location, ex: SyntaxErrorProxy) {
    super(loc);
    this.ex = ex;
  }

  spot(_: unknown): unknown {
    return rbFSend(this.__getobj__(), "spot", this.ex.__getobj__());
  }
}

SyntaxErrorProxy.BacktraceLocation = BacktraceLocation;
SyntaxErrorProxy.BacktraceLocationProxy = BacktraceLocationProxy;
