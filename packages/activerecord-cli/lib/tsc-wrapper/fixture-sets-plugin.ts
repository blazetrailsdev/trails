import type { TscPlugin, VirtualizeOutput } from "@blazetrails/trails-tsc";
import { camelize, singularize, underscore } from "@blazetrails/activesupport";

export interface FixtureFile {
  path: string;
  text: string;
}

export interface FixtureSetsPluginOptions {
  fixtureFiles: readonly FixtureFile[];
  modelRegistry: ReadonlyMap<string, string>;
}

interface FixtureSetFacts {
  labels: string[] | null;
  modelClass: string | null;
}

const FIXTURES_CALL_PATTERN = /\.fixtures\(([^)]*)\)/;
const STRING_ARGUMENT_PATTERN = /"([^"]*)"|'([^']*)'/g;
const SET_FIXTURE_CLASS_PATTERN = /\.setFixtureClass\(\s*\{([^}]*)\}/g;
const OVERRIDE_ENTRY_PATTERN =
  /(?:"([^"]+)"|'([^']+)'|([\w$]+))\s*:\s*(?:"([^"]+)"|'([^']+)'|([\w$.]+))/g;
const TOP_LEVEL_KEY_PATTERN = /^(?:"([^"]+)"|'([^']+)'|([^\s#:'"-][^:#]*?))\s*:(?:\s|$)/;

function readFixtureSet(file: FixtureFile): FixtureSetFacts {
  if (!file.path.endsWith(".yml")) return { labels: null, modelClass: null };
  const labels: string[] = [];
  const ignored = new Set(["DEFAULTS"]);
  let modelClass: string | null = null;
  let inFixture = false;
  let inIgnore = false;
  for (const line of file.text.split(/\r?\n/)) {
    if (line.trimStart().startsWith("<%") || (/^\S/.test(line) && line.includes("<%")))
      return { labels: null, modelClass };
    const key = TOP_LEVEL_KEY_PATTERN.exec(line);
    if (key) {
      const label = key[1] ?? key[2] ?? key[3];
      inFixture = label === "_fixture";
      inIgnore = false;
      if (!inFixture) labels.push(label);
      continue;
    }
    if (!inFixture) continue;
    const setting = /^\s+(model_class|ignore)\s*:\s*(.*?)\s*$/.exec(line);
    if (setting) {
      inIgnore = setting[1] === "ignore";
      if (setting[1] === "model_class") modelClass = setting[2].replace(/^["']|["']$/g, "");
      else
        for (const name of setting[2].replace(/^\[|\]$/g, "").split(",")) {
          if (name.trim() !== "") ignored.add(name.trim());
        }
      continue;
    }
    const item = /^\s+-\s*(\S+)/.exec(line);
    if (inIgnore && item) ignored.add(item[1]);
  }
  return { labels: labels.filter((l) => !ignored.has(l)), modelClass };
}

function fixtureClassOverrides(source: string): Map<string, string> {
  const overrides = new Map<string, string>();
  for (const call of source.matchAll(SET_FIXTURE_CLASS_PATTERN)) {
    for (const entry of call[1].matchAll(OVERRIDE_ENTRY_PATTERN)) {
      overrides.set(entry[1] ?? entry[2] ?? entry[3], entry[4] ?? entry[5] ?? entry[6]);
    }
  }
  return overrides;
}

function relativeSpecifier(fromFile: string, toFile: string): string {
  const from = fromFile.split("/").slice(0, -1);
  const to = toFile.split("/");
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const up = from.length - common;
  const rel = [...Array(up).fill(".."), ...to.slice(common)].join("/");
  return (up === 0 ? `./${rel}` : rel).replace(/\.[cm]?tsx?$/, ".js");
}

/** @noRailsEquivalent PERMANENT */
export function createFixtureSetsPlugin(opts: FixtureSetsPluginOptions): TscPlugin {
  const { fixtureFiles, modelRegistry } = opts;
  return {
    name: "fixture-sets",
    extensions: [".ts", ".mts", ".cts"],
    virtualize(filePath, source): VirtualizeOutput | null {
      const call = FIXTURES_CALL_PATTERN.exec(source);
      if (fixtureFiles.length === 0 || !call) return null;
      const fixtureSetNames = [...call[1].matchAll(STRING_ARGUMENT_PATTERN)].map(
        (m) => m[1] ?? m[2],
      );
      if (fixtureSetNames.length === 0) return null;
      const overrides = fixtureClassOverrides(source);
      const members: string[] = [];
      const seen = new Set<string>();
      for (const file of fixtureFiles) {
        if (file.path.startsWith("files/")) continue;
        const fsName = file.path.replace(/\.[^./]+$/, "");
        if (fixtureSetNames[0] !== ":all" && !fixtureSetNames.includes(fsName)) continue;
        const key = fsName.includes("/") ? fsName.replaceAll("/", "_") : fsName;
        if (seen.has(key)) continue;
        seen.add(key);
        const { labels, modelClass } = readFixtureSet(file);
        const className =
          overrides.get(key) ??
          overrides.get(fsName) ??
          modelClass ??
          camelize(singularize(fsName));
        const shortName = className.split(/::|\./).pop()!;
        const modelFile = modelRegistry.get(shortName);
        const modelPath = `/models/${underscore(className.replaceAll(".", "::"))}.ts`;
        const modelType = modelFile?.endsWith(modelPath)
          ? `import(${JSON.stringify(relativeSpecifier(filePath, modelFile))}).${shortName}`
          : "unknown";
        const labelType = labels
          ? labels.map((l) => JSON.stringify(l)).join(" | ") || "never"
          : "string";
        members.push(
          `    ${JSON.stringify(key)}: __TrailsFixtureSetAccessor<${modelType}, ${labelType}>;`,
        );
      }
      const augmentation = [
        "",
        'type __TrailsFixtureSetAccessor<T, L extends string> = import("@blazetrails/activerecord/test-fixtures").FixtureSetAccessor<T, L>;',
        'declare module "@blazetrails/activesupport/test-case" {',
        "  interface TestCase {",
        ...members,
        "  }",
        "}",
        "",
      ].join("\n");
      return { ts: `${source}${source.endsWith("\n") ? "" : "\n"}${augmentation}` };
    },
  };
}
