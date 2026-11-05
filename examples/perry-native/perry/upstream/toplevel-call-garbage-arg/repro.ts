const Re = 864e5,
  ke = 1e8 * Re,
  Ne = xo(ke),
  xe = -Ne;

console.log("ke :", ke, "(expected 8640000000000000)");
console.log("Ne :", Ne, "(expected 8640000000000000)");
console.log("xe :", xe);

function xo(t: number): number {
  console.log("   xo received:", t);
  return t;
}
