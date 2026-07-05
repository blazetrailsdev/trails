import { describe, it, expect } from "vitest";
import { canonicalModelIndex } from "./canonical-model-index.js";
import { resolveModel } from "../associations.js";
import { deriveFixtureSchema } from "./use-fixtures.js";
import { TEST_SCHEMA } from "./test-schema.js";
import { Author } from "./models/author.js";
import { Post } from "./models/post.js";
import { Comment } from "./models/comment.js";
import { Owner } from "./models/owner.js";
import { Pet } from "./models/pet.js";
import { MyAppBusinessCompany } from "./models/company-in-module.js";

describe("canonical model autoload index (Zeitwerk analog)", () => {
  it("indexes canonical models by their class name", () => {
    // Association-target-only models (no fixture set of their own) are present
    // so they resolve on first reference without a manual `registerModel`.
    expect(canonicalModelIndex.get("Comment")).toBe(Comment);
    expect(canonicalModelIndex.get("Owner")).toBe(Owner);
  });

  it("indexes namespaced models under their `::`-qualified Ruby name", () => {
    // Rails resolves a namespaced association target through the namespace walk
    // (`MyApplication::Business::Company`), not the flat JS constructor name, so
    // the index must carry the qualified key for the walk to hit it.
    expect(canonicalModelIndex.get("MyApplication::Business::Company")).toBe(MyAppBusinessCompany);
    expect(resolveModel("MyApplication::Business::Company")).toBe(MyAppBusinessCompany);
  });

  it("resolveModel autoloads an indexed model on a registry miss", () => {
    // Whether or not another test already registered it, resolveModel returns
    // the canonical class — the fallback covers the un-registered case.
    expect(resolveModel("Comment")).toBe(Comment);
    expect(resolveModel("Owner")).toBe(Owner);
  });

  it("autoloads an association-target model through reflection's computeClass", () => {
    // `Pet belongsTo owner` names `Owner` only as a target — no fixture set, no
    // manual `registerModel`. Resolving the reflection's `.klass` must autoload
    // it via the fallback (reflection.ts computeClass), the empirical anchor for
    // this part (HasManyReflection/BelongsToReflection._klass).
    const refl = (
      Pet as unknown as { _reflectOnAssociation(name: string): { klass: unknown } }
    )._reflectOnAssociation("owner");
    expect(refl.klass).toBe(Owner);
  });

  it("keeps deriveFixtureSchema bounded with the autoload index installed", async () => {
    // Importing this module installed the autoload index globally, so every
    // through/HABTM target now resolves instead of throwing. `deriveFixtureSchema`
    // must still slice ONLY the requested sets' tables plus their HABTM join
    // tables — never the whole transitively-reachable graph. `posts` owns the
    // HABTM `categories_posts`; `has_many :through` join tables (taggings,
    // categorizations, readers, …) belong to real models and are NOT pulled in.
    void Author; // resolves the requested sets through the same globally-installed index
    void Post;
    const sub = await deriveFixtureSchema(["authors", "posts"], TEST_SCHEMA);
    expect(Object.keys(sub).sort()).toEqual(["authors", "categories_posts", "posts"]);
  });

  it("throws a constant-not-found error for a genuine miss", () => {
    // A name in neither the registry nor the index must still throw, so the
    // fallback can never silently mask a missing or misnamed model.
    expect(() => resolveModel("NoSuchCanonicalModel")).toThrow(
      /uninitialized constant NoSuchCanonicalModel/,
    );
  });
});
