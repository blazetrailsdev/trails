import { Base, DatabaseConfigurations, DatabaseTasks } from "@blazetrails/activerecord";
import { loadDatabaseConfig, tryLoadModels } from "./db-helpers.js";

export interface StartOptions {
  /** Override of repl.start — injected by tests to avoid opening a real REPL. */
  startRepl?: (opts: { prompt: string; useGlobal: boolean }) => {
    on(event: string, cb: () => void): void;
  };
}

export async function arConsole(
  cwd: string,
  args: string[],
  opts: StartOptions = {},
): Promise<number> {
  const envIdx = args.indexOf("--env");
  if (envIdx >= 0 && args[envIdx + 1] && !args[envIdx + 1].startsWith("-")) {
    process.env["TRAILS_ENV"] = args[envIdx + 1];
  }

  try {
    await loadDatabaseConfig(cwd);
  } catch (err) {
    console.error(`ar: failed to load config/database.ts — ${String(err)}`);
    return 1;
  }

  const env = DatabaseConfigurations.currentEnv();
  const configs = DatabaseTasks.configsFor(env);
  if (configs.length > 0) {
    try {
      await Base.establishConnection(configs[0]!.configurationHash as { [key: string]: unknown });
    } catch (err) {
      console.error(`ar: failed to establish connection — ${String(err)}`);
      return 1;
    }
  }

  const models = await tryLoadModels(cwd).catch((err: unknown) => {
    console.error(`ar: failed to load app/models/index.ts — ${String(err)}`);
    return null;
  });
  if (!models) return 1;

  type ReplStart = (o: { prompt: string; useGlobal: boolean }) => {
    on(e: string, cb: () => void): void;
  };
  const startFn: ReplStart =
    opts.startRepl ?? ((await import("repl")).start as unknown as ReplStart);
  const replContext = startFn({ prompt: "trails> ", useGlobal: false });

  const ctx = (replContext as unknown as { context: Record<string, unknown> }).context;
  if (ctx) Object.assign(ctx, { Base, ...models });

  return new Promise<number>((res) => {
    replContext.on("exit", () => {
      try {
        Base.removeConnection();
      } catch {
        /* pool may already be gone */
      }
      res(0);
    });
  });
}
