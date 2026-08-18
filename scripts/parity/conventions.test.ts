import { describe, it, expect } from "vitest";
import {
  snakeToCamel,
  rubyMethodToTs,
  rubyMethodToTsIgnoringSkip,
  SKIP_TS_MIRROR_IS_DRIFT,
  rubyFileToTs,
  RUBY_FILE_TS_OVERRIDES,
  hasRubyFileTsOverride,
  rubyFileTsOverride,
  SKIP,
  SKIP_GROUPS,
  ARITY_OVERRIDE_GROUPS,
  isArityOverridden,
  RUBY_ONLY_CLASSES,
  SCOPED_SKIP_GROUPS,
  scopedSkipMirrorName,
  isRubyOnlyClass,
  isScopedSkip,
  ALREADY_PREDICATE_PREFIXES,
  TOKEN_RENAMES,
  explainConventions,
} from "./conventions.js";

describe("snakeToCamel", () => {
  it("converts standard snake_case to camelCase", () => {
    expect(snakeToCamel("has_many")).toBe("hasMany");
    expect(snakeToCamel("dispatch_cache")).toBe("dispatchCache");
    expect(snakeToCamel("collect_optimizer_hints")).toBe("collectOptimizerHints");
  });

  it("preserves leading underscores", () => {
    expect(snakeToCamel("_load_from")).toBe("_loadFrom");
    expect(snakeToCamel("_extract")).toBe("_extract");
  });

  it("collapses underscore-before-Capital so Rails dot-notation names camelCase cleanly", () => {
    // Drives the parity:api bridge that lets `visit_Arel_Nodes_X` Ruby
    // methods match `visitArelNodesX` TS methods.
    expect(snakeToCamel("visit_Arel_Nodes_SelectStatement")).toBe("visitArelNodesSelectStatement");
    expect(snakeToCamel("visit_Arel_Table")).toBe("visitArelTable");
    expect(snakeToCamel("visit_Arel_Attributes_Attribute")).toBe("visitArelAttributesAttribute");
    expect(snakeToCamel("visit_ActiveModel_Attribute")).toBe("visitActiveModelAttribute");
  });

  it("collapses runs of underscores (Ruby private-alias-target convention)", () => {
    // `def visit__regexp` in Rails dot.rb is the private alias target for
    // `visit_Arel_Nodes_Regexp` and friends. The TS form is `visitRegexp`
    // — runs of underscores collapse the same as a single underscore.
    expect(snakeToCamel("visit__regexp")).toBe("visitRegexp");
    expect(snakeToCamel("visit__no_edges")).toBe("visitNoEdges");
    expect(snakeToCamel("visit__children")).toBe("visitChildren");
  });

  it("handles single-segment names unchanged", () => {
    expect(snakeToCamel("name")).toBe("name");
    expect(snakeToCamel("expr")).toBe("expr");
  });

  it("renames `erb` token to `tse` (trails uses .tse in place of .erb)", () => {
    expect(snakeToCamel("erb")).toBe("tse");
    expect(snakeToCamel("erb_handler")).toBe("tseHandler");
    expect(snakeToCamel("compile_erb")).toBe("compileTse");
    expect(snakeToCamel("compile_erb_template")).toBe("compileTseTemplate");
    expect(snakeToCamel("_erb_source")).toBe("_tseSource");
  });

  it("renames `ERB` and `Erb` constant-token casings (dot-notation names)", () => {
    // Mirrors the `visit_Arel_Nodes_X` dot-notation pattern: Ruby methods that
    // walk constants embed module names verbatim as snake segments. ERB-token
    // constants (both ALL-CAPS like `ERB` and PascalCase like `Erb`) must
    // rename the same way for parity:api to match the TS counterpart.
    expect(snakeToCamel("visit_ERB")).toBe("visitTSE");
    expect(snakeToCamel("visit_ERB_Template")).toBe("visitTSETemplate");
    expect(snakeToCamel("visit_Erb_Node")).toBe("visitTseNode");
  });

  it("renames `rb` token to `js` (a Ruby source file is a JS one)", () => {
    // I18n::Backend::Base#load_rb evaluates a locale file written as executable
    // source in the host language; its port loads a `.js` locale module, so
    // `load_rb` has to resolve to `loadJs` for parity:api to match it.
    expect(snakeToCamel("load_rb")).toBe("loadJs");
    expect(snakeToCamel("rb")).toBe("js");
    expect(snakeToCamel("rb_handler")).toBe("jsHandler");
  });

  it("renames an `ERB` token that ends at a CamelCase boundary, not just `_`", () => {
    // Ruby class names arrive as one unsplit segment (`ERBUtilTest`), so a
    // rename that only ended at `_` or end-of-name left them spelled `ERB`
    // while `erb_util` became `tseUtil`. The token ends at the next capital
    // too, so a constant fragment carries the rename.
    expect(snakeToCamel("ERBUtilTest")).toBe("TSEUtilTest");
    expect(snakeToCamel("ErbTracker")).toBe("TseTracker");
    expect(snakeToCamel("erbHandler")).toBe("tseHandler");
    expect(snakeToCamel("visit_ERBUtil")).toBe("visitTSEUtil");
  });

  it("does NOT rename a CamelCase word that merely starts with `erb`", () => {
    // The `[A-Z]` lookahead widened where a token may END; it did not widen
    // where one may START. `Herbert` fails on the `H` before `erb`, and
    // `VerbMatcher` on the `V` — both would be renamed by a bare substring
    // rule.
    expect(snakeToCamel("Herbert")).toBe("Herbert");
    expect(snakeToCamel("VerbMatcher")).toBe("VerbMatcher");
    expect(snakeToCamel("http_VerbList")).toBe("httpVerbList");
    expect(snakeToCamel("SuperbThing")).toBe("SuperbThing");
  });

  it("does NOT rename `erb` when it appears as a substring of another token", () => {
    // Guard: only standalone snake-case segments should be substituted,
    // not embedded substrings like `verb`, `verbatim`, `superb`, `reverb`.
    expect(snakeToCamel("verb")).toBe("verb");
    expect(snakeToCamel("verbatim_copy")).toBe("verbatimCopy");
    expect(snakeToCamel("http_verb")).toBe("httpVerb");
    expect(snakeToCamel("superb_thing")).toBe("superbThing");
    // `erb` must keep winning the alternation over the shorter `rb`.
    expect(snakeToCamel("compile_erb")).toBe("compileTse");
  });

  it("honors every TOKEN_RENAMES entry", () => {
    // The `rb: js` entry was dead code on main until #6043 — the table and the
    // substitution's alternation were two sources of truth and drifted. The
    // pattern is derived from the table now; this asserts every key is reachable
    // so a future entry cannot go unhonored while the generated conventions doc
    // advertises it as live.
    for (const [tok, renamed] of Object.entries(TOKEN_RENAMES)) {
      expect(snakeToCamel(tok)).toBe(renamed);
      expect(snakeToCamel(`load_${tok}`)).toBe(
        `load${renamed[0].toUpperCase()}${renamed.slice(1)}`,
      );
    }
  });

  it("honors every TOKEN_RENAMES entry in file paths too", () => {
    // The file-path substitution used to restate `erb` as a third hard-coded
    // spelling of the table, so a new entry reached method names and NOT paths
    // — the same dead-code shape the `rb` entry had. Both patterns derive from
    // the table now.
    for (const [tok, renamed] of Object.entries(TOKEN_RENAMES)) {
      expect(rubyFileToTs(`${tok}.rb`)).toBe(`${renamed}.ts`);
      expect(rubyFileToTs(`${tok}/util.rb`)).toBe(`${renamed}/util.ts`);
      expect(rubyFileToTs(`core_ext/${tok}_util.rb`)).toBe(`core-ext/${renamed}-util.ts`);
    }
  });

  it("does NOT rename a file-path token that appears as a substring", () => {
    expect(rubyFileToTs("http_verb.rb")).toBe("http-verb.ts");
    expect(rubyFileToTs("superb/thing.rb")).toBe("superb/thing.ts");
  });
});

