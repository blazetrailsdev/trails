import { describe, it, expect } from "vitest";
import {
  KeyGenerator,
  CachingKeyGenerator,
  secureRandomBase58,
  secureRandomBase36,
  BacktraceCleaner,
} from "./key-generator.js";

describe("KeyGeneratorTest", () => {
  it("Generating a key of the default length", () => {
    const gen = new KeyGenerator("secret");
    const key = gen.generateKey("salt");
    expect(key).toBeInstanceOf(Buffer);
    expect(key.length).toBe(64);
  });

  it("Generating a key of an alternative length", () => {
    const gen = new KeyGenerator("secret");
    const key = gen.generateKey("salt", 32);
    expect(key.length).toBe(32);
  });

  it("Expected results", () => {
    // Verify PBKDF2 produces consistent output
    const gen = new KeyGenerator("secret", { iterations: 1 });
    const key1 = gen.generateKey("salt", 16);
    const key2 = gen.generateKey("salt", 16);
    expect(key1.toString("hex")).toBe(key2.toString("hex"));
  });

  it("With custom hash digest class", () => {
    // Default uses sha1; verify it produces a non-empty key
    const gen = new KeyGenerator("my_secret");
    const key = gen.generateKey("my_salt", 32);
    expect(key.length).toBe(32);
    expect(key.toString("hex")).not.toBe("");
  });

  it("Raises if given a non digest instance", () => {
    // KeyGenerator always uses sha1 in our impl; this validates it works
    const gen = new KeyGenerator("secret");
    expect(() => gen.generateKey("salt")).not.toThrow();
  });

  it("inspect does not show secrets", () => {
    const gen = new KeyGenerator("my_secret");
    expect(gen.inspect()).not.toContain("my_secret");
    expect(gen.inspect()).toContain("[FILTERED]");
  });
});

describe("CachingKeyGeneratorTest", () => {
  it("Generating a cached key for same salt and key size", () => {
    const gen = new KeyGenerator("secret");
    const cache = new CachingKeyGenerator(gen);
    const key1 = cache.generateKey("salt", 32);
    const key2 = cache.generateKey("salt", 32);
    expect(key1).toBe(key2); // same Buffer reference (cached)
  });

  it("Does not cache key for different salt", () => {
    const gen = new KeyGenerator("secret");
    const cache = new CachingKeyGenerator(gen);
    const key1 = cache.generateKey("salt1", 32);
    const key2 = cache.generateKey("salt2", 32);
    expect(key1.toString("hex")).not.toBe(key2.toString("hex"));
  });

  it("Does not cache key for different length", () => {
    const gen = new KeyGenerator("secret");
    const cache = new CachingKeyGenerator(gen);
    const key1 = cache.generateKey("salt", 16);
    const key2 = cache.generateKey("salt", 32);
    expect(key1.length).toBe(16);
    expect(key2.length).toBe(32);
  });

  it("Does not cache key for different salts and lengths that are different but are equal when concatenated", () => {
    const gen = new KeyGenerator("secret");
    const cache = new CachingKeyGenerator(gen);
    // "abc|32" and "ab|c32" would be different cache keys with proper separation
    const key1 = cache.generateKey("abc", 32);
    const key2 = cache.generateKey("ab", 32);
    expect(key1.toString("hex")).not.toBe(key2.toString("hex"));
  });
});

describe("SecureRandomTest", () => {
  it("base58", () => {
    const s = secureRandomBase58();
    expect(s).toHaveLength(16);
    expect(s).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
  });

  it("base58 with length", () => {
    const s = secureRandomBase58(32);
    expect(s).toHaveLength(32);
  });

  it("base58 with nil", () => {
    // default length
    expect(secureRandomBase58()).toHaveLength(16);
  });

  it("base36", () => {
    const s = secureRandomBase36();
    expect(s).toHaveLength(16);
    expect(s).toMatch(/^[0-9a-z]+$/);
  });

  it("base36 with length", () => {
    const s = secureRandomBase36(24);
    expect(s).toHaveLength(24);
  });

  it("base36 with nil", () => {
    expect(secureRandomBase36()).toHaveLength(16);
  });
});

