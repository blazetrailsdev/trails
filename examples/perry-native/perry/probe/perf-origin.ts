console.log("performance.timeOrigin =", performance.timeOrigin);
console.log("performance.now()      =", performance.now());
console.log("Date.now()             =", Date.now());
const sum = performance.timeOrigin + performance.now();
console.log("timeOrigin + now()     =", sum);
console.log("Date.now() for compare =", Date.now(), "(the two should be close)");
try {
  const ns = BigInt(Math.round(sum * 1_000)) * 1_000n;
  console.log("systemEpochNs()        =", ns.toString());
  console.log("digits                 =", ns.toString().length, "(expect 19)");
} catch (e) {
  console.log("systemEpochNs() THREW:", (e as Error).name, (e as Error).message);
}