describe("rubyMethodToTsIgnoringSkip", () => {
  it("maps SKIP names that rubyMethodToTs refuses", () => {
    expect(rubyMethodToTs("freeze")).toBeNull();
    expect(rubyMethodToTsIgnoringSkip("freeze")).toEqual(["freeze"]);
    expect(rubyMethodToTsIgnoringSkip("lookup_cast_type")).toEqual(["lookupCastType"]);
    expect(rubyMethodToTsIgnoringSkip("pretty_print")).toEqual(["prettyPrint"]);
  });

  it("still refuses operators", () => {
    expect(rubyMethodToTsIgnoringSkip("==")).toBeNull();
  });
});

describe("SKIP_TS_MIRROR_IS_DRIFT", () => {
  it("covers the Ruby hook groups only", () => {
    expect([...SKIP_TS_MIRROR_IS_DRIFT].sort()).toEqual(
      [
        "append_features",
        "const_missing",
        "extended",
        "inherited",
        "included",
        "prepend_features",
        "singleton_method_added",
      ].sort(),
    );
  });
});

describe("rubyMethodToTs", () => {
  it("special-cases the common Ruby → JS aliases", () => {
    expect(rubyMethodToTs("to_s")).toEqual(["toString"]);
    expect(rubyMethodToTs("to_str")).toEqual(["toString"]);
    expect(rubyMethodToTs("to_json")).toEqual(["toJSON"]);
    expect(rubyMethodToTs("to_sql")).toEqual(["toSql"]);
    expect(rubyMethodToTs("initialize")).toEqual(["constructor"]);
  });

  it("transforms bang methods to *Bang", () => {
    expect(rubyMethodToTs("save!")).toEqual(["saveBang"]);
  });

  it("strips the trailing `=` from setter methods", () => {
    expect(rubyMethodToTs("name=")).toEqual(["name", "setName"]);
  });

  it("orders the setX candidate after the bare accessor for setter methods", () => {
    expect(rubyMethodToTs("table_name=")).toEqual(["tableName", "setTableName"]);
    // Underscore-prefixed storage slots get no `setX` candidate at all.
    expect(rubyMethodToTs("_load_from=")).toEqual(["_loadFrom"]);
  });

  it("offers setX first when the Ruby reader of the same base also exists", () => {
    const siblings = new Set(["beginning_of_week", "beginning_of_week="]);
    expect(rubyMethodToTs("beginning_of_week=", siblings)).toEqual([
      "setBeginningOfWeek",
      "beginningOfWeek",
    ]);
    // No paired reader: the bare accessor still comes first.
    expect(rubyMethodToTs("table_name=", new Set(["table_name="]))).toEqual([
      "tableName",
      "setTableName",
    ]);
    // A Ruby `set_#{base}` of its own already owns the `setX` spelling.
    expect(
      rubyMethodToTs(
        "content_type=",
        new Set(["content_type", "content_type=", "set_content_type"]),
      ),
    ).toEqual(["contentType", "setContentType"]);
    // A paired reader does not conjure a `setX` for a storage slot.
    expect(rubyMethodToTs("_load_from=", new Set(["_load_from", "_load_from="]))).toEqual([
      "_loadFrom",
    ]);
  });

  it("camelCases capitalized snake-case visit method names", () => {
    expect(rubyMethodToTs("visit_Arel_Nodes_SelectStatement")).toEqual([
      "visitArelNodesSelectStatement",
    ]);
    expect(rubyMethodToTs("visit__no_edges")).toEqual(["visitNoEdges"]);
  });
});

