import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dir, File, FileUtils, include, stdout } from "@blazetrails/ruby-compat";
import { Actions, type ActionsHost } from "../actions.js";
import { Group, type GroupClass } from "../group.js";
import { WARNINGS } from "./inject-into-file.js";

let destinationRoot: string;

type CounterInstance = ActionsHost & {
  insertIntoFile(destination: string, ...args: unknown[]): Promise<unknown>;
};
type ActionsClass = Pick<GroupClass, "argument"> & {
  addRuntimeOptionsBang(): void;
} & (new (...args: unknown[]) => CounterInstance);
const MyCounter = class MyCounter extends Group {
  static {
    const klass = this as unknown as ActionsClass;
    include(this, Actions);
    klass.addRuntimeOptionsBang();
    klass.argument("first", { type: "numeric" });
    klass.argument("second", { type: "numeric", default: 2 });
  }
} as unknown as ActionsClass;

async function capture(_stream: string, block: () => unknown): Promise<string> {
  let result = "";
  const write = stdout.write;
  (stdout as { write: typeof write }).write = (chunk) => {
    result += chunk;
    return true;
  };
  try {
    await block();
  } finally {
    (stdout as { write: typeof write }).write = write;
  }
  return result;
}

beforeAll(() => {
  destinationRoot = Dir.mktmpdir("thor-sandbox-");
});
afterAll(() => {
  FileUtils.rmRf(destinationRoot);
});

