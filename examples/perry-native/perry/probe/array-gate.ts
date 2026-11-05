class Mine extends Array<number> {
  toString(): string {
    return "OVERRIDE";
  }
}
const a = new Mine();
a.push(1, 2, 3);
console.log("plain subclass      :", a.toString());

const b = new Mine();
b.push(1, 2, 3);
Object.setPrototypeOf(b, Mine.prototype);
console.log("after setPrototypeOf:", b.toString());

const c = new Mine();
c.push(1, 2, 3);
Object.defineProperty(c, "toString", { value: () => "OWN", configurable: true });
console.log("own property        :", c.toString());
