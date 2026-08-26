import { describe, it, expect } from "vitest";
import { entitiesByTsFile } from "./privates-entities.js";

describe("entitiesByTsFile", () => {
  const tsRelFor = (rubyFile: string) => `packages/i18n/src/${rubyFile.replace(/\.rb$/, ".ts")}`;

  it("lists a method-less entity sharing a file with a method-bearing one", () => {
    const fileEntities = new Map([
      ["backend/key_value.rb", new Set(["I18n", "Backend", "KeyValue", "Implementation"])],
    ]);
    expect(entitiesByTsFile(fileEntities, tsRelFor)).toEqual({
      "packages/i18n/src/backend/key_value.ts": ["Backend", "I18n", "Implementation", "KeyValue"],
    });
  });

  it("merges into an existing entry and skips a file with no entities", () => {
    const fileEntities = new Map([
      ["backend/key_value.rb", new Set(["KeyValue"])],
      ["backend/empty.rb", new Set<string>()],
    ]);
    const into = { "packages/i18n/src/backend/key_value.ts": ["Backend"] };
    expect(entitiesByTsFile(fileEntities, tsRelFor, into)).toEqual({
      "packages/i18n/src/backend/key_value.ts": ["Backend", "KeyValue"],
    });
  });
});
