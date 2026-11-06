class Holder {
  declare static attr: string[];
  declare attr: string[];
}

const target = Holder as unknown as Record<string, unknown>;
Object.defineProperty(target, "attr", { get: () => ["from-static"], configurable: true });
Object.defineProperty(Holder.prototype, "attr", {
  get: () => (Holder as unknown as { attr: string[] }).attr,
  configurable: true,
});

const h = new Holder();
console.log(`D1 static read   : ${JSON.stringify((Holder as unknown as { attr: unknown }).attr)}`);
console.log(`D2 instance read : ${JSON.stringify((h as unknown as { attr: unknown }).attr)}`);
console.log(`D3 own property? : ${String(Object.prototype.hasOwnProperty.call(h, "attr"))}`);
console.log(
  `D4 proto getter? : ${String(Object.getOwnPropertyDescriptor(Holder.prototype, "attr") !== undefined)}`,
);
