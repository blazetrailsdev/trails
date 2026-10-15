// A YAML-free trails app: every package root, an ActiveRecord boot from
// config/database.ts, a JSON-serialized column, a `.ts` fixture and a `.json`
// locale. Prints one JSON line the driving test reads.
import { readdir, readFile } from "node:fs/promises";

const packagesDir = new URL("../../../packages/", import.meta.url);
const appDir = new URL("./app/", import.meta.url);

const roots = [];
for (const name of (await readdir(packagesDir)).sort()) {
  let pkg;
  try {
    pkg = JSON.parse(await readFile(new URL(`${name}/package.json`, packagesDir), "utf8"));
  } catch {
    continue;
  }
  const entry = pkg.exports?.["."] ?? pkg.main;
  const main = typeof entry === "string" ? entry : (entry?.import ?? entry?.default);
  if (!main) continue;
  await import(new URL(`${name}/${main}`, packagesDir).href);
  roots.push(pkg.name);
}

const dist = (path) => import(new URL(path, packagesDir).href);
const { Base, registerModel } = await dist("activerecord/dist/index.js");
const { FixtureSet } = await dist("activerecord/dist/fixtures.js");
const { File: FixtureFile } = await dist("activerecord/dist/fixture-set/file.js");
const { loadDatabaseConfig } = await dist("activerecord-cli/dist/index.js");
const I18n = await dist("i18n/dist/index.js");
const { YAML } = await dist("ruby-compat/dist/yaml.js");

await loadDatabaseConfig(appDir.pathname);

class Post extends Base {
  static {
    this.tableName = "posts";
    this.serialize("payload", { coder: JSON });
    registerModel(this);
  }
}

await Base.connectionPool().withConnection((conn) =>
  conn.execute("CREATE TABLE posts (id integer PRIMARY KEY, title varchar, payload text)"),
);

const post = await Post.create({ title: "serialized", payload: { a: [1, 2] } });
const reloaded = await Post.find(post.id);

const fixturesDir = new URL("fixtures", appDir).pathname;
FixtureFile.registerModule(`${fixturesDir}/posts.ts`, { first: { title: "from fixture" } });
await FixtureSet.createFixtures(fixturesDir, ["posts"], { posts: Post });
const fixtureTitle = (await Post.find(FixtureSet.identify("first"))).title;

I18n.registerFileReader((filename) => readFile(filename, "utf8"));
I18n.loadPath().push(new URL("config/locales/en.json", appDir).pathname);
await I18n.preloadTranslationFiles();
const greeting = I18n.t("smoke.greeting");

let yamlLoad;
try {
  yamlLoad = { value: YAML.load("a: 1") };
} catch (error) {
  yamlLoad = { error: error.constructor.name, message: error.message };
}

console.log(JSON.stringify({ roots, payload: reloaded.payload, fixtureTitle, greeting, yamlLoad }));
