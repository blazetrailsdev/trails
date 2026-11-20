import { beforeEach, describe, expect, test } from "vitest";
import { BacktraceCleaner } from "../../lib/backtrace-cleaner.js";
import { EnvHelpers } from "../support/env-helpers.js";

const GEM_DEFAULT_DIR = "/usr/local/lib/node_modules";

describe("BacktraceCleanerTest", () => {
  const envHelpers = new EnvHelpers();
  let cleaner: BacktraceCleaner;

  beforeEach(() => {
    cleaner = new BacktraceCleaner();
  });

  test("#clean silences Trails code from backtrace", () => {
    const backtrace = [
      "app/controllers/foo_controller.rb:4:in 'index'",
      `${GEM_DEFAULT_DIR}/gems/railties-1.2.3/lib/rails/engine.rb:536:in \`call`,
    ];

    const cleaned = cleaner.clean(backtrace);

    expect(cleaned).toEqual(["app/controllers/foo_controller.rb:4:in 'index'"]);
  });

  test("#clean does not silence when BACKTRACE is set", async () => {
    await envHelpers.switchEnv("BACKTRACE", "1", () => {
      const backtrace = [
        "app/app/controllers/foo_controller.rb:4:in 'index'",
        `${GEM_DEFAULT_DIR}/gems/railties-1.2.3/lib/rails/engine.rb:536:in \`call`,
      ];

      const cleaned = cleaner.clean(backtrace);

      expect(cleaned).toEqual(backtrace);
    });
  });

  test("#clean_frame silences Trails code", () => {
    const frame = `${GEM_DEFAULT_DIR}/gems/railties-1.2.3/lib/rails/engine.rb:536:in \`call`;

    const cleaned = cleaner.cleanFrame(frame);

    expect(cleaned).toBeNull();
  });

  test("#clean_frame does not silence when BACKTRACE is set", async () => {
    await envHelpers.switchEnv("BACKTRACE", "1", () => {
      const frame = `${GEM_DEFAULT_DIR}/gems/railties-1.2.3/lib/rails/engine.rb:536:in \`call`;

      const cleaned = cleaner.cleanFrame(frame);

      expect(cleaned).toBe(frame);
    });
  });
});
