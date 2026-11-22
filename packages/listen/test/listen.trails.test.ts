import { Dir, File, FileUtils, Pathname, block } from "@blazetrails/ruby-compat";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Listen } from "../lib/listen.js";

describe("Listen against a real directory", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await File.realpathAsync(Dir.mktmpdir());
  });

  afterEach(async () => {
    await Listen.stop();
    FileUtils.rmRf(dir);
  });

  const changes = () => {
    const calls: [string[], string[], string[]][] = [];
    let wake: () => void = () => {};
    const callback = block((modified: string[], added: string[], removed: string[]) => {
      calls.push([modified, added, removed]);
      wake();
    });
    const next = () => new Promise<void>((resolve) => (wake = resolve));
    return { calls, callback, next };
  };

  it("yields added, modified and removed absolute paths", async () => {
    const { calls, callback, next } = changes();
    const listener = Listen.to(dir, { waitForDelay: 0.05 }, callback);
    await listener.start();
    const path = File.join(dir, "a.txt");

    let seen = next();
    await File.writeAsync(path, "1");
    await seen;
    expect(calls.at(-1)).toEqual([[], [path], []]);

    seen = next();
    await File.writeAsync(path, "2");
    await seen;
    expect(calls.at(-1)).toEqual([[path], [], []]);

    seen = next();
    await File.deleteAsync(path);
    await seen;
    expect(calls.at(-1)).toEqual([[], [], [path]]);
  });

  it("silences ignored paths and holds changes while paused", async () => {
    const { calls, callback, next } = changes();
    const listener = Listen.to(dir, { waitForDelay: 0.05, ignore: /\.log$/ }, callback);
    await listener.start();
    await listener.pause();
    await File.writeAsync(File.join(dir, "skip.log"), "x");
    await File.writeAsync(File.join(dir, "keep.rb"), "x");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(calls).toHaveLength(0);

    const seen = next();
    await listener.start();
    await seen;
    expect(calls).toEqual([[[], [File.join(dir, "keep.rb")], []]]);
  });

  it("yields paths under the watched directory relative to the cwd when relative", async () => {
    const { calls, callback, next } = changes();
    const listener = Listen.to(dir, { waitForDelay: 0.05, relative: true }, callback);
    await listener.start();
    const seen = next();
    await File.writeAsync(File.join(dir, "a.rb"), "x");
    await seen;
    const expected = File.join(
      new Pathname(dir).relativePathFrom(new Pathname(Dir.pwd())).toString(),
      "a.rb",
    );
    expect(calls).toEqual([[[], [expected], []]]);
  });
});