describe("rubyMethodToTs predicates", () => {
  it("strips the redundant is-prefix when the Ruby name already starts with is_", () => {
    // No `isPrefixed` fallback — that would let trails authors land
    // isIsNumber and still get parity:api credit, defeating the rule.
    expect(rubyMethodToTs("is_number?")).toEqual(["isNumber", "isNumberQ"]);
    expect(rubyMethodToTs("is_integer?")).toEqual(["isInteger", "isIntegerQ"]);
    expect(rubyMethodToTs("is_hexadecimal_literal?")).toEqual([
      "isHexadecimalLiteral",
      "isHexadecimalLiteralQ",
    ]);
  });

  it("keeps prepending is for predicates that don't already start with one of the allowlisted prefixes", () => {
    expect(rubyMethodToTs("number?")).toEqual(["isNumber", "number", "numberQ"]);
    expect(rubyMethodToTs("blank?")).toEqual(["isBlank", "blank", "blankQ"]);
    expect(rubyMethodToTs("present?")).toEqual(["isPresent", "present", "presentQ"]);
  });

  it("does NOT treat names that merely camelize to start with 'is' as the is_*? family", () => {
    // The is_*? guard tests the Ruby BASE NAME, not the camel form.
    // `isolation_level?` camelizes to `isolationLevel` (starts with
    // 'is'), but the Ruby base doesn't start with `is_` — keep both
    // candidates so trails methods named either way still match.
    expect(rubyMethodToTs("isolation_level?")).toEqual([
      "isIsolationLevel",
      "isolationLevel",
      "isolationLevelQ",
    ]);
    expect(rubyMethodToTs("island?")).toEqual(["isIsland", "island", "islandQ"]);
  });

  it("keeps the existing has/supports/can/etc allowlist behavior intact (camel preferred, isPrefixed available as fallback)", () => {
    // Only the `is_*?` family loses the isPrefixed fallback. Other
    // Ruby predicate prefixes keep both candidates because trails
    // sometimes needs the disambiguating alias — Reflection exposes
    // `isHasOne()` alongside the `Model.hasOne` association
    // declaration, for example.
    expect(rubyMethodToTs("has_attribute?")).toEqual([
      "hasAttribute",
      "isHasAttribute",
      "hasAttributeQ",
    ]);
    expect(rubyMethodToTs("supports_savepoints?")).toEqual([
      "supportsSavepoints",
      "isSupportsSavepoints",
      "supportsSavepointsQ",
    ]);
    expect(rubyMethodToTs("can_load?")).toEqual(["canLoad", "isCanLoad", "canLoadQ"]);
    expect(rubyMethodToTs("should_retry?")).toEqual([
      "shouldRetry",
      "isShouldRetry",
      "shouldRetryQ",
    ]);
  });

  it("offers the native JS containment spelling for include?/member?/exclude?", () => {
    // A faithful `.includes()` port has neither camel candidate, so without
    // the third candidate every such port needs a bespoke ratchet exclude.
    expect(rubyMethodToTs("include?")).toEqual(["isInclude", "include", "includes", "includeQ"]);
    expect(rubyMethodToTs("member?")).toEqual(["isMember", "member", "includes", "memberQ"]);
    expect(rubyMethodToTs("exclude?")).toEqual(["isExclude", "exclude", "excludes", "excludeQ"]);
  });

  it("offers the quoted literal first when the Ruby file also defines the bare name", () => {
    // `Logger#debug?` (broadcast_logger.rb:167) sits next to `Logger#debug`,
    // so the camel candidate `debug` names the LOGGING method — the pairing
    // that reported BroadcastLogger's predicate bodies as call mismatches.
    // trails spells the predicate `get "debug?"`, which is what should win.
    expect(rubyMethodToTs("debug?", new Set(["debug"]))).toEqual([
      "debug?",
      "isDebug",
      "debug",
      "debugQ",
    ]);
    // No bare sibling — the candidate list is untouched.
    expect(rubyMethodToTs("debug?", new Set())).toEqual(["isDebug", "debug", "debugQ"]);
  });

  it("offers the Q suffix last for every predicate", () => {
    // `Q` is the query-method letter, and the spelling trails uses where the
    // bare camel name is already taken on the same TS object by an unrelated
    // Rails member — `connection_class` (core.rb:626) next to
    // `connection_class?`, `ActiveRecord.application_record_class`
    // (active_record.rb:354) next to `application_record_class?`
    // (core.rb:121) — and where the quoted literal is unreachable because the
    // member is a `static` called by name (`Base.primaryClassQ()`,
    // connection_handler.rb:67) or a named `export`.
    expect(rubyMethodToTs("active_connections?")?.at(-1)).toBe("activeConnectionsQ");
    expect(rubyMethodToTs("primary_class?")?.at(-1)).toBe("primaryClassQ");
    expect(rubyMethodToTs("connected_to?")?.at(-1)).toBe("connectedToQ");
    expect(rubyMethodToTs("readonly_attribute?")?.at(-1)).toBe("readonlyAttributeQ");
    expect(rubyMethodToTs("strict_locals?")?.at(-1)).toBe("strictLocalsQ");
  });

  it("keeps the Q spelling last so existing is-prefixed ports still match first", () => {
    // Widening the candidate list must never displace a live pairing.
    expect(rubyMethodToTs("blank?")?.[0]).toBe("isBlank");
    expect(rubyMethodToTs("has_attribute?")?.[0]).toBe("hasAttribute");
    expect(rubyMethodToTs("debug?", new Set(["debug"]))?.[0]).toBe("debug?");
  });

  it("keeps the containment spelling last so existing isInclude ports still match first", () => {
    // CollectionAssociation#isInclude and Clusivity#isInclude are live ports;
    // widening the candidate list must never displace them.
    expect(rubyMethodToTs("include?")?.[0]).toBe("isInclude");
  });
});

