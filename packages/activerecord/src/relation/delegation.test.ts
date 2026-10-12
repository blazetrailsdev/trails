import { describe, it, expect } from "vitest";
import { assertNotRespondTo, assertRespondTo } from "@blazetrails/activesupport";
import { Base, Relation, registerModel } from "../index.js";
import * as Querying from "../querying.js";
import { CollectionProxy } from "../associations/collection-proxy.js";
import { fixtures } from "../test-fixtures.js";
import { tsName } from "../test-helpers/array-delegate-spellings.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Project } from "../test-helpers/models/project.js";
import { Developer } from "../test-helpers/models/developer.js";

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
  for (const method of ARRAY_DELEGATES.filter((method) => method !== "to_yaml")) {
    it(`delegates ${method.replaceAll("_", " ")} to Array`, () => {
      assertRespondTo(target(), tsName(method));
    });
  }

  it.skip("delegates to yaml to Array", () => {
    // BLOCKED: missing surface — to_yaml is Psych's Object#to_yaml (psych-object-to-yaml), and respond_to? does not answer it (respond-to-answers-object-to-yaml)
    assertRespondTo(target(), "toYaml");
  });

  it("not respond to arel method", () => {
    assertNotRespondTo(target(), "exists");
  });
}

describe("DelegationAssociationTest", () => {
  registerModel(Post);
  registerModel(Comment);

  DelegationTests(() => new Post().comments);
});

describe("DelegationRelationTest", () => {
  DelegationTests(() => Comment.all());
});

describe("QueryingMethodsDelegationTest", () => {
  const QUERYING_METHODS = [
    "where",
    "select",
    "reselect",
    "order",
    "reorder",
    "group",
    "regroup",
    "having",
    "limit",
    "offset",
    "distinct",
    "joins",
    "leftJoins",
    "leftOuterJoins",
    "includes",
    "preload",
    "eagerLoad",
    "references",
    "none",
    "from",
    "lock",
    "readonly",
    "rewhere",
    "unscope",
    "extending",
    "annotate",
    "optimizerHints",
    "or",
    "excluding",
    "and",
    "invertWhere",
    "inOrderOf",
    "strictLoading",
    "without",
    "only",
    "merge",
    "with",
    "withRecursive",
    "find",
    "findBy",
    "findByBang",
    "first",
    "firstBang",
    "last",
    "lastBang",
    "take",
    "takeBang",
    "second",
    "secondBang",
    "third",
    "thirdBang",
    "fourth",
    "fourthBang",
    "fifth",
    "fifthBang",
    "fortyTwo",
    "fortyTwoBang",
    "secondToLast",
    "secondToLastBang",
    "thirdToLast",
    "thirdToLastBang",
    "sole",
    "isExists",
    "count",
    "sum",
    "average",
    "minimum",
    "maximum",
    "pluck",
    "pick",
    "ids",
    "asyncIds",
    "findEach",
    "findInBatches",
    "inBatches",
    "findOrCreateBy",
    "findOrCreateByBang",
    "findOrInitializeBy",
    "firstOrCreate",
    "firstOrCreateBang",
    "firstOrInitialize",
    "createOrFindBy",
    "createOrFindByBang",
    "destroyAll",
    "deleteAll",
    "updateAll",
    "touchAll",
    "deleteBy",
    "destroyBy",
    "insert",
    "insertBang",
    "insertAll",
    "insertAllBang",
    "upsert",
    "upsertAll",
    "isAny",
    "isMany",
    "isOne",
    "isNone",
    "findSoleBy",
    "destroy",
    "delete",
    "calculate",
    "createWith",
    "except",
    "extractAssociated",
    "asyncCount",
    "asyncAverage",
    "asyncMinimum",
    "asyncMaximum",
    "asyncSum",
    "asyncPluck",
    "asyncPick",
  ] as const;

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

  registerModel(Project);
  registerModel(Developer);

  it("delegation doesn't override methods defined in other relation subclasses", async () => {
    expect("target" in Relation.prototype).toEqual(false);
    expect("target" in CollectionProxy.prototype).toEqual(true);

    const ownerOf = (object: object, name: string): object | undefined => {
      for (let o: object | null = object; o; o = Object.getPrototypeOf(o)) {
        if (Object.prototype.hasOwnProperty.call(o, name)) return o;
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
