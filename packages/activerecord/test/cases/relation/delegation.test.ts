import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { beforeEach, describe, it, expect } from "vitest";
import { publicInstanceMethods } from "@blazetrails/activesupport";
import { assertNotRespondTo, assertRespondTo } from "@blazetrails/activesupport/testing/assertions";
import { Base, Relation } from "../../../lib/index.js";
import * as Querying from "../../../lib/querying.js";
import { CollectionProxy } from "../../../lib/associations/collection-proxy.js";
import { Batches } from "../../../lib/relation/batches.js";
import { Calculations } from "../../../lib/relation/calculations.js";
import { FinderMethods } from "../../../lib/relation/finder-methods.js";
import { QueryMethods } from "../../../lib/relation/query-methods.js";
import { SpawnMethods } from "../../../lib/relation/spawn-methods.js";
import { fixtures } from "../../../lib/test-helpers/use-fixtures.js";
import { tsName } from "../../support/array-delegate-spellings.js";
import { Post } from "../../../lib/test-helpers/models/post.js";
import { Comment } from "../../models/comment.js";
import { Project } from "../../models/project.js";
import { Developer } from "../../models/developer.js";

const ARRAY_DELEGATES = [
  "+",
  "-",
  "|",
  "&",
  "[]",
  "shuffle",
  "all?",
  "collect",
  "compact",
  "detect",
  "each",
  "each_cons",
  "each_with_index",
  "exclude?",
  "find_all",
  "flat_map",
  "group_by",
  "include?",
  "length",
  "map",
  "none?",
  "one?",
  "partition",
  "reject",
  "reverse",
  "rotate",
  "sample",
  "second",
  "sort",
  "sort_by",
  "slice",
  "third",
  "index",
  "rindex",
  "to_ary",
  "to_set",
  "to_xml",
  "to_yaml",
  "join",
  "in_groups",
  "in_groups_of",
  "to_sentence",
  "to_formatted_s",
  "to_fs",
  "as_json",
  "intersect?",
] as const;

function DelegationTests(target: () => object): void {
  for (const method of ARRAY_DELEGATES) {
    it(`delegates ${method.replaceAll("_", " ")} to Array`, () => {
      assertRespondTo(target(), tsName(method));
    });
  }

  it("not respond to arel method", () => {
    assertNotRespondTo(target(), "exists");
  });
}

describe("DelegationAssociationTest", () => {
  constSet(TopLevel, "Post", Post);
  constSet(TopLevel, "Comment", Comment);

  DelegationTests(() => new Post().comments);
});

describe("DelegationRelationTest", () => {
  DelegationTests(() => Comment.all());
});

describe("DelegationRecordsTest", () => {
  let records: Comment[];
  beforeEach(async () => {
    records = await Comment.all().records();
  });

  DelegationTests(() => records);
});

describe("QueryingMethodsDelegationTest", () => {
  const QUERYING_METHODS = publicInstanceMethods(Batches, false)
    .concat(publicInstanceMethods(Calculations, false))
    .concat(publicInstanceMethods(FinderMethods, false))
    .filter(
      (method) => !["isInclude", "isMember", "raiseRecordNotFoundExceptionBang"].includes(method),
    )
    .concat(publicInstanceMethods(SpawnMethods, false))
    .filter((method) => !["spawn", "mergeBang"].includes(method))
    .concat(
      publicInstanceMethods(QueryMethods, false).filter(
        (method) => !/(=|Bang|Value|Values|Clause)$|^is[A-Z]/.test(method),
      ),
    )
    .filter(
      (method) =>
        !["all", "reverseOrder", "arel", "extensions", "constructJoinDependency"].includes(method),
    )
    .concat([
      "isAny",
      "isMany",
      "isNone",
      "isOne",
      "firstOrCreate",
      "firstOrCreateBang",
      "firstOrInitialize",
      "findOrCreateBy",
      "findOrCreateByBang",
      "findOrInitializeBy",
      "createOrFindBy",
      "createOrFindByBang",
      "destroy",
      "destroyAll",
      "delete",
      "deleteAll",
      "updateAll",
      "touchAll",
      "deleteBy",
      "destroyBy",
      "insert",
      "insertAll",
      "insertBang",
      "insertAllBang",
      "upsert",
      "upsertAll",
    ]);

  it("delegate querying methods", () => {
    const klass = class extends Base {
      static {
        this.tableName = "posts";
      }
    };

    expect([...QUERYING_METHODS].sort()).toEqual([...Querying.QUERYING_METHODS].sort());

    for (const method of QUERYING_METHODS) {
      assertRespondTo(klass.all(), method);
      assertRespondTo(klass, method);
    }
  });
});

describe("DelegationCachingTest", () => {
  const { projects } = fixtures(["projects", "developers", "developersProjects"]);

  constSet(TopLevel, "Project", Project);
  constSet(TopLevel, "Developer", Developer);

  it("delegation doesn't override methods defined in other relation subclasses", async () => {
    expect("target" in Relation.prototype).toEqual(false);
    expect("target" in CollectionProxy.prototype).toEqual(true);

    const ownerOf = (object: object, name: string): object | undefined => {
      for (let o: object | null = object; o; o = Object.getPrototypeOf(o)) {
        if (Object.hasOwn(o, name)) return o;
      }
      return undefined;
    };

    const project = projects("active_record");
    const proxy = (project as unknown as { developersWithCallbacks: object })
      .developersWithCallbacks;
    const original_owner = ownerOf(proxy, "target");
    expect(await (Developer.all() as unknown as { target(): Promise<string> }).target()).toEqual(
      "__target__",
    );
    expect(ownerOf(proxy, "target")).toBe(original_owner);
  });
});