describe("rubyFileToTs", () => {
  it("snake-case → kebab-case .ts", () => {
    expect(rubyFileToTs("validations/numericality.rb")).toBe("validations/numericality.ts");
    expect(rubyFileToTs("connection_adapters/postgresql_adapter.rb")).toBe(
      "connection-adapters/postgresql-adapter.ts",
    );
  });

  it("aliases `railtie` basename → `trailtie` across all framework source roots", () => {
    // The path-segment alias table applies globally — no per-package
    // override needed. Any framework's `railtie.rb` maps to `trailtie.ts`.
    expect(rubyFileToTs("railtie.rb", "activerecord")).toBe("trailtie.ts");
    expect(rubyFileToTs("railtie.rb", "actioncontroller")).toBe("trailtie.ts");
    expect(rubyFileToTs("railtie.rb", "trailties")).toBe("trailtie.ts");
  });

  it("aliases `railties` directory segment → `trailties` across all framework source roots", () => {
    expect(rubyFileToTs("railties/helpers.rb", "actioncontroller")).toBe("trailties/helpers.ts");
    expect(rubyFileToTs("railties/asset_paths.rb", "actioncontroller")).toBe(
      "trailties/asset-paths.ts",
    );
    expect(rubyFileToTs("railties/routes_helpers.rb", "abstractcontroller")).toBe(
      "trailties/routes-helpers.ts",
    );
    // The alias is global, not per-package — any framework's railties/
    // subdir maps to trailties/ uniformly.
    expect(rubyFileToTs("railties/some_file.rb", "actiondispatch")).toBe("trailties/some-file.ts");
  });

  it("prefers an explicit per-package override over the kebab-case rule", () => {
    // Rails splits the Inflector across inflector/methods.rb and the String
    // delegators; trails ports both onto the one inflector.ts.
    expect(rubyFileToTs("inflector/methods.rb", "activesupport")).toBe("inflector.ts");
    expect(rubyFileToTs("core_ext/string/inflections.rb", "activesupport")).toBe("inflector.ts");
  });

  it("scopes overrides to their package", () => {
    expect(rubyFileToTs("inflector/methods.rb", "activerecord")).toBe("inflector/methods.ts");
    expect(rubyFileToTs("inflector/methods.rb")).toBe("inflector/methods.ts");
  });
});

