// A named class *expression* binds its own name inside its body (JS spec:
// the class name is in scope within the class, including static initialisers).
const Holder = class Base64 {
  static encode(s: string): string { return `enc:${s}`; }
  // `extends Base64` here must resolve to this very class expression.
  static Marshal = class Marshal extends Base64 {
    static tag = "marshal";
  };
  static JSON = class JSON extends Base64 {
    static tag = "json";
  };
};
console.log(`Holder.name = ${Holder.name}`);
console.log(`Marshal.tag = ${Holder.Marshal.tag}`);
console.log(`Marshal extends Base64 = ${Object.getPrototypeOf(Holder.Marshal) === Holder}`);
console.log(`inherited static = ${Holder.Marshal.encode("x")}`);
console.log(`JSON.tag = ${Holder.JSON.tag}`);
