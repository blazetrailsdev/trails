import ts from "typescript-5";

export type TypeProblem = {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: "warning";
};

const TSCONFIG = "/tsconfig.json";

type FileSystemEntries = { files: readonly string[]; directories: readonly string[] };

/** `tsc`'s own `include` / `exclude` matcher, which `ts.sys.readDirectory` calls; TypeScript exports it untyped. */
const matchFiles = (ts as unknown as { matchFiles: MatchFiles }).matchFiles;
type MatchFiles = (
  path: string,
  extensions: readonly string[] | undefined,
  excludes: readonly string[] | undefined,
  includes: readonly string[] | undefined,
  useCaseSensitiveFileNames: boolean,
  currentDirectory: string,
  depth: number | undefined,
  getFileSystemEntries: (path: string) => FileSystemEntries,
  realpath: (path: string) => string,
) => string[];

function entries(files: Record<string, string>, dir: string): FileSystemEntries {
  const prefix = dir.endsWith("/") ? dir : `${dir}/`;
  const found = { files: new Set<string>(), directories: new Set<string>() };
  for (const path of Object.keys(files)) {
    if (!path.startsWith(prefix)) continue;
    const [name, ...rest] = path.slice(prefix.length).split("/");
    (rest.length ? found.directories : found.files).add(name);
  }
  return { files: [...found.files], directories: [...found.directories] };
}

function configHost(files: Record<string, string>): ts.ParseConfigHost {
  return {
    useCaseSensitiveFileNames: true,
    fileExists: (path) => path in files,
    readFile: (path) => files[path],
    readDirectory: (root, extensions, excludes, includes, depth) =>
      matchFiles(
        root,
        extensions,
        excludes,
        includes,
        true,
        "/",
        depth,
        (dir) => entries(files, dir),
        (p) => p,
      ),
  };
}

let config: ts.ParsedCommandLine = ts.parseJsonConfigFileContent({}, configHost({}), "/");

/**
 * The app's `tsconfig.json`, read as `tsc -p` reads it, with what the
 * playground cannot honour pinned: no emit, no `@types` packages, and the
 * framework's declarations taken as checked.
 */
function readConfig(files: Record<string, string>): ts.ParsedCommandLine {
  const text = files[TSCONFIG];
  const json =
    text === undefined ? {} : (ts.parseConfigFileTextToJson(TSCONFIG, text).config ?? {});
  const parsed = ts.parseJsonConfigFileContent(json, configHost(files), "/", undefined, TSCONFIG);
  parsed.options = { ...parsed.options, noEmit: true, skipLibCheck: true, types: [] };
  return parsed;
}

const IMPORT_META = "/lib/import-meta.d.ts";
const IMPORT_META_TEXT =
  "interface ImportMeta { readonly dirname: string; readonly filename: string }";

let service: ts.LanguageService | null = null;
let declarations: Record<string, string> = {};
let app: Record<string, string> = {};
const versions = new Map<string, number>();

function read(path: string): string | undefined {
  return path === IMPORT_META ? IMPORT_META_TEXT : (app[path] ?? declarations[path]);
}

function languageService(): ts.LanguageService {
  service ??= ts.createLanguageService(
    {
      getCompilationSettings: () => config.options,
      getScriptFileNames: () => [...config.fileNames, IMPORT_META],
      getScriptVersion: (path) => String(versions.get(path) ?? 0),
      getScriptSnapshot: (path) => {
        const text = read(path);
        return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
      },
      getCurrentDirectory: () => "/",
      getDefaultLibFileName: (options) => `/lib/${ts.getDefaultLibFileName(options)}`,
      fileExists: (path) => read(path) !== undefined,
      readFile: read,
      directoryExists: (dir) => {
        const prefix = dir.endsWith("/") ? dir : `${dir}/`;
        return [app, declarations].some((files) =>
          Object.keys(files).some((p) => p.startsWith(prefix)),
        );
      },
    },
    ts.createDocumentRegistry(),
  );
  return service;
}

/**
 * The type errors in an app's `.ts` files, as warnings: the playground runs
 * an app that does not type-check, as `tsx` would, and shows them alongside.
 * Syntax errors are left to the runtime, which stops the boot on them.
 */
export function typeProblems(
  declarationFiles: Record<string, string>,
  files: Record<string, string>,
): TypeProblem[] {
  declarations = declarationFiles;
  const next = Object.fromEntries(Object.entries(files).filter(([path]) => path.endsWith(".ts")));
  for (const [path, text] of Object.entries(next)) {
    if (app[path] !== text) versions.set(path, (versions.get(path) ?? 0) + 1);
  }
  app = next;
  config = readConfig(files);
  const ls = languageService();
  return config.fileNames.flatMap((path) =>
    ls.getSyntacticDiagnostics(path).length
      ? []
      : ls.getSemanticDiagnostics(path).flatMap((d) => {
          if (d.file?.fileName !== path) return [];
          const at = d.file.getLineAndCharacterOfPosition(d.start ?? 0);
          return {
            path,
            line: at.line + 1,
            column: at.character + 1,
            message: ts.flattenDiagnosticMessageText(d.messageText, " "),
            severity: "warning" as const,
          };
        }),
  );
}
