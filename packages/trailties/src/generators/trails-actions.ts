import { getFs, getPath, type FsAdapter } from "@blazetrails/ruby-compat";
import { regexpEscape } from "@blazetrails/ruby-compat";
import { assertNoRubySource } from "../template-builder/no-ruby-source.js";
import { optimizeIndentation, rebaseIndentation } from "./actions.js";

type AsyncFs = FsAdapter & {
  readFile: NonNullable<FsAdapter["readFile"]>;
  writeFile: NonNullable<FsAdapter["writeFile"]>;
  mkdir: NonNullable<FsAdapter["mkdir"]>;
};

async function requireAsyncFs(needs: ReadonlyArray<keyof AsyncFs>): Promise<AsyncFs> {
  const fs = getFs();
  for (const m of needs) {
    if (typeof (fs as unknown as Record<string, unknown>)[m] !== "function") {
      throw new Error(
        `FsAdapter is missing required async method ${JSON.stringify(m)}; ` +
          `this action needs ${needs.map((n) => `async ${n}`).join(" + ")}`,
      );
    }
  }
  return fs as AsyncFs;
}

export interface TrailsActionsHost {
  cwd: string;
  output: (msg: string) => void;
}

export interface PkgOptions {
  dev?: boolean;
}

export async function pkg(
  this: TrailsActionsHost,
  name: string,
  version: string = "*",
  opts: PkgOptions = {},
): Promise<void> {
  if (name.trim() === "") {
    throw new Error(`package name must be non-empty, got ${JSON.stringify(name)}`);
  }
  const fs = await requireAsyncFs(["readFile", "writeFile"]);
  const path = getPath();
  const pkgPath = path.join(this.cwd, "package.json");
  const raw = await fs.readFile(pkgPath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const actual = parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
    throw new Error(`package.json must be a JSON object, got ${actual}`);
  }
  const json = parsed as Record<string, unknown>;
  if (name === "__proto__" || name === "constructor" || name === "prototype") {
    throw new Error(`invalid package name ${JSON.stringify(name)}`);
  }
  const key = opts.dev ? "devDependencies" : "dependencies";
  const existing = json[key];
  if (
    existing !== undefined &&
    (existing === null || typeof existing !== "object" || Array.isArray(existing))
  ) {
    const actual = existing === null ? "null" : Array.isArray(existing) ? "array" : typeof existing;
    throw new Error(`package.json "${key}" must be an object, got ${actual}`);
  }
  const deps: Record<string, string> = Object.assign(
    Object.create(null) as Record<string, string>,
    (existing as Record<string, string> | undefined) ?? {},
  );
  deps[name] = version;
  json[key] = deps;
  await fs.writeFile(pkgPath, JSON.stringify(json, null, 2) + "\n");
  this.output(`         pkg  ${name}`);
}

export interface RouteOptions {
  namespace?: string | string[] | null;
}

export async function route(
  this: TrailsActionsHost,
  routingCode: string,
  { namespace: namespaceOption }: RouteOptions = {},
): Promise<void> {
  assertNoRubySource(routingCode);
  const namespace = namespaceOption == null ? [] : ([] as string[]).concat(namespaceOption);
  let namespacePattern = routeNamespacePattern(namespace);
  routingCode = [...namespace]
    .reverse()
    .reduce(
      (code, name) =>
        `mapper.namespace(${JSON.stringify(name)}, () => {\n${rebaseIndentation(code, 2)}});`,
      routingCode,
    );

  this.output(`       route  ${summarize(routingCode)}`);

  const namespaceMatch = await matchFile(this, "config/routes.ts", namespacePattern);
  if (namespaceMatch) {
    const captures = namespaceMatch
      .slice(1)
      .filter((c): c is string => c != null)
      .map((c) => c.length);
    const baseIndent = captures[0];
    const existingBlockIndent = captures.length > 1 ? captures.at(-1) : undefined;
    routingCode = rebaseIndentation(routingCode, baseIndent + 2);
    if (existingBlockIndent !== undefined) {
      routingCode = routingCode.replace(
        new RegExp(`^[ ]{0,${existingBlockIndent}}\\S.+\\n?`, "gm"),
        "",
      );
    }
    namespacePattern = new RegExp(regexpEscape(namespaceMatch[0]));
  }

  await injectIntoFile(this, "config/routes.ts", routingCode, { after: namespacePattern });
}

