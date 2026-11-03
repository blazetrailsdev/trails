// Shape B: a class DECLARATION whose static initialiser subclasses itself.
class Base64 {
  encode(s: string): string { return `enc:${s}`; }
  static Marshal = class Marshal extends Base64 {
    static tag = "marshal";
    override encode(s: string): string { return `m:${super.encode(s)}`; }
  };
  static JSON = class JSON extends Base64 {
    static tag = "json";
  };
}
console.log(`Base64.name = ${Base64.name}`);
console.log(`Marshal.tag = ${Base64.Marshal.tag}`);
console.log(`extends ok = ${Object.getPrototypeOf(Base64.Marshal) === Base64}`);
console.log(`super call = ${new Base64.Marshal().encode("x")}`);
console.log(`JSON.tag = ${Base64.JSON.tag}`);
