import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { beforeAll, describe, it, expect } from "vitest";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const ESLINT_RULE_FILE = "eslint/no-raw-control-bytes.mjs";
const SHELL_SCANNER_FILE = "scripts/ci/check-control-bytes.sh";
const EVERY_UNICODE_CODE_POINT = Array.from({ length: 0x110000 }, (_unused, cp) => cp);

async function readControlRe(file, pattern) {
  const source = await fs.readFile(path.join(repoRoot, file), "utf8");
  const match = source.match(pattern);
  expect(match, `no CONTROL_RE definition found in ${file}`).not.toBeNull();
  return match[1];
}

function codePointsFlaggedByRegexLiteral(literal) {
  const [, body, flags] = literal.match(/^\/(.*)\/([a-z]*)$/u);
  const re = new RegExp(body, flags.replace("g", ""));
  return EVERY_UNICODE_CODE_POINT.filter((cp) => re.test(String.fromCodePoint(cp)));
}

function codePointsFlaggedByBytePattern(pattern) {
  const re = new RegExp(pattern, "u");
  const encoder = new TextEncoder();
  return EVERY_UNICODE_CODE_POINT.filter((cp) =>
    re.test(String.fromCharCode(...encoder.encode(String.fromCodePoint(cp)))),
  );
}

describe("no-raw-control-bytes", () => {
  let flaggedByRule;
  let flaggedByScanner;

  beforeAll(async () => {
    flaggedByRule = codePointsFlaggedByRegexLiteral(
      await readControlRe(ESLINT_RULE_FILE, /^const CONTROL_RE = (\/.*\/[a-z]*);$/mu),
    );
    flaggedByScanner = codePointsFlaggedByBytePattern(
      await readControlRe(SHELL_SCANNER_FILE, /^CONTROL_RE='(.*)'$/mu),
    );
  });

  it("flags the same code points as check-control-bytes.sh", () => {
    expect(flaggedByRule).toEqual(flaggedByScanner);
  });

  it("flags C0 except tab, LF and CR, plus DEL and C1", () => {
    const c0 = EVERY_UNICODE_CODE_POINT.slice(0x00, 0x20).filter(
      (cp) => cp !== 0x09 && cp !== 0x0a && cp !== 0x0d,
    );
    const c1 = EVERY_UNICODE_CODE_POINT.slice(0x80, 0xa0);
    expect(flaggedByRule).toEqual([...c0, 0x7f, ...c1]);
  });
});
