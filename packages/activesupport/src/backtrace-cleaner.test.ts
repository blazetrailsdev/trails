import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "./logger.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "./string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "./callbacks.js";
import { concern, includeConcern, hasConcern } from "./concern.js";
import { transliterate } from "./transliterate.js";
import { CurrentAttributes } from "./current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "./inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "./module-ext.js";
import { Notifications } from "./notifications.js";
import { MemoryStore, NullStore, FileStore } from "./cache/stores.js";
import { MessageVerifier } from "./message-verifier.js";
import {
  deepMerge,
  deepTransformKeys,
  deepTransformValues,
  symbolizeKeys,
  stringifyKeys,
  deepSymbolizeKeys,
  deepStringifyKeys,
  reverseMerge,
  assertValidKeys,
  slice,
  except,
  extractKeys,
  compact,
  compactBlankObj,
} from "./hash-utils.js";
import { OrderedHash } from "./ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "./safe-buffer.js";
import { ErrorReporter } from "./error-reporter.js";
import {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  currentTime,
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "./testing-helpers.js";
import {
  makeRange,
  overlap,
  overlaps,
  rangeIncludesValue,
  rangeIncludesRange,
  cover,
  rangeToFs,
  rangeStep,
  rangeEach,
} from "./range-ext.js";
import {
  sum,
  indexBy,
  many,
  excluding,
  without,
  pluck,
  pick,
  compactBlank,
  inOrderOf,
  sole,
  minimum,
  maximum,
} from "./enumerable-utils.js";
import { toSentence } from "./array-utils.js";
import { ParameterFilter } from "./parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "./key-generator.js";

describe("BacktraceCleanerDefaultFilterAndSilencerTest", () => {
  // Simulate the BacktraceCleaner used in key-generator tests
  function makeBacktraceCleaner() {
    const filters: Array<(line: string) => string> = [];
    const silencers: Array<(line: string) => boolean> = [];
    return {
      addFilter(fn: (line: string) => string) {
        filters.push(fn);
      },
      addSilencer(fn: (line: string) => boolean) {
        silencers.push(fn);
      },
      clean(lines: string[]): string[] {
        return lines
          .map((line) => filters.reduce((l, f) => f(l), line))
          .filter((line) => !silencers.some((s) => s(line)));
      },
    };
  }

  it("should format installed gems correctly", () => {
    const cleaner = makeBacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/gems/some-gem-1.0/lib/", "[gem] "));
    const bt = ["/gems/some-gem-1.0/lib/foo.rb:10"];
    expect(cleaner.clean(bt)).toEqual(["[gem] foo.rb:10"]);
  });

  it("should format installed gems not in Gem.default_dir correctly", () => {
    const cleaner = makeBacktraceCleaner();
    cleaner.addFilter((line) => line.replace(/\/path\/to\/gems\/[^/]+\//, ""));
    const bt = ["/path/to/gems/mygem-2.0/lib/mygem.rb"];
    expect(cleaner.clean(bt)).toEqual(["lib/mygem.rb"]);
  });

  it("should format gems installed by bundler", () => {
    const cleaner = makeBacktraceCleaner();
    cleaner.addFilter((line) => line.replace(/\/bundler\/gems\/[^/]+\//, ""));
    const bt = ["/bundler/gems/foo-abc123/lib/foo.rb"];
    expect(cleaner.clean(bt)).toEqual(["lib/foo.rb"]);
  });

  it("should silence gems from the backtrace", () => {
    const cleaner = makeBacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("/gems/"));
    const bt = ["/gems/rack-1.0/lib/rack.rb", "/app/controllers/foo.rb"];
    expect(cleaner.clean(bt)).toEqual(["/app/controllers/foo.rb"]);
  });

  it("should silence stdlib", () => {
    const cleaner = makeBacktraceCleaner();
    cleaner.addSilencer((line) => line.startsWith("/usr/lib/ruby/"));
    const bt = ["/usr/lib/ruby/json.rb", "/app/lib/my_code.rb"];
    expect(cleaner.clean(bt)).toEqual(["/app/lib/my_code.rb"]);
  });

  it("should preserve lines that have a subpath matching a gem path", () => {
    const cleaner = makeBacktraceCleaner();
    // Only silence exact gem paths, not subpaths in app code
    cleaner.addSilencer((line) => /\/gems\/[^/]+\//.test(line) && !line.startsWith("/app/"));
    const bt = ["/gems/rack-1.0/lib/rack.rb", "/app/lib/uses_gems/code.rb"];
    expect(cleaner.clean(bt)).toEqual(["/app/lib/uses_gems/code.rb"]);
  });
});

describe("BacktraceCleanerFilterTest", () => {
  it("backtrace should filter all lines in a backtrace, removing prefixes", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/usr/local/lib/", ""));
    const bt = ["/usr/local/lib/ruby/foo.rb", "/usr/local/lib/ruby/bar.rb"];
    expect(cleaner.clean(bt)).toEqual(["ruby/foo.rb", "ruby/bar.rb"]);
  });

  it("backtrace cleaner should allow removing filters", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/usr/local/", ""));
    cleaner.removeFilters();
    const bt = ["/usr/local/lib/foo.rb"];
    expect(cleaner.clean(bt)).toEqual(["/usr/local/lib/foo.rb"]);
  });

  it("backtrace should contain unaltered lines if they don't match a filter", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/gems/", "GEM:"));
    const bt = ["/gems/foo.rb", "/app/bar.rb"];
    const cleaned = cleaner.clean(bt);
    expect(cleaned[0]).toBe("GEM:foo.rb");
    expect(cleaned[1]).toBe("/app/bar.rb");
  });

  it("#dup also copy filters", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/usr/", ""));
    const duped = cleaner.dup();
    const bt = ["/usr/local/foo.rb"];
    expect(duped.clean(bt)).toEqual(["local/foo.rb"]);
  });
});

describe("BacktraceCleanerSilencerTest", () => {
  it("backtrace should not contain lines that match the silencer", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("/gems/"));
    const bt = ["/app/foo.rb", "/gems/activesupport/bar.rb", "/app/baz.rb"];
    expect(cleaner.clean(bt)).toEqual(["/app/foo.rb", "/app/baz.rb"]);
  });

  it("backtrace cleaner should allow removing silencer", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("/gems/"));
    cleaner.removeSilencers();
    const bt = ["/gems/foo.rb"];
    expect(cleaner.clean(bt)).toEqual(["/gems/foo.rb"]);
  });

  it("#dup also copy silencers", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("vendor"));
    const duped = cleaner.dup();
    const bt = ["/vendor/foo.rb", "/app/bar.rb"];
    expect(duped.clean(bt)).toEqual(["/app/bar.rb"]);
  });
});