describe("RUBY_FILE_TS_OVERRIDES", () => {
  it("keys every entry as <package>:<ruby path> and maps to a .ts file", () => {
    for (const [key, value] of Object.entries(RUBY_FILE_TS_OVERRIDES)) {
      expect(key).toMatch(/^[a-z0-9-]+:.+\.rb$/);
      expect(value).toMatch(/\.ts$/);
    }
  });

  it("reports override membership only for the owning package", () => {
    expect(hasRubyFileTsOverride("inflector/methods.rb", "activesupport")).toBe(true);
    expect(hasRubyFileTsOverride("inflector/methods.rb", "activerecord")).toBe(false);
    expect(hasRubyFileTsOverride("inflector/methods.rb")).toBe(false);
    expect(hasRubyFileTsOverride("inflector/inflections.rb", "activesupport")).toBe(false);
  });

  it("returns the mapped TS file, or undefined when unmapped", () => {
    expect(rubyFileTsOverride("inflector/methods.rb", "activesupport")).toBe("inflector.ts");
    expect(rubyFileTsOverride("inflector/inflections.rb", "activesupport")).toBeUndefined();
  });

  it("pins the Integer core_ext bucket to the package barrel", () => {
    expect(rubyFileTsOverride("core_ext/integer/inflections.rb", "activesupport")).toBe("index.ts");
  });

  it("maps i18n's umbrella and interpolate files into packages/i18n/src", () => {
    // `lib/i18n.rb` is scanned one level above libPath, so the default rule
    // would place it at `../i18n.ts`, outside src. `interpolate/ruby.rb`
    // reopens `module I18n` — whose bucket `backend/cache.rb` owns — so
    // without an override its methods are measured against an unported file.
    expect(rubyFileToTs("../i18n.rb", "i18n")).toBe("i18n.ts");
    expect(rubyFileToTs("interpolate/ruby.rb", "i18n")).toBe("interpolate/ruby.ts");
  });

  it("maps the activesupport calculations.rb reopenings onto their receiver's file", () => {
    // `Time`, `Date` and `DateTime` are each first reopened elsewhere
    // (object/blank.rb:186, date/acts_like.rb:5, date_time/acts_like.rb:6), so
    // without these the 129 methods the calculations.rb files add are measured
    // against files that define none of them. `Date` is its own receiver: its
    // calculations widen through `in_time_zone` (date/calculations.rb:55-87)
    // rather than operating on an instant. `DateTime` is its own receiver too:
    // its calculations answer a civil date at an offset rather than an instant.
    // Both files sit at the Rails path the default rule already produces; the
    // entries are what split the buckets off `date/acts_like.rb` and
    // `date_time/acts_like.rb`, those two classes' first reopenings.
    expect(rubyFileToTs("core_ext/time/calculations.rb", "activesupport")).toBe("time-ext.ts");
    expect(rubyFileToTs("core_ext/date/calculations.rb", "activesupport")).toBe(
      "core-ext/date/calculations.ts",
    );
    expect(rubyFileToTs("core_ext/date_time/calculations.rb", "activesupport")).toBe(
      "core-ext/date-time/calculations.ts",
    );
    expect(rubyFileToTs("core_ext/date_time/conversions.rb", "activesupport")).toBe(
      "core-ext/date-time/conversions.ts",
    );
  });

  it("gives core_ext/object/json.rb its own bucket", () => {
    // `Object`, `Time`, `Hash` and the rest are each first opened by another
    // core_ext file, so without the entry their `as_json` buckets there —
    // `Object#as_json` under `object/acts_like.rb`, whose expected TS file does
    // not exist, so the misplaced-file cluster landed it on the `index.ts`
    // barrel and paired it with `TimeWithZone#asJson`.
    expect(hasRubyFileTsOverride("core_ext/object/json.rb", "activesupport")).toBe(true);
    expect(rubyFileToTs("core_ext/object/json.rb", "activesupport")).toBe(
      "core-ext/object/json.ts",
    );
  });

  it("leaves date/acts_like.rb on the default kebab-case rule", () => {
    expect(hasRubyFileTsOverride("core_ext/date/acts_like.rb", "activesupport")).toBe(false);
  });

  it("buckets core_ext/date_time/acts_like.rb onto the Compatibility module", () => {
    // It is DateTime's FIRST reopening, so `preserve_timezone` and
    // `utc_to_local_returns_utc_offset_times` — mixed in from
    // `date_and_time/compatibility.rb` — are stamped with a file that defines
    // neither. trails carries that pair on the one Compatibility module.
    expect(hasRubyFileTsOverride("core_ext/date_time/acts_like.rb", "activesupport")).toBe(true);
    expect(rubyFileToTs("core_ext/date_time/acts_like.rb", "activesupport")).toBe(
      "core-ext/date-and-time/compatibility.ts",
    );
  });
});

