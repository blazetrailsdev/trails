import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { watchViews } from "./watch-views.js";

function mkScratch(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "trails-tsc-watch-"));
}

function waitFor(pred: () => boolean, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = (): void => {
      if (pred()) return resolve();
      if (Date.now() - t0 > timeoutMs) return reject(new Error("timeout"));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe("watchViews", () => {
  it("runs initial build and rebuilds when a .tse file is added", async () => {
    const cwd = mkScratch();
    fs.mkdirSync(path.join(cwd, "app/views"), { recursive: true });
    const events: string[] = [];
    const handle = watchViews({ cwd, debounceMs: 5, onRebuild: ({ kind }) => events.push(kind) });
    try {
      await waitFor(() => events.includes("initial"));
      fs.writeFileSync(path.join(cwd, "app/views/home.html.tse"), "<%= name %>");
      await waitFor(() => events.includes("change"));
      expect(fs.existsSync(path.join(cwd, ".trails/views/home.html.tse.js"))).toBe(true);
    } finally {
      handle.close();
    }
  });

  it("creates the views dir if missing and surfaces build errors", async () => {
    const cwd = mkScratch();
    // Pre-existing symlinked .trails escape trips the safety guard on build.
    fs.symlinkSync(mkScratch(), path.join(cwd, ".trails"));
    const errors: Error[] = [];
    const handle = watchViews({ cwd, debounceMs: 5, onError: (e) => errors.push(e) });
    try {
      await waitFor(() => errors.length > 0);
      expect(errors[0]!.message).toMatch(/symlink escape/);
      expect(fs.existsSync(path.join(cwd, "app/views"))).toBe(true);
    } finally {
      handle.close();
    }
  });
});
