// Wall 17 probe: which half of the stack-introspection contract is missing?
// `callerLocations` (activesupport/src/deprecation.ts) needs BOTH:
//   (a) Error.prepareStackTrace to be invoked, and
//   (b) new Error().stack lines to carry (file:line:col).
let hookCalled = false;
let siteCount = -1;
Error.prepareStackTrace = (_e, sites) => {
  hookCalled = true;
  siteCount = sites.length;
  return "SENTINEL";
};
const err = new Error("probe");
const raw = err.stack;
Error.prepareStackTrace = undefined;

console.log(`hookCalled=${hookCalled}`);
console.log(`siteCount=${siteCount}`);
console.log(`stackIsSentinel=${raw === "SENTINEL"}`);
console.log(`stackType=${typeof raw}`);
console.log(`stackTraceLimitType=${typeof Error.stackTraceLimit}`);
console.log(`captureStackTraceType=${typeof Error.captureStackTrace}`);

const plain = new Error("plain").stack ?? "";
const lines = plain.split("\n");
console.log(`lineCount=${lines.length}`);
// the exact regex callerLocations uses
const re = /\((.*):(\d+):\d+\)$|at (.*):(\d+):\d+$/;
const matching = lines.filter((l) => re.test(l.trim())).length;
console.log(`linesMatchingCallerLocationsRegex=${matching}`);
for (const l of lines.slice(0, 6)) console.log(`FRAME| ${l}`);
