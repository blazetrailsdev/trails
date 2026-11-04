class Mine extends Array<number> {
  toString(): string {
    return "OVERRIDE";
  }
  describe(): string {
    return "described";
  }
}

const m = new Mine();
m.push(1, 2, 3);

console.log("String(m)        =", String(m), "   expected: OVERRIDE");
console.log("m.toString()     =", m.toString(), "   expected: OVERRIDE");
console.log("`${m}`           =", `${m}`, "   expected: OVERRIDE");
console.log("m.describe()     =", m.describe(), "expected: described");
console.log("m.length         =", m.length, "expected: 3");
console.log("m instanceof Array =", m instanceof Array, "expected: true");
console.log("own toString on proto? =", Object.prototype.hasOwnProperty.call(Mine.prototype, "toString"), "expected: true");
console.log("direct proto call =", Mine.prototype.toString.call(m), "expected: OVERRIDE");
