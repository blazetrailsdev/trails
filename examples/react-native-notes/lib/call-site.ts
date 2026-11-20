interface CallSite {
  getFunctionName(): string | null;
  getFileName(): string | null;
  getLineNumber(): number | null;
  getColumnNumber(): number | null;
}

const E = Error as unknown as { prepareStackTrace?: (e: unknown, sites: CallSite[]) => unknown };
let proto: CallSite | undefined;
E.prepareStackTrace = (_e, sites) => {
  proto = Object.getPrototypeOf(sites[0]) as CallSite;
};
void new Error().stack;
E.prepareStackTrace = undefined;

if (proto && !Object.hasOwn(proto, "toString")) {
  Object.defineProperty(proto, "toString", {
    configurable: true,
    value(this: CallSite) {
      const location = `${this.getFileName()}:${this.getLineNumber()}:${this.getColumnNumber()}`;
      const name = this.getFunctionName();
      return name ? `${name} (${location})` : location;
    },
  });
}