describe("Thor::Actions::InjectIntoFile", () => {
  let _invoker: CounterInstance | undefined;
  let _revoker: CounterInstance | undefined;

  beforeEach(() => {
    _invoker = _revoker = undefined;
    FileUtils.rmRf(destinationRoot);
    FileUtils.mkdirP(File.join(destinationRoot, "doc"));
    File.write(file(), "__start__\nREADME\n__end__\n");
    File.write(File.join(destinationRoot, "doc/README.zh"), "__start__\n说明\n__end__\n");
  });

  const invoker = (options: Record<string, unknown> = {}) =>
    (_invoker ||= new MyCounter([1, 2], options, { destinationRoot }));
  const revoker = () =>
    (_revoker ||= new MyCounter([1, 2], {}, { destinationRoot, behavior: "revoke" }));
  const invokeBang = (destination: string, ...args: unknown[]) =>
    capture(":stdout", () => invoker().insertIntoFile(destination, ...args));
  const revokeBang = (destination: string, ...args: unknown[]) =>
    capture(":stdout", () => revoker().insertIntoFile(destination, ...args));
  const file = () => File.join(destinationRoot, "doc/README");

  describe("#invoke!", () => {
    it("changes the file adding content after the flag", async () => {
      await invokeBang("doc/README", "\nmore content", { after: "__start__" });
      expect(File.read(file())).toEqual("__start__\nmore content\nREADME\n__end__\n");
    });

    it("changes the file adding content before the flag", async () => {
      await invokeBang("doc/README", "more content\n", { before: "__end__" });
      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");
    });

    it("appends content to the file if before and after arguments not provided", async () => {
      await invokeBang("doc/README", "more content\n");
      expect(File.read(file())).toEqual("__start__\nREADME\n__end__\nmore content\n");
    });

    it("does not change the file if replacement present in the file", async () => {
      await invokeBang("doc/README", "more specific content\n");
      expect(await invokeBang("doc/README", "more specific content\n")).toEqual(
        "   unchanged  doc/README\n",
      );
    });

    it("does not change the file and logs the warning if flag not found in the file", async () => {
      expect(await invokeBang("doc/README", "more content\n", { after: "whatever" })).toEqual(
        `${WARNINGS.unchangedNoFlag}  doc/README\n`,
      );
    });

    it("accepts data as a block", async () => {
      await invokeBang("doc/README", { before: "__end__" }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");
    });

    it("logs status", async () => {
      expect(await invokeBang("doc/README", "\nmore content", { after: "__start__" })).toEqual(
        "      insert  doc/README\n",
      );
    });

    it("logs status if pretending", async () => {
      invoker({ pretend: true });
      expect(await invokeBang("doc/README", "\nmore content", { after: "__start__" })).toEqual(
        "      insert  doc/README\n",
      );
    });

    it("does not change the file if pretending", async () => {
      invoker({ pretend: true });
      await invokeBang("doc/README", "\nmore content", { after: "__start__" });
      expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
    });

    it("does not change the file if already includes content", async () => {
      await invokeBang("doc/README", { before: "__end__" }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");

      await invokeBang("doc/README", { before: "__end__" }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");
    });

    it("does not change the file if already includes content using before with capture", async () => {
      await invokeBang("doc/README", { before: /(__end__)/ }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");

      await invokeBang("doc/README", { before: /(__end__)/ }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");
    });

    it("does not change the file if already includes content using after with capture", async () => {
      await invokeBang("doc/README", { after: /(README\n)/ }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");

      await invokeBang("doc/README", { after: /(README\n)/ }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");
    });

    it("does not attempt to change the file if it doesn't exist - instead raises Thor::Error", async () => {
      await expect(
        invokeBang("idontexist", { before: "something" }, () => "any content"),
      ).rejects.toThrow(/does not appear to exist/);
      expect(File.isExist("idontexist")).toBeFalsy();
    });

    it("does not attempt to change the file if it doesn't exist and pretending", async () => {
      await expect(
        (async () => {
          invoker({ pretend: true });
          await invokeBang("idontexist", { before: "something" }, () => "any content");
        })(),
      ).resolves.not.toThrow();
      expect(File.isExist("idontexist")).toBeFalsy();
    });

    it("does change the file if already includes content and :force is true", async () => {
      await invokeBang("doc/README", { before: "__end__" }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\n__end__\n");

      await invokeBang("doc/README", { before: "__end__", force: true }, () => "more content\n");

      expect(File.read(file())).toEqual("__start__\nREADME\nmore content\nmore content\n__end__\n");
    });

    it("can insert chinese", async () => {
      await invokeBang("doc/README.zh", "\n中文", { after: "__start__" });
      expect(File.read(File.join(destinationRoot, "doc/README.zh"))).toEqual(
        "__start__\n中文\n说明\n__end__\n",
      );
    });
  });

  describe("#revoke!", () => {
    it("subtracts the destination file after injection", async () => {
      await invokeBang("doc/README", "\nmore content", { after: "__start__" });
      await revokeBang("doc/README", "\nmore content", { after: "__start__" });
      expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
    });

    it("subtracts the destination file before injection", async () => {
      await invokeBang("doc/README", "more content\n", { before: "__start__" });
      await revokeBang("doc/README", "more content\n", { before: "__start__" });
      expect(File.read(file())).toEqual("__start__\nREADME\n__end__\n");
    });

    it("subtracts even with double after injection", async () => {
      await invokeBang("doc/README", "\nmore content", { after: "__start__" });
      await invokeBang("doc/README", "\nanother stuff", { after: "__start__" });
      await revokeBang("doc/README", "\nmore content", { after: "__start__" });
      expect(File.read(file())).toEqual("__start__\nanother stuff\nREADME\n__end__\n");
    });

    it("subtracts even with double before injection", async () => {
      await invokeBang("doc/README", "more content\n", { before: "__start__" });
      await invokeBang("doc/README", "another stuff\n", { before: "__start__" });
      await revokeBang("doc/README", "more content\n", { before: "__start__" });
      expect(File.read(file())).toEqual("another stuff\n__start__\nREADME\n__end__\n");
    });

    it("subtracts when prepending", async () => {
      await invokeBang("doc/README", "more content\n", { after: /^/ });
      await invokeBang("doc/README", "another stuff\n", { after: /^/ });
      await revokeBang("doc/README", "more content\n", { after: /^/ });
      expect(File.read(file())).toEqual("another stuff\n__start__\nREADME\n__end__\n");
    });

    it("subtracts when appending", async () => {
      await invokeBang("doc/README", "more content\n", { before: /$/ });
      await invokeBang("doc/README", "another stuff\n", { before: /$/ });
      await revokeBang("doc/README", "more content\n", { before: /$/ });
      expect(File.read(file())).toEqual("__start__\nREADME\n__end__\nanother stuff\n");
    });

    it("shows progress information to the user", async () => {
      await invokeBang("doc/README", "\nmore content", { after: "__start__" });
      expect(await revokeBang("doc/README", "\nmore content", { after: "__start__" })).toEqual(
        "    subtract  doc/README\n",
      );
    });
  });
});
