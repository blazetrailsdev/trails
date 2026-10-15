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
const { loadCanonicalSchema } = await dist("activerecord/dist/support/canonical-schema.js");
const { File: FixtureFile } = await dist("activerecord/dist/fixture-set/file.js");
const { loadDatabaseConfig } = await dist("activerecord-cli/dist/index.js");
const I18n = await dist("i18n/dist/index.js");
const { YAML } = await dist("ruby-compat/dist/yaml.js");

await loadDatabaseConfig(appDir.pathname);

class Topic extends Base {
  static {
    this.serialize("content", { coder: JSON });
    registerModel(this);
  }
}

await Base.connectionPool().withConnection((conn) => loadCanonicalSchema(conn));

const topic = await Topic.create({ title: "serialized", content: { a: [1, 2] } });
const reloaded = await Topic.find(topic.id);

const fixturesDir = new URL("fixtures", appDir).pathname;
FixtureFile.registerModule(`${fixturesDir}/topics.ts`, { first: { title: "from fixture" } });
await FixtureSet.createFixtures(fixturesDir, ["topics"], { topics: Topic });
const fixtureTitle = (await Topic.find(FixtureSet.identify("first"))).title;

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

console.log(JSON.stringify({ roots, payload: reloaded.content, fixtureTitle, greeting, yamlLoad }));
