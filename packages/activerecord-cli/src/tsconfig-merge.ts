import { parseConfigFileTextToJson } from "typescript";

/** compilerOptions keys AR requires and their required values. */
const AR_REQUIRED_OPTIONS: ReadonlyArray<readonly [string, unknown]> = [
  ["target", "ES2022"],
  ["module", "Node16"],
  ["moduleResolution", "Node16"],
  ["strict", true],
  ["esModuleInterop", true],
  ["skipLibCheck", true],
];

/** Include globs AR needs present (for models and migrations). */
const AR_REQUIRED_INCLUDES = ["app/models/**/*.ts", "db/migrate/**/*.ts"] as const;

/** The trails-tsc language service plugin subpath (exposes the TS language service plugin). */
const TRAILS_TSC_PLUGIN = "@blazetrails/trails-tsc/ts-plugin";

/** Fresh tsconfig scaffold written when no existing file is found. */
export const FRESH_TSCONFIG =
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "Node16",
        moduleResolution: "Node16",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        outDir: "dist",
        rootDir: ".",
        plugins: [{ name: TRAILS_TSC_PLUGIN }],
      },
      include: ["./**/*.ts", "app/models/**/*.ts", "db/migrate/**/*.ts"],
      exclude: ["node_modules", "dist"],
    },
    null,
    2,
  ) + "\n";

export interface TsconfigConflict {
  key: string;
  existing: unknown;
  required: unknown;
}

export interface TsconfigMergeResult {
  /** Updated file content (pretty-printed JSON). */
  content: string;
  /** compilerOptions keys that were added. */
  added: string[];
  /** Keys whose existing value differed — NOT overwritten. */
  conflicts: TsconfigConflict[];
  /** Whether the trails-tsc plugin entry was appended. */
  pluginAdded: boolean;
  /** Include globs appended to `include`. */
  includesAppended: string[];
  /** True when any modification was made (false = file is already compliant). */
  changed: boolean;
}

/** Parse JSONC text (comments + trailing commas) using TypeScript's parser. */
function parseJsonc(text: string): unknown {
  const { config, error } = parseConfigFileTextToJson("<tsconfig.json>", text);
  if (error) {
    throw new SyntaxError(`tsconfig.json parse error: ${error.messageText}`);
  }
  return config;
}

/**
 * Merge AR-required settings into an existing tsconfig.json JSONC string.
 * Conflicting keys are NOT overwritten — they are reported in `conflicts`.
 */
export function mergeTsconfig(existingText: string): TsconfigMergeResult {
  const cfg = parseJsonc(existingText) as {
    compilerOptions?: Record<string, unknown>;
    include?: string[];
    exclude?: string[];
    [k: string]: unknown;
  };

  if (!cfg.compilerOptions) cfg.compilerOptions = {};

  const added: string[] = [];
  const conflicts: TsconfigConflict[] = [];

  for (const [key, required] of AR_REQUIRED_OPTIONS) {
    if (!Object.prototype.hasOwnProperty.call(cfg.compilerOptions, key)) {
      cfg.compilerOptions[key] = required;
      added.push(key);
    } else if (cfg.compilerOptions[key] !== required) {
      conflicts.push({ key, existing: cfg.compilerOptions[key], required });
    }
  }

  // Ensure trails-tsc plugin is present.
  let pluginAdded = false;
  const plugins = cfg.compilerOptions["plugins"];
  if (!Array.isArray(plugins)) {
    cfg.compilerOptions["plugins"] = [{ name: TRAILS_TSC_PLUGIN }];
    pluginAdded = true;
  } else {
    const hasPlugin = (plugins as { name?: unknown }[]).some((p) => p.name === TRAILS_TSC_PLUGIN);
    if (!hasPlugin) {
      (plugins as { name: string }[]).push({ name: TRAILS_TSC_PLUGIN });
      pluginAdded = true;
    }
  }

  // Ensure required include globs are present.
  const includesAppended: string[] = [];
  if (!Array.isArray(cfg.include)) {
    cfg.include = [...AR_REQUIRED_INCLUDES];
    includesAppended.push(...AR_REQUIRED_INCLUDES);
  } else {
    for (const glob of AR_REQUIRED_INCLUDES) {
      if (!cfg.include.includes(glob)) {
        cfg.include.push(glob);
        includesAppended.push(glob);
      }
    }
  }

  const changed = added.length > 0 || pluginAdded || includesAppended.length > 0;
  const content = changed ? JSON.stringify(cfg, null, 2) + "\n" : existingText;
  return { content, added, conflicts, pluginAdded, includesAppended, changed };
}
