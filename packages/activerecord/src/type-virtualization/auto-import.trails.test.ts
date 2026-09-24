import { describe, expect, test } from "vitest";
import { posix, win32 } from "node:path";
import { resolveAutoImports } from "./auto-import.js";

const SOURCE =
  "export class Post extends Base {\n" +
  "  static {\n" +
  '    this.belongsTo("author");\n' +
  "  }\n" +
  "}\n";

function specifier(fromFile: string, toFile: string): string | undefined {
  const [line] = resolveAutoImports(SOURCE, fromFile, new Map([["Author", toFile]]));
  return /from "(.*)";$/.exec(line ?? "")?.[1];
}

function expected(path: typeof posix, fromFile: string, toFile: string): string {
  let rel = path
    .relative(path.dirname(path.resolve(fromFile)), path.resolve(toFile))
    .replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel.replace(/\.tsx?$/, ".js");
}

const POSIX: ReadonlyArray<[string, string]> = [
  ["/app/models/post.ts", "/app/models/author.ts"],
  ["/app/models/post.ts", "/app/models/people/author.ts"],
  ["/app/models/blog/post.ts", "/app/models/author.ts"],
  ["/app/models/blog/post.ts", "/app/lib/people/author.tsx"],
  ["/app/models/post.ts", "/author.ts"],
  ["/app/./models//post.ts", "/app/models/./people//author.ts"],
  ["/app/models/../models/blog/post.ts", "/app/models/blog/../author.ts"],
  ["/../../app/models/post.ts", "/app/../../../lib/author.ts"],
  ["/App/Models/post.ts", "/app/models/author.ts"],
  ["app/models/post.ts", "app/models/people/author.ts"],
  ["app/models/post.ts", "/app/models/author.ts"],
  ["./app/../post.ts", "../lib/author.ts"],
];

const WIN32: ReadonlyArray<[string, string]> = [
  ["C:\\app\\models\\post.ts", "C:\\app\\models\\author.ts"],
  ["C:\\app\\models\\blog\\post.ts", "C:\\app\\lib\\author.ts"],
  ["C:\\app\\models\\post.ts", "c:\\APP\\Models\\people\\author.ts"],
  ["c:\\App\\models\\post.ts", "C:\\app\\MODELS\\author.ts"],
  ["C:\\app\\.\\models\\\\post.ts", "C:\\app\\models\\..\\lib\\.\\author.ts"],
  ["C:\\..\\..\\app\\post.ts", "C:\\app\\..\\..\\author.ts"],
  ["C:/app/models/post.ts", "C:\\app\\lib\\author.ts"],
  ["C:\\app\\models\\post.ts", "D:\\app\\models\\author.ts"],
  ["d:\\app\\post.ts", "D:\\app\\author.ts"],
  ["\\\\server\\share\\app\\post.ts", "\\\\server\\share\\lib\\author.ts"],
  ["\\\\Server\\Share\\app\\post.ts", "\\\\server\\share\\app\\author.ts"],
  ["\\\\server\\share\\app\\post.ts", "C:\\app\\author.ts"],
  ["C:\\app\\post.ts", "\\\\server\\share\\author.ts"],
];

describe("resolveAutoImports relative specifier", () => {
  test.each(POSIX)("matches path.posix.relative: %s -> %s", (fromFile, toFile) => {
    expect(specifier(fromFile, toFile)).toBe(expected(posix, fromFile, toFile));
  });

  test.each(WIN32)("matches path.win32.relative: %s -> %s", (fromFile, toFile) => {
    expect(specifier(fromFile, toFile)).toBe(expected(win32, fromFile, toFile));
  });
});
