import { File } from "@blazetrails/ruby-compat";

export interface TrailsActionsHost {
  cwd: string;
  output: (msg: string) => void;
}

export interface PkgOptions {
  dev?: boolean;
}

/** @noRailsEquivalent CONVERGEABLE converge-generators-actions-gemfile-family-onto-package-json */
export async function pkg(
  this: TrailsActionsHost,
  name: string,
  version: string = "*",
  opts: PkgOptions = {},
): Promise<void> {
  if (name.trim() === "") {
    throw new Error(`package name must be non-empty, got ${JSON.stringify(name)}`);
  }
  const pkgPath = File.join(this.cwd, "package.json");
  const raw = await File.readAsync(pkgPath);
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
  await File.writeAsync(pkgPath, JSON.stringify(json, null, 2) + "\n");
  this.output(`         pkg  ${name}`);
}