describe("SKIP_GROUPS", () => {
  it("has no duplicate names across groups", () => {
    const all = SKIP_GROUPS.flatMap((g) => g.names);
    expect(all.length).toBe(new Set(all).size);
  });

  it("requires a non-empty reason for every group", () => {
    for (const g of SKIP_GROUPS) {
      expect(g.reason.trim().length).toBeGreaterThan(0);
      expect(g.names.length).toBeGreaterThan(0);
    }
  });

  it("makes rubyMethodToTs skip every grouped name", () => {
    for (const name of SKIP) {
      expect(rubyMethodToTs(name)).toBeNull();
    }
  });
});

describe("RUBY_ONLY_CLASSES", () => {
  it("requires a fully-qualified name and a non-empty reason per entry", () => {
    for (const c of RUBY_ONLY_CLASSES) {
      expect(c.fqn).toContain("::");
      expect(c.reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("recognises only the listed classes", () => {
    for (const c of RUBY_ONLY_CLASSES) expect(isRubyOnlyClass(c.fqn)).toBe(true);
    expect(isRubyOnlyClass("I18n::Backend::KeyValue")).toBe(false);
  });
});

describe("SCOPED_SKIP_GROUPS", () => {
  it("requires a non-empty reason, name, and file scope per group", () => {
    for (const g of SCOPED_SKIP_GROUPS) {
      expect(g.reason.trim().length).toBeGreaterThan(0);
      expect(g.names.length).toBeGreaterThan(0);
      expect(g.rubyFiles.length).toBeGreaterThan(0);
    }
  });

  it("never overlaps the global SKIP set (scoped names stay file-local)", () => {
    for (const g of SCOPED_SKIP_GROUPS) {
      for (const name of g.names) expect(SKIP.has(name)).toBe(false);
    }
  });

  it("skips each name only in its scoped Ruby files, never globally", () => {
    for (const g of SCOPED_SKIP_GROUPS) {
      for (const name of g.names) {
        for (const file of g.rubyFiles) expect(isScopedSkip(name, file)).toBe(true);
        expect(isScopedSkip(name, "some/other/unrelated.rb")).toBe(false);
      }
    }
  });

  it("scopes `initialize` to the prepended Rotator module, not to real classes", () => {
    expect(isScopedSkip("initialize", "messages/rotator.rb")).toBe(true);
    expect(isScopedSkip("initialize", "messages/message_verifier.rb")).toBe(false);
    expect(rubyMethodToTs("initialize")).toEqual(["constructor"]);
  });

  it("names the faithful TS spelling only where the scoped skip declares one", () => {
    expect(scopedSkipMirrorName("initialize", "messages/rotator.rb")).toBe("initialize");
    expect(scopedSkipMirrorName("initialize", "messages/message_verifier.rb")).toBeNull();
    expect(
      scopedSkipMirrorName("lookup_cast_type", "connection_adapters/postgresql/quoting.rb"),
    ).toBeNull();
  });

  it("scopes `-@` to AR value objects but not ActiveSupport::Duration", () => {
    expect(isScopedSkip("-@", "connection_adapters/deduplicable.rb")).toBe(true);
    expect(isScopedSkip("-@", "duration.rb")).toBe(false);
  });

  it("maps Ruby `-@` to `negate` globally (real surface outside the skip files)", () => {
    expect(rubyMethodToTs("-@")).toEqual(["negate"]);
  });
});

describe("ARITY_OVERRIDE_GROUPS", () => {
  it("has no duplicate names across groups", () => {
    const all = ARITY_OVERRIDE_GROUPS.flatMap((g) => g.names);
    expect(all.length).toBe(new Set(all).size);
  });

  it("requires a non-empty reason, name, and file scope per group", () => {
    for (const g of ARITY_OVERRIDE_GROUPS) {
      expect(g.reason.trim().length).toBeGreaterThan(0);
      expect(g.names.length).toBeGreaterThan(0);
      expect(g.rubyFiles.length).toBeGreaterThan(0);
    }
  });

  it("suppresses each name only in its scoped Ruby files, never globally", () => {
    for (const g of ARITY_OVERRIDE_GROUPS) {
      for (const name of g.names) {
        for (const file of g.rubyFiles) expect(isArityOverridden(name, file)).toBe(true);
        // A name scoped to specific files is NOT overridden in an unrelated file.
        expect(isArityOverridden(name, "some/other/unrelated.rb")).toBe(false);
      }
    }
  });
});

describe("ALREADY_PREDICATE_PREFIXES", () => {
  it("drives the matcher: every prefix keeps the camel form + is* fallback", () => {
    for (const prefix of ALREADY_PREDICATE_PREFIXES) {
      // `<prefix>_thing?` → [camel, isPrefixed], camel first.
      const camel = snakeToCamel(`${prefix}_thing`);
      const isPrefixed = "is" + camel.replace(/^./, (c) => c.toUpperCase());
      expect(rubyMethodToTs(`${prefix}_thing?`)).toEqual([camel, isPrefixed, `${camel}Q`]);
    }
  });

  it("is enumerated in full by the generated doc (not a hand-picked subset)", () => {
    const md = explainConventions();
    for (const prefix of ALREADY_PREDICATE_PREFIXES) {
      expect(md).toContain(`\`${prefix}_*?\``);
    }
  });
});

describe("explainConventions", () => {
  it("renders worked examples from the live rules and lists every skip reason", () => {
    const md = explainConventions();
    expect(md).toContain("`valid?` → `isValid` or `valid`");
    expect(md).toContain("`save!` → `saveBang`");
    // setter renders as a bare symbol name, never `tableName()`
    expect(md).toContain("`table_name=` → `tableName`");
    expect(md).not.toContain("`tableName()`");
    for (const g of SKIP_GROUPS) {
      expect(md).toContain(g.reason);
    }
    for (const g of ARITY_OVERRIDE_GROUPS) {
      expect(md).toContain(g.reason);
    }
    for (const g of SCOPED_SKIP_GROUPS) {
      expect(md).toContain(g.reason);
    }
  });
});
