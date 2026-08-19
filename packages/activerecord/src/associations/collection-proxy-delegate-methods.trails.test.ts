/**
 * Trails-only surface: pins the delegate-to-scope name list built at
 * `collection-proxy.ts:2493-2607` (`collection_proxy.rb:1128-1137`), derived
 * from `QueryMethodBangs` and `SpawnMethods`' own keys rather than
 * hand-transcribed. Guards two things: the derivation stays byte-identical to
 * the delegated set from before this story (pinned below — `leftJoins` /
 * `without` staying absent and `nullBang` / `rewhereBang` / `selectBang`
 * staying present are both deliberate for now; see
 * `collection-proxy-delegate-leftjoins-without-fix`), and no `query_methods.rb`
 * `protected` / `private` helper leaks onto `CollectionProxy` by way of riding
 * along in the mixin object's keys.
 */
import { describe, it, expect } from "vitest";
import { delegateMethods } from "./collection-proxy.js";

describe("CollectionProxy delegate-to-scope method list", () => {
  it("delegates the pinned set of scope method names, and nothing else", () => {
    expect([...delegateMethods].sort()).toEqual(
      [
        "includes",
        "all",
        "eagerLoad",
        "preload",
        "extractAssociated",
        "references",
        "with",
        "withRecursive",
        "joins",
        "leftOuterJoins",
        "includesBang",
        "eagerLoadBang",
        "preloadBang",
        "referencesBang",
        "withBang",
        "withRecursiveBang",
        "reselect",
        "reselectBang",
        "_selectBang",
        "selectBang",
        "group",
        "groupBang",
        "regroup",
        "regroupBang",
        "order",
        "orderBang",
        "inOrderOf",
        "reorder",
        "reorderBang",
        "unscope",
        "unscopeBang",
        "joinsBang",
        "leftOuterJoinsBang",
        "where",
        "whereBang",
        "rewhere",
        "rewhereBang",
        "invertWhere",
        "invertWhereBang",
        "structurallyCompatible",
        "and",
        "andBang",
        "or",
        "orBang",
        "having",
        "havingBang",
        "limit",
        "limitBang",
        "offset",
        "offsetBang",
        "lock",
        "lockBang",
        "none",
        "noneBang",
        "nullBang",
        "isNullRelation",
        "readonly",
        "readonlyBang",
        "strictLoading",
        "strictLoadingBang",
        "createWith",
        "createWithBang",
        "from",
        "fromBang",
        "distinct",
        "distinctBang",
        "extending",
        "extendingBang",
        "optimizerHints",
        "optimizerHintsBang",
        "reverseOrder",
        "reverseOrderBang",
        "skipQueryCacheBang",
        "skipPreloadingBang",
        "annotate",
        "annotateBang",
        "uniqBang",
        "excluding",
        "excludingBang",
        "arel",
        "constructJoinDependency",
        "spawn",
        "merge",
        "mergeBang",
        "except",
        "only",
        "scoping",
        "values",
        "insert",
        "insertAll",
        "insertBang",
        "insertAllBang",
        "upsert",
        "upsertAll",
        "loadAsync",
      ].sort(),
    );
  });

  it("never delegates a query_methods.rb protected/private helper", () => {
    const nonPublic = [
      "async",
      "asyncBang",
      "assertModifiableBang",
      "checkIfMethodHasArgumentsBang",
      "buildSubquery",
      "buildWhereClause",
      "buildHavingClause",
      "arelColumns",
      "buildNamedBoundSqlLiteral",
      "buildBoundSqlLiteral",
      "lookupTableKlassFromJoinDependencies",
      "eachJoinDependencies",
      "buildJoinDependencies",
      "buildArel",
      "buildCastValue",
      "buildFrom",
      "selectNamedJoins",
      "selectAssociationList",
      "buildJoinBuckets",
      "buildJoins",
      "buildSelect",
      "buildWith",
      "buildWithValueFromHash",
      "buildWithExpressionFromValue",
      "buildWithJoinNode",
      "arelColumnsFromHash",
      "arelColumnWithTable",
      "arelColumn",
      "isTableNameMatches",
      "reverseSqlOrder",
      "isDoesNotSupportReverse",
      "buildOrder",
      "validateOrderArgs",
      "flattenedArgs",
      "preprocessOrderArgs",
      "sanitizeOrderArguments",
      "columnReferences",
      "extractTableNameFrom",
      "orderColumn",
      "buildCaseForValuePosition",
      "resolveArelAttributes",
      "processSelectArgs",
      "arelColumnAliasesFromHash",
      "processWithArgs",
      "structurallyIncompatibleValuesFor",
    ];

    for (const name of nonPublic) {
      expect(delegateMethods).not.toContain(name);
    }
  });

  it("does not yet delegate leftJoins/without (tracked separately, kept out for byte-identical scope)", () => {
    expect(delegateMethods).not.toContain("leftJoins");
    expect(delegateMethods).not.toContain("without");
  });
});
