import { cattrAccessor } from "@blazetrails/activesupport/module-ext";

class Holder {
  declare static attr: string[];
  declare attr: string[];
  static {
    cattrAccessor.call(this, "attr", { default: ["installed"] });
  }
}

const h = new Holder();
console.log(`M1 static read   : ${JSON.stringify((Holder as unknown as { attr: unknown }).attr)}`);
console.log(`M2 instance read : ${JSON.stringify((h as unknown as { attr: unknown }).attr)}`);
console.log(`M3 own property? : ${String(Object.prototype.hasOwnProperty.call(h, "attr"))}`);
console.log(
  `M4 proto getter? : ${String(Object.getOwnPropertyDescriptor(Holder.prototype, "attr") !== undefined)}`,
);
