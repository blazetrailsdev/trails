import {
  Dir,
  File,
  FileUtils,
  SystemExit,
  env as ENV,
  getProcessAdapter,
  registerProcessAdapter,
  setEnv,
  stderr as $stderr,
  stdout as $stdout,
} from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, expect } from "vitest";
import { Application } from "../application.js";
import { FileUtilsExt } from "../file-utils-ext.js";
import { Rake } from "../rake-module.js";
import { TaskManager } from "../task-manager.js";

const SAVED_ENV = ["RAKE_COLUMNS", "RAKE_SYSTEM", "RAKEOPT", "TESTKEY"];

export function useApplicationTestCase(): { tempdir: string } {
  const state = { tempdir: "" };
  let origPwd: string;
  const origEnv: Record<string, string | undefined> = {};
  const adapter = getProcessAdapter();
  beforeEach(() => {
    origPwd = Dir.pwd();
    for (const key of SAVED_ENV) {
      origEnv[key] = ENV[key];
      setEnv(key, undefined);
    }
    state.tempdir = File.realpath(Dir.mktmpdir("test_rake_"));
    Dir.chdir(state.tempdir);
    Rake.application = new Application();
    TaskManager.recordTaskMetadata = true;
    FileUtilsExt.verboseFlag = false;
    FileUtilsExt.nowriteFlag = false;
    registerProcessAdapter(
      Object.create(adapter, {
        exit: {
          value: (code?: number) => {
            throw new SystemExit(code ?? 0);
          },
        },
      }),
    );
  });
  afterEach(async () => {
    registerProcessAdapter(adapter);
    Dir.chdir(origPwd);
    await FileUtils.rmRfAsync(state.tempdir);
    for (const key of SAVED_ENV) setEnv(key, origEnv[key]);
    Rake.application = undefined;
    FileUtilsExt.verboseFlag = false;
    FileUtilsExt.nowriteFlag = false;
  });
  return state;
}

export async function captureOutput(block: () => unknown): Promise<[string, string]> {
  const out = { stdout: "", stderr: "" };
  const writes = [$stdout.write, $stderr.write];
  $stdout.write = (chunk: string) => ((out.stdout += chunk), true);
  $stderr.write = (chunk: string) => ((out.stderr += chunk), true);
  try {
    await block();
    return [out.stdout, out.stderr];
  } finally {
    [$stdout.write, $stderr.write] = writes;
  }
}

export async function rakefileUnittest(): Promise<void> {
  await File.writeAsync("Rakefile.ts", "");
  await FileUtils.mkdirPAsync("subdir");
}

export async function rakefileDefault(): Promise<void> {
  await File.writeAsync("Rakefile.ts", "");
}

export async function rakefileRakelib(): Promise<void> {
  await FileUtils.mkdirPAsync("rakelib");
  await File.writeAsync("rakelib/test1.ts", "");
  await File.writeAsync("rakelib/test2.ts", "");
}

export async function rakeSystemDir(): Promise<string> {
  await FileUtils.mkdirPAsync("system");
  await File.writeAsync(File.join("system", "sys1.ts"), "");
  setEnv("RAKE_SYSTEM", "system");
  return "system";
}

export function verifyKeywords(
  notes: string[],
  name: string,
  expecteds: unknown[],
  actuals: unknown[],
) {
  notes.push(name);
  expect(actuals.length).toBe(expecteds.length);
  expecteds.forEach((e, i) => expect(actuals[i]).toBe(e));
}

export function verifyNotes(notes: string[]) {
  expect(notes).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
}
