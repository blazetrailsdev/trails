import {
  extractOptionsBang,
  isPlainObject,
  isExtractableOptions,
} from "@blazetrails/activesupport";

const args: unknown[] = ["/root/tmp/cache/"];
const before = args.length;
const opts = extractOptionsBang(args);
console.log(
  `P1 string-last: before=${before} after=${args.length} opts=${JSON.stringify(opts)} kept=${String(args[0])}`,
);
console.log(`P2 isPlainObject("s")=${String(isPlainObject("/root/tmp/cache/"))}`);
console.log(`P3 isExtractableOptions("s")=${String(isExtractableOptions("/root/tmp/cache/"))}`);

const args2: unknown[] = ["/root/tmp/cache/", { expiresIn: 1 }];
const opts2 = extractOptionsBang(args2);
console.log(
  `P4 hash-last: after=${args2.length} opts=${JSON.stringify(opts2)} kept=${String(args2[0])}`,
);

console.log("EXPECT P1 after=1 opts={} kept=/root/tmp/cache/ | P2 false | P3 false | P4 after=1");
