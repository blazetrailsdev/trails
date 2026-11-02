import { Open3, getProcessAdapter } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { withFiles } from "./test-helpers/loader-test.js";

const MAIN = `
import { writeFileSync } from "node:fs";
import { registerHooks } from "node:module";

const root = new URL("./app/", import.meta.url).href;
const once = new URL("./app/once.ts", import.meta.url).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const generation = context.parentURL && new URL(context.parentURL).searchParams.get("zeitwerk");
    const managed = resolved.url.startsWith(root) && resolved.url !== once;
    if (!generation || !managed) return resolved;
    const url = new URL(resolved.url);
    url.searchParams.set("zeitwerk", generation);
    return { ...resolved, url: url.href };
  },
});

async function run() {
const first = await import(root + "post.ts");
writeFileSync(new URL(root + "application-record.ts"), "export class ApplicationRecord { static edited = true; }\\n" + globalThis.tail);
const second = await import(root + "post.ts?zeitwerk=2");
const lazy = await second.Post.lazy();

console.log(JSON.stringify({
  evaluated: globalThis.evaluated,
  newPost: first.Post !== second.Post,
  newParent: Object.getPrototypeOf(first.Post) !== Object.getPrototypeOf(second.Post),
  editedSource: second.Post.edited === true,
  cycle: second.Post.Comment.Post() === second.Post,
  framework: first.Post.framework === second.Post.framework,
  once: first.Post.Once === second.Post.Once,
  lazy,
}));
}
`;

const TAIL = `(globalThis.evaluated ??= []).push(import.meta.url.split("/").pop());`;

const FILES: [string, string][] = [
  ["main.mjs", `${MAIN}\nglobalThis.tail = ${JSON.stringify(TAIL)};\n${TAIL}\nawait run();`],
  ["framework.mjs", `export const framework = {};\n${TAIL}`],
  ["app/application-record.ts", `export class ApplicationRecord {}\n${TAIL}`],
  ["app/once.ts", `export class Once {}\n${TAIL}`],
  ["app/lazy.ts", `export const url = import.meta.url.split("/").pop();\n${TAIL}`],
  [
    "app/comment.ts",
    `import { Post } from "./post.ts";
export class Comment { static Post = () => Post; }
${TAIL}`,
  ],
  [
    "app/post.ts",
    `import { framework } from "../framework.mjs";
import { ApplicationRecord } from "./application-record.ts";
import { Comment } from "./comment.ts";
import { Once } from "./once.ts";
export class Post extends ApplicationRecord {
  static framework = framework;
  static Comment = Comment;
  static Once = Once;
  static lazy = async () => (await import("./lazy.ts")).url;
}
${TAIL}`,
  ],
];

const packageDist = (name: string) => new URL(`../../${name}/dist/`, import.meta.url).href;

const STATIC_TAIL = `(globalThis.evaluated ??= []).push(import.meta.url.split("/").pop());`;

const LOADER_MAIN = `
import { TopLevel, File } from "${packageDist("ruby-compat")}index.js";
import { Loader } from "${packageDist("zeitwerk")}zeitwerk.js";
import { autoloadGet } from "${packageDist("zeitwerk")}core-ext/kernel.js";
import { Cref } from "${packageDist("zeitwerk")}cref.js";

const once = new Loader();
await once.pushDir("once");
await once.setup();

const loader = new Loader();
loader.enableReloading();
await loader.pushDir("app");
await loader.setup();

const load = async () => {
  await loader.eagerLoad();
  await once.eagerLoad();
  return { ...TopLevel };
};

const first = await load();
File.write("app/application-record.ts", ${JSON.stringify(`export class ApplicationRecord { static edited = true; }\n${STATIC_TAIL}`)});
await loader.reload();
const second = await load();

console.log(JSON.stringify({
  newPost: first.Post !== second.Post,
  newParent: Object.getPrototypeOf(second.Post) === second.ApplicationRecord,
  cycle: second.Comment.Post() === second.Post,
  edited: second.Post.edited === true,
  once: first.Once === second.Once && second.Post.Once === second.Once,
  evaluated: globalThis.evaluated,
}));
`;

const LOADER_FILES: [string, string][] = [
  ["main.mjs", LOADER_MAIN],
  ["once/once.ts", `export class Once {}\n${STATIC_TAIL}`],
  ["app/application-record.ts", `export class ApplicationRecord {}\n${STATIC_TAIL}`],
  [
    "app/comment.ts",
    `import { Post } from "./post.ts";
export class Comment { static Post = () => Post; }
${STATIC_TAIL}`,
  ],
  [
    "app/post.ts",
    `import { ApplicationRecord } from "./application-record.ts";
import { Comment } from "./comment.ts";
import { Once } from "../once/once.ts";
export class Post extends ApplicationRecord {
  static Comment = () => Comment;
  static Once = Once;
}
${STATIC_TAIL}`,
  ],
];

describe("Loader#reload under real Node", () => {
  it("leaves no class from the previous generation", async () => {
    await withFiles(LOADER_FILES, async () => {
      const [output, status] = await Open3.capture2e(
        `"${getProcessAdapter().execPath!()}" main.mjs`,
      );

      expect(status.isSuccess(), output).toBe(true);
      expect(JSON.parse(output)).toEqual({
        newPost: true,
        newParent: true,
        cycle: true,
        edited: true,
        once: true,
        evaluated: [
          "application-record.ts",
          "once.ts",
          "post.ts",
          "comment.ts",
          "application-record.ts?zeitwerk=2",
          "post.ts?zeitwerk=2",
          "comment.ts?zeitwerk=2",
        ],
      });
    });
  }, 30_000);
});

describe("reload generations through module.registerHooks", () => {
  it("re-evaluates both ends of an import edge in generation 2", async () => {
    await withFiles(FILES, async () => {
      const [output, status] = await Open3.capture2e(
        `"${getProcessAdapter().execPath!()}" main.mjs`,
      );

      expect(status.isSuccess(), output).toBe(true);
      expect(JSON.parse(output)).toEqual({
        evaluated: [
          "main.mjs",
          "framework.mjs",
          "application-record.ts",
          "comment.ts",
          "once.ts",
          "post.ts",
          "application-record.ts?zeitwerk=2",
          "comment.ts?zeitwerk=2",
          "post.ts?zeitwerk=2",
          "lazy.ts?zeitwerk=2",
        ],
        newPost: true,
        newParent: true,
        editedSource: true,
        cycle: true,
        framework: true,
        once: true,
        lazy: "lazy.ts?zeitwerk=2",
      });
    });
  }, 30_000);
});
