import { beforeEach, describe, it, expect } from "vitest";
import { assertEmpty } from "./testing/assertions.js";

import { BacktraceCleaner } from "./backtrace-cleaner.js";

describe("BacktraceCleanerDefaultFilterAndSilencerTest", () => {
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
    const backtrace = ["/gems/nosuchgem-1.2.3/lib/foo.rb"];
    const result = cleaner.clean(backtrace);
    assertEmpty(result);
  });

  it("should silence stdlib", () => {
    const cleaner = makeBacktraceCleaner();
    cleaner.addSilencer((line) => line.startsWith("/usr/lib/ruby/"));
    const backtrace = ["/usr/lib/ruby/lib/foo.rb"];
    const result = cleaner.clean(backtrace);
    assertEmpty(result);
  });

  it("should preserve lines that have a subpath matching a gem path", () => {
    const cleaner = makeBacktraceCleaner();
    cleaner.addSilencer((line) => /\/gems\/[^/]+\//.test(line) && !line.startsWith("/app/"));
    const bt = ["/gems/rack-1.0/lib/rack.rb", "/app/lib/uses_gems/code.rb"];
    expect(cleaner.clean(bt)).toEqual(["/app/lib/uses_gems/code.rb"]);
  });
});

describe("BacktraceCleanerFilterTest", () => {
  let bc: BacktraceCleaner;

  beforeEach(() => {
    bc = new BacktraceCleaner();
    bc.addFilter((line) => line.replaceAll("/my/prefix", ""));
  });

  it("backtrace should filter all lines in a backtrace, removing prefixes", () => {
    expect(bc.clean(["/my/prefix/my/class.rb", "/my/prefix/my/module.rb"])).toEqual([
      "/my/class.rb",
      "/my/module.rb",
    ]);
  });

  it("backtrace cleaner should allow removing filters", () => {
    bc.removeFilters();
    expect(bc.clean(["/my/prefix/my/class.rb"])[0]).toEqual("/my/prefix/my/class.rb");
  });

  it("backtrace should contain unaltered lines if they don't match a filter", () => {
    expect(bc.clean(["/my/other_prefix/my/class.rb"])[0]).toEqual("/my/other_prefix/my/class.rb");
  });

  it("#dup also copy filters", () => {
    const copy = bc.dup();
    bc.addFilter((line) => line.replaceAll("/other/prefix/", ""));

    expect(bc.clean(["/other/prefix/my/class.rb"])[0]).toEqual("my/class.rb");
    expect(copy.clean(["/other/prefix/my/class.rb"])[0]).toEqual("/other/prefix/my/class.rb");
  });
});

describe("BacktraceCleanerSilencerTest", () => {
  let bc: BacktraceCleaner;

  beforeEach(() => {
    bc = new BacktraceCleaner();
    bc.addSilencer((line) => line.includes("mongrel"));
  });

  it("backtrace should not contain lines that match the silencer", () => {
    expect(bc.clean(["/mongrel/class.rb", "/other/class.rb", "/mongrel/stuff.rb"])).toEqual([
      "/other/class.rb",
    ]);
  });

  it("backtrace cleaner should allow removing silencer", () => {
    bc.removeSilencers();
    expect(bc.clean(["/mongrel/stuff.rb"])).toEqual(["/mongrel/stuff.rb"]);
  });

  it("#dup also copy silencers", () => {
    const copy = bc.dup();

    bc.addSilencer((line) => line.includes("puma"));
    expect(bc.clean(["/puma/stuff.rb"])).toEqual([]);
    expect(copy.clean(["/puma/stuff.rb"])).toEqual(["/puma/stuff.rb"]);
  });
});

describe("BacktraceCleanerMultipleSilencersTest", () => {
  let bc: BacktraceCleaner;

  beforeEach(() => {
    bc = new BacktraceCleaner();
    bc.addSilencer((line) => line.includes("mongrel"));
    bc.addSilencer((line) => line.includes("yolo"));
  });

  it("backtrace should not contain lines that match the silencers", () => {
    expect(
      bc.clean(["/mongrel/class.rb", "/other/class.rb", "/mongrel/stuff.rb", "/other/yolo.rb"]),
    ).toEqual(["/other/class.rb"]);
  });

  it("backtrace should only contain lines that match the silencers", () => {
    expect(
      bc.clean(
        ["/mongrel/class.rb", "/other/class.rb", "/mongrel/stuff.rb", "/other/yolo.rb"],
        "noise",
      ),
    ).toEqual(["/mongrel/class.rb", "/mongrel/stuff.rb", "/other/yolo.rb"]);
  });
});

describe("BacktraceCleanerKindTest", () => {
  function build() {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/gems/rack-1.0/", "[gem] "));
    cleaner.addSilencer((line) => line.includes("[gem]"));
    return cleaner;
  }

  it("clean with :silent returns non-silenced filtered lines", () => {
    const cleaner = build();
    expect(cleaner.clean(["/gems/rack-1.0/lib/rack.rb", "/app/foo.rb"])).toEqual(["/app/foo.rb"]);
  });

  it("clean with :noise returns silenced filtered lines", () => {
    const cleaner = build();
    expect(cleaner.clean(["/gems/rack-1.0/lib/rack.rb", "/app/foo.rb"], "noise")).toEqual([
      "[gem] lib/rack.rb",
    ]);
  });

  it("clean with :all returns every filtered line", () => {
    const cleaner = build();
    expect(cleaner.clean(["/gems/rack-1.0/lib/rack.rb", "/app/foo.rb"], "all")).toEqual([
      "[gem] lib/rack.rb",
      "/app/foo.rb",
    ]);
  });

  it("cleanFrame default returns the filtered frame when not silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/app/foo.rb")).toBe("/app/foo.rb");
  });

  it("cleanFrame default returns undefined when silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/gems/rack-1.0/lib/rack.rb")).toBeUndefined();
  });

  it("cleanFrame with :noise returns undefined when not silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/app/foo.rb", "noise")).toBeUndefined();
  });

  it("cleanFrame with :noise returns the filtered frame when silenced", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/gems/rack-1.0/lib/rack.rb", "noise")).toBe("[gem] lib/rack.rb");
  });

  it("cleanFrame with :all returns the filtered frame regardless of silencers", () => {
    const cleaner = build();
    expect(cleaner.cleanFrame("/gems/rack-1.0/lib/rack.rb", "all")).toBe("[gem] lib/rack.rb");
    expect(cleaner.cleanFrame("/app/foo.rb", "all")).toBe("/app/foo.rb");
  });
});

describe("BacktraceCleanerFilterAndSilencerTest", () => {
  it("backtrace should not silence lines that has first had their silence hook filtered out", () => {
    const filters: Array<(line: string) => string> = [];
    const silencers: Array<(line: string) => boolean> = [];
    function clean(lines: string[]) {
      return lines
        .map((line) => filters.reduce((l, f) => f(l), line))
        .filter((line) => !silencers.some((s) => s(line)));
    }

    filters.push((line) => line.replace("/gems/rack-1.0", ""));
    silencers.push((line) => line.includes("/gems/"));

    const bt = ["/gems/rack-1.0/lib/rack.rb"];
    expect(clean(bt)).toEqual(["/lib/rack.rb"]);
  });
});