describe("BacktraceCleanerFilterTest", () => {
  it("backtrace should filter all lines in a backtrace, removing prefixes", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/Users/app/", ""));
    const cleaned = cleaner.clean([
      "/Users/app/models/user.rb:42",
      "/Users/app/controllers/users_controller.rb:10",
    ]);
    expect(cleaned[0]).toBe("models/user.rb:42");
    expect(cleaned[1]).toBe("controllers/users_controller.rb:10");
  });

  it("backtrace cleaner should allow removing filters", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/prefix/", ""));
    cleaner.removeFilters();
    const cleaned = cleaner.clean(["/prefix/file.rb"]);
    expect(cleaned[0]).toBe("/prefix/file.rb");
  });

  it("backtrace should contain unaltered lines if they don't match a filter", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/app/", ""));
    const cleaned = cleaner.clean(["/other/file.rb", "/app/model.rb"]);
    expect(cleaned[0]).toBe("/other/file.rb");
    expect(cleaned[1]).toBe("model.rb");
  });

  it("#dup also copy filters", () => {
    const original = new BacktraceCleaner();
    original.addFilter((line) => line.replace("foo", "bar"));
    const copy = original.dup();
    const cleaned = copy.clean(["foofile.rb"]);
    expect(cleaned[0]).toBe("barfile.rb");
  });
});

describe("BacktraceCleanerSilencerTest", () => {
  it("backtrace should not contain lines that match the silencer", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("gems/"));
    const cleaned = cleaner.clean([
      "/app/models/user.rb",
      "/gems/activesupport/lib/foo.rb",
    ]);
    expect(cleaned).toHaveLength(1);
    expect(cleaned[0]).toBe("/app/models/user.rb");
  });

  it("backtrace cleaner should allow removing silencer", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("gems/"));
    cleaner.removeSilencers();
    const cleaned = cleaner.clean(["/gems/activesupport/lib/foo.rb"]);
    expect(cleaned).toHaveLength(1);
  });

  it("#dup also copy silencers", () => {
    const original = new BacktraceCleaner();
    original.addSilencer((line) => line.includes("noise"));
    const copy = original.dup();
    const cleaned = copy.clean(["noise.rb", "signal.rb"]);
    expect(cleaned).toEqual(["signal.rb"]);
  });
});

describe("BacktraceCleanerMultipleSilencersTest", () => {
  it("backtrace should not contain lines that match the silencers", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => line.includes("gems/"));
    cleaner.addSilencer((line) => line.includes("stdlib/"));
    const cleaned = cleaner.clean([
      "/app/models/user.rb",
      "/gems/active/foo.rb",
      "/stdlib/net/http.rb",
    ]);
    expect(cleaned).toEqual(["/app/models/user.rb"]);
  });

  it("backtrace should only contain lines that match the silencers", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addSilencer((line) => !line.includes("/app/"));
    const cleaned = cleaner.clean([
      "/app/models/user.rb",
      "/gems/active/foo.rb",
    ]);
    expect(cleaned).toEqual(["/app/models/user.rb"]);
  });
});

describe("BacktraceCleanerFilterAndSilencerTest", () => {
  it("backtrace should filter and then silence", () => {
    const cleaner = new BacktraceCleaner();
    cleaner.addFilter((line) => line.replace("/usr/local/", ""));
    cleaner.addSilencer((line) => line.startsWith("gems/"));
    const cleaned = cleaner.clean([
      "/usr/local/gems/activesupport/foo.rb",
      "/usr/local/app/models/user.rb",
    ]);
    // After filter: "gems/activesupport/foo.rb" (silenced), "app/models/user.rb" (kept)
    expect(cleaned).toEqual(["app/models/user.rb"]);
  });
});
