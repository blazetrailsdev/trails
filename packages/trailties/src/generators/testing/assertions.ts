import {
  assert,
  assertEqual,
  assertMatch,
  assertNil,
  assertNothingRaised,
} from "@blazetrails/activesupport";
import { File, rbInspect } from "@blazetrails/ruby-compat";
import { migrationFileName, type BehaviorHost } from "./behavior.js";

export type AssertionsHost = BehaviorHost;

type Contents = Array<string | RegExp | ((read: string) => unknown)>;

export async function assertFile(
  this: AssertionsHost,
  relative: string,
  ...contents: Contents
): Promise<void> {
  const block =
    typeof contents.at(-1) === "function"
      ? (contents.pop() as (read: string) => unknown)
      : undefined;
  const absolute = File.expandPath(relative, this.destinationRoot);
  assert(File.isExist(absolute), `Expected file ${rbInspect(relative)} to exist, but does not`);

  const read = block || contents.length > 0 ? File.read(absolute) : undefined;
  if (block) await assertNothingRaised(() => block(read!));

  for (const content of contents) {
    if (typeof content === "string") {
      assertEqual(content, read);
    } else if (content instanceof RegExp) {
      assertMatch(content, read!);
    }
  }
}

export const assertDirectory = assertFile;

export function assertNoFile(this: AssertionsHost, relative: string): void {
  const absolute = File.expandPath(relative, this.destinationRoot);
  assert(!File.isExist(absolute), `Expected file ${rbInspect(relative)} to not exist, but does`);
}

export const assertNoDirectory = assertNoFile;

export async function assertMigration(
  this: AssertionsHost,
  relative: string,
  ...contents: Contents
): Promise<void> {
  const fileName = migrationFileName.call(this, relative);
  assert(fileName, `Expected migration ${relative} to exist, but was not found`);
  await assertFile.call(this, fileName!, ...contents);
}

export function assertNoMigration(this: AssertionsHost, relative: string): void {
  const fileName = migrationFileName.call(this, relative);
  assertNil(fileName, `Expected migration ${relative} to not exist, but found ${fileName}`);
}

export async function assertInstanceMethod(
  method: string,
  content: string,
  block?: (body: string) => unknown,
): Promise<void> {
  const match = new RegExp(
    `(\\s+)(?:async )?${method}(\\(.*?\\))?[^{\\n]*\\{(.*?)\\n\\1\\}`,
    "s",
  ).exec(content);
  assert(match, `Expected to have method ${method}`);
  if (block) await assertNothingRaised(() => block(match![3].trim()));
}

export const assertMethod = assertInstanceMethod;
