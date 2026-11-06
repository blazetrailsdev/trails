class One {
  got: number;
  first: unknown;
  constructor(...args: unknown[]) {
    this.got = args.length;
    this.first = args[0];
  }
}

function mk(ctor: typeof One, rest: unknown[], options: Record<string, unknown>): One {
  return new ctor(...rest, ...(Object.keys(options).length === 0 ? [] : [options]));
}

function viaRestParam(ctor: typeof One, ...parameters: unknown[]): One {
  const options = {} as Record<string, unknown>;
  const rest = parameters;
  return new ctor(...rest, ...(Object.keys(options).length === 0 ? [] : [options]));
}

const a = mk(One, ["/tmp/cache/"], {});
console.log(`A two-spread-new empty-opts: got=${a.got} first=${String(a.first)}`);

const b = mk(One, ["/tmp/cache/"], { x: 1 });
console.log(`B two-spread-new with-opts:  got=${b.got} first=${String(b.first)}`);

const c = viaRestParam(One, "/tmp/cache/");
console.log(`C rest-param aliased:        got=${c.got} first=${String(c.first)}`);

const spreadArr: unknown[] = [":file_store", "/tmp/cache/"];
const d = viaRestParam(One, ...(spreadArr.slice(1) as unknown[]));
console.log(`D recursed spread:           got=${d.got} first=${String(d.first)}`);

const e = new One(...["/tmp/cache/"], ...[]);
console.log(`E literal two-spread:        got=${e.got} first=${String(e.first)}`);

console.log("EXPECT A=1 B=2 C=1 D=1 E=1");