export interface EnvironmentOptions {
  env?: string | string[] | null;
}

export async function environment(
  this: TrailsActionsHost,
  data: string,
  options: EnvironmentOptions = {},
): Promise<void> {
  const sentinel = " extends Application {\n  static {\n";
  const envFileSentinel = "Trails.application!.configure(function () {\n";
  assertNoRubySource(data);

  if (options.env == null) {
    await injectIntoFile(this, "config/application.ts", optimizeIndentation(data, 4), {
      after: sentinel,
    });
  } else {
    for (const env of ([] as string[]).concat(options.env)) {
      if (!/^[a-z0-9_-]+$/i.test(env)) {
        throw new Error(`environment name must match /^[a-z0-9_-]+$/i, got ${JSON.stringify(env)}`);
      }
      await injectIntoFile(this, `config/environments/${env}.ts`, optimizeIndentation(data, 2), {
        after: envFileSentinel,
      });
    }
  }
}

export async function initializer(
  this: TrailsActionsHost,
  filename: string,
  content: string,
): Promise<void> {
  if (
    filename === "" ||
    filename === "." ||
    filename === ".." ||
    filename.includes("/") ||
    filename.includes("\\")
  ) {
    throw new Error(`initializer filename must be a leaf name, got ${JSON.stringify(filename)}`);
  }
  assertNoRubySource(content);
  const fs = await requireAsyncFs(["mkdir", "writeFile"]);
  const path = getPath();
  const dir = path.join(this.cwd, "config/initializers");
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, filename);
  await fs.writeFile(dest, content.endsWith("\n") ? content : content + "\n");
  this.output(`      create  config/initializers/${filename}`);
}

function routeNamespacePattern(namespace: string[]): RegExp {
  const pattern = namespace
    .map((name, i) => [name, i] as const)
    .reverse()
    .reduce<string | null>((pattern, [name, i]) => {
      const cumulativeMargin = `\\${i + 1}[ ]{2}`;
      const blankOrIndentedLine = `^[ ]*\\n|^${cumulativeMargin}.*\\n`;
      return `(?:(?:${blankOrIndentedLine})*?^(${cumulativeMargin})mapper\\.namespace\\(${regexpEscape(JSON.stringify(name))}, \\(\\) => \\{\\n${pattern ?? ""})?`;
    }, null);
  return new RegExp(
    `^([ ]*).+drawRoutes\\(mapper: Mapper\\): void \\{[ ]*\\n${pattern ?? ""}`,
    "m",
  );
}

async function matchFile(
  host: TrailsActionsHost,
  relPath: string,
  pattern: RegExp,
): Promise<RegExpMatchArray | null> {
  const fs = await requireAsyncFs(["readFile"]);
  const full = getPath().join(host.cwd, relPath);
  if (!(await fs.exists(full))) return null;
  return (await fs.readFile(full, "utf-8")).match(pattern);
}

async function injectIntoFile(
  host: TrailsActionsHost,
  relPath: string,
  replacement: string,
  { after }: { after: string | RegExp },
): Promise<void> {
  const fs = await requireAsyncFs(["readFile", "writeFile"]);
  const full = getPath().join(host.cwd, relPath);
  const content = await fs.readFile(full, "utf-8");
  if (content.includes(replacement)) return;
  const flag = typeof after === "string" ? new RegExp(regexpEscape(after)) : after;
  await fs.writeFile(
    full,
    content.replace(flag, (match) => match + replacement),
  );
}

function summarize(s: string): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? flat.slice(0, 57) + "..." : flat;
}
