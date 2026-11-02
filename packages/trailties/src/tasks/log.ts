import { getEnv } from "@blazetrails/activesupport";
import { DSL, FileList } from "@blazetrails/rake";
import { Dir, File, block } from "@blazetrails/ruby-compat";

DSL.namespace("log", () => {
  DSL.desc(
    "Truncate all/specified *.log files in log/ to zero bytes (specify which logs with LOGS=test,development)",
  );
  DSL.task(
    "clear",
    block(async () => {
      for (const file of await logFiles()) {
        await clearLogFile(file);
      }
    }),
  );
});

async function logFiles(): Promise<string[]> {
  if (getEnv("LOGS") === "all") {
    return (await FileList.get("log/*.log").toA()) as string[];
  } else if (getEnv("LOGS") != null) {
    return await logFilesToTruncate(getEnv("LOGS")!);
  } else {
    return await logFilesToTruncate((await allEnvironments()).join(","));
  }
}

async function logFilesToTruncate(envs: string): Promise<string[]> {
  const files = envs.split(",").map((file) => `log/${file.trim()}.log`);
  const exists = await Promise.all(files.map((file) => File.isExistAsync(file)));
  return files.filter((_file, i) => exists[i]);
}

async function clearLogFile(file: string): Promise<void> {
  const f = await File.openAsync(file, "w");
  f.close();
}

async function allEnvironments(): Promise<string[]> {
  return (await Dir.globAsync("config/environments/*.ts")).map((fname) =>
    File.basename(fname, ".*"),
  );
}