describe("BacktraceCleanerMultipleSilencersTest", () => {
  it("backtrace should not contain lines that match the silencers", () => {
    // BacktraceCleaner imported at top
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line: string) => line.includes("vendor"));
    const bt = ["/app/user.rb", "/vendor/gems/foo.rb", "/app/post.rb"];
    const cleaned = cleaner.clean(bt);
    expect(cleaned).not.toContain("/vendor/gems/foo.rb");
    expect(cleaned).toContain("/app/user.rb");
  });

  it("backtrace should only contain lines that match the silencers", () => {
    // BacktraceCleaner imported at top
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line: string) => line.replace("/app", ""));
    const bt = ["/app/user.rb", "/app/post.rb"];
    const cleaned = cleaner.clean(bt);
    expect(cleaned[0]).toBe("/user.rb");
    expect(cleaned[1]).toBe("/post.rb");
  });
});

describe("BacktraceCleanerFilterAndSilencerTest", () => {
  it("backtrace should not silence lines that has first had their silence hook filtered out", () => {
    // A filter runs before silencers. If filter transforms line so it no longer matches silencer, it's kept.
    const filters: Array<(line: string) => string> = [];
    const silencers: Array<(line: string) => boolean> = [];
    function clean(lines: string[]) {
      return lines
        .map((line) => filters.reduce((l, f) => f(l), line))
        .filter((line) => !silencers.some((s) => s(line)));
    }

    // Filter strips the gem path prefix
    filters.push((line) => line.replace("/gems/rack-1.0", ""));
    // Silencer would silence lines with /gems/ — but after filter, the prefix is gone
    silencers.push((line) => line.includes("/gems/"));

    const bt = ["/gems/rack-1.0/lib/rack.rb"];
    // After filter: "/lib/rack.rb" → does not include "/gems/" → NOT silenced
    expect(clean(bt)).toEqual(["/lib/rack.rb"]);
  });
});
