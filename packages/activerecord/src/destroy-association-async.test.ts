import {
  DestroyAssociationAsyncError,
  DestroyAssociationAsyncJob,
} from "./destroy-association-async-job.js";
import { describe, it, type TestContext } from "vitest";
import {
  assert,
  assertDifference,
  assertEqual,
  assertMatch,
  assertNoDifference,
  assertNot,
  assertPredicate,
  assertRaises,
} from "@blazetrails/activesupport";
import type { TestHelper } from "@blazetrails/activejob/test-helper";
import { TestHelper as ActiveJobTestHelper } from "@blazetrails/activejob/test-helper";
import { include, rbEqual, regexpEscape, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import type { TestCase } from "./cases/test-case.js";
import { RecordNotFound, Rollback } from "./errors.js";
import { fixtures, rootTestCase } from "./test-helpers/use-fixtures.js";
import { Author } from "./test-helpers/models/author.js";
import {
  BookDestroyAsync,
  BookDestroyAsyncWithScopedTags,
} from "./test-helpers/models/book-destroy-async.js";
import { Content } from "./test-helpers/models/content.js";
import { CpkBookDestroyAsync, CpkChapterDestroyAsync } from "./test-helpers/models/cpk.js";
import { DestroyAsyncParent } from "./test-helpers/models/destroy-async-parent.js";
import { DestroyAsyncParentSoftDelete } from "./test-helpers/models/destroy-async-parent-soft-delete.js";
import { DlKeyedBelongsTo } from "./test-helpers/models/dl-keyed-belongs-to.js";
import { DlKeyedBelongsToSoftDelete } from "./test-helpers/models/dl-keyed-belongs-to-soft-delete.js";
import { DlKeyedHasMany } from "./test-helpers/models/dl-keyed-has-many.js";
import { DlKeyedHasManyThrough } from "./test-helpers/models/dl-keyed-has-many-through.js";
import { DlKeyedHasOne } from "./test-helpers/models/dl-keyed-has-one.js";
import { DlKeyedJoin } from "./test-helpers/models/dl-keyed-join.js";
import {
  EssayDestroyAsync,
  LongEssayDestroyAsync,
  ShortEssayDestroyAsync,
} from "./test-helpers/models/essay-destroy-async.js";
import { ShardedBlog } from "./test-helpers/models/sharded/blog.js";
import { ShardedBlogPostDestroyAsync } from "./test-helpers/models/sharded/blog-post-destroy-async.js";
import { ShardedCommentDestroyAsync } from "./test-helpers/models/sharded/comment-destroy-async.js";
import { ShardedTag } from "./test-helpers/models/sharded/tag.js";
import "./test-helpers/models/essay.js";
import "./test-helpers/models/category.js";
import "./test-helpers/models/post.js";
import "./test-helpers/models/sharded/blog-post.js";
import "./test-helpers/models/sharded/blog-post-tag.js";
import { Tag } from "./test-helpers/models/tag.js";
import { Tagging } from "./test-helpers/models/tagging.js";

class DestroyAssociationAsyncTest extends rootTestCase() {}
registerConstant("DestroyAssociationAsyncTest", DestroyAssociationAsyncTest);
include(DestroyAssociationAsyncTest, ActiveJobTestHelper);

type Ctx = TestContext & { testCase: TestCase & TestHelper };

const only = { only: DestroyAssociationAsyncJob };

describe("DestroyAssociationAsyncTest", () => {
  fixtures([]);

  it("destroying a record destroys the has_many :through records using a job", async ({
    testCase: t,
  }: Ctx) => {
    try {
      const tag = await Tag.createBang({ name: "Der be treasure" });
      const tag2 = await Tag.createBang({ name: "Der be rum" });
      const book = await BookDestroyAsync.createBang();
      await book.tags.push(tag, tag2);
      await book.saveBang();

      await t.assertEnqueuedJobs(1, only, () => book.destroy());

      await assertDifference(
        () => Tag.count(),
        -2,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await Tag.deleteAll();
      await BookDestroyAsync.deleteAll();
    }
  });

  it("destroying a record destroys has_many :through associated by composite primary key using a job", async ({
    testCase: t,
  }: Ctx) => {
    try {
      const blog = await ShardedBlog.createBang();
      const blogPost = await ShardedBlogPostDestroyAsync.createBang({ blog_id: blog.id });

      const tag1 = await ShardedTag.createBang({ name: "Short Read", blog_id: blog.id });
      const tag2 = await ShardedTag.createBang({ name: "Science", blog_id: blog.id });

      await blogPost.tags.push(tag1, tag2);

      await blogPost.saveBang();

      await t.assertEnqueuedJobs(1, only, () => blogPost.destroy());

      const sql: string[] = await t.captureSql({}, () =>
        assertDifference(
          () => ShardedTag.count(),
          -2,
          null,
          () => t.performEnqueuedJobs(only),
        ),
      );

      const deleteSqls = sql.filter((sql) => sql.startsWith("DELETE"));
      assertEqual(2, deleteSqls.length);

      for (const sql of deleteSqls) {
        assertMatch(new RegExp(`${regexpEscape(t.quoteTableName("sharded_tags.blog_id"))} =`), sql);
      }
    } finally {
      await ShardedTag.deleteAll();
      await ShardedBlogPostDestroyAsync.deleteAll();
      await ShardedBlog.deleteAll();
    }
  });

  it("destroying a scoped has_many through only deletes within the scope deleted", async ({
    testCase: t,
  }: Ctx) => {
    try {
      const tag = await Tag.createBang({ name: "Der be treasure" });
      const tag2 = await Tag.createBang({ name: "Der be rum" });
      const parent = await BookDestroyAsyncWithScopedTags.createBang();
      await parent.tags.push(tag, tag2);
      await parent.saveBang();

      await parent.reload();

      await parent.destroy();

      await assertDifference(
        () => Tag.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
      await assertRaises([RecordNotFound], {}, () => tag2.reload());
      assert(await tag.reload());
    } finally {
      await Tag.deleteAll();
      await Tagging.deleteAll();
      await BookDestroyAsyncWithScopedTags.deleteAll();
    }
  });

  it("enqueues the has_many through to be deleted with custom primary key", async ({
    testCase: t,
  }: Ctx) => {
    try {
      const dlKeyedHasMany = await DlKeyedHasManyThrough.createBang();
      const dlKeyedHasMany2 = await DlKeyedHasManyThrough.createBang();
      const parent = await DestroyAsyncParent.createBang();
      await parent.dlKeyedHasManyThrough.push(dlKeyedHasMany2, dlKeyedHasMany);
      await parent.saveBang();
      await parent.destroy();

      await assertDifference(
        () => DlKeyedJoin.count(),
        -2,
        null,
        () =>
          assertDifference(
            () => DlKeyedHasManyThrough.count(),
            -2,
            null,
            () => t.performEnqueuedJobs(only),
          ),
      );
    } finally {
      await DlKeyedHasManyThrough.deleteAll();
      await DestroyAsyncParent.deleteAll();
      await DlKeyedJoin.deleteAll();
    }
  });

  it("enqueues multiple jobs if count of dependent records to destroy is greater than batch size", async ({
    testCase: t,
  }: Ctx) => {
    try {
      Base.destroyAssociationAsyncBatchSize = 1;

      const tag = await Tag.createBang({ name: "Der be treasure" });
      const tag2 = await Tag.createBang({ name: "Der be rum" });
      const book = await BookDestroyAsync.createBang();
      await book.tags.push(tag, tag2);
      await book.saveBang();

      const job1Args = (jobArgs: Array<{ associationIds: unknown }>) =>
        rbEqual(jobArgs[0].associationIds, [tag.id]);
      const job2Args = (jobArgs: Array<{ associationIds: unknown }>) =>
        rbEqual(jobArgs[0].associationIds, [tag2.id]);

      await t.assertEnqueuedWith({ job: DestroyAssociationAsyncJob, args: job1Args }, () =>
        t.assertEnqueuedWith({ job: DestroyAssociationAsyncJob, args: job2Args }, () =>
          book.destroy(),
        ),
      );

      await assertDifference(
        () => Tag.count(),
        -2,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await Tag.deleteAll();
      await BookDestroyAsync.deleteAll();
      Base.destroyAssociationAsyncBatchSize = null;
    }
  });

  it("belongs to", async ({ testCase: t }: Ctx) => {
    try {
      const essay = await EssayDestroyAsync.createBang({ name: "Der be treasure" });
      const book = await BookDestroyAsync.createBang({ name: "Arr, matey!" });
      essay.book = book;
      await essay.saveBang();
      await essay.destroy();

      await assertDifference(
        () => BookDestroyAsync.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await EssayDestroyAsync.deleteAll();
      await BookDestroyAsync.deleteAll();
    }
  });

  it("belongs to associated by composite primary key", async ({ testCase: t }: Ctx) => {
    try {
      const blog = await ShardedBlog.createBang();
      const blogPost = await ShardedBlogPostDestroyAsync.createBang({ blog_id: blog.id });
      const comment = await ShardedCommentDestroyAsync.createBang({
        body: "Great post! :clap:",
      });

      comment.blogPost = blogPost;
      await comment.saveBang();

      await t.assertEnqueuedJobs(1, only, () => comment.destroy());

      const sql: string[] = await t.captureSql({}, () =>
        assertDifference(
          () => ShardedBlogPostDestroyAsync.count(),
          -1,
          null,
          () => t.performEnqueuedJobs(only),
        ),
      );

      const deleteSqls = sql.filter((sql) => sql.startsWith("DELETE"));
      assertEqual(1, deleteSqls.length);
      assertMatch(
        new RegExp(`${regexpEscape(t.quoteTableName("sharded_blog_posts.blog_id"))} =`),
        deleteSqls[0],
      );
    } finally {
      await ShardedBlogPostDestroyAsync.deleteAll();
      await ShardedCommentDestroyAsync.deleteAll();
      await ShardedBlog.deleteAll();
    }
  });

  it("enqueues belongs_to to be deleted with custom primary key", async ({ testCase: t }: Ctx) => {
    try {
      const belongs = await DlKeyedBelongsTo.createBang();
      const parent = await DestroyAsyncParent.createBang();
      belongs.destroyAsyncParent = parent;
      await belongs.saveBang();
      await belongs.destroy();

      await assertDifference(
        () => DestroyAsyncParent.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await DlKeyedBelongsTo.deleteAll();
      await DestroyAsyncParent.deleteAll();
    }
  });

  it("polymorphic belongs_to", async ({ testCase: t }: Ctx) => {
    try {
      const writer = await Author.create({ name: "David" });
      const essay = await EssayDestroyAsync.createBang({ name: "Der be treasure", writer });

      await essay.destroy();

      await assertDifference(
        () => Author.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await EssayDestroyAsync.deleteAll();
      await Author.deleteAll();
    }
  });

  it("has_one", async ({ testCase: t }: Ctx) => {
    try {
      const content = await Content.create({ title: "hello" });
      const book = await BookDestroyAsync.createBang({ name: "Arr, matey!" });
      await book.setContent(content);
      await book.saveBang();
      await book.destroy();

      await assertDifference(
        () => Content.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await Content.deleteAll();
      await BookDestroyAsync.deleteAll();
    }
  });

  it("enqueues has_one to be deleted with custom primary key", async ({ testCase: t }: Ctx) => {
    try {
      const child = await DlKeyedHasOne.createBang();
      const parent = await DestroyAsyncParent.createBang();
      await parent.setDlKeyedHasOne(child);
      await parent.saveBang();
      await parent.destroy();

      await assertDifference(
        () => DlKeyedHasOne.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await DlKeyedHasOne.deleteAll();
      await DestroyAsyncParent.deleteAll();
    }
  });

  it("has_many", async ({ testCase: t }: Ctx) => {
    try {
      const essay = await EssayDestroyAsync.createBang({ name: "Der be treasure" });
      const essay2 = await EssayDestroyAsync.createBang({ name: "Der be rum" });
      const book = await BookDestroyAsync.createBang({ name: "Arr, matey!" });
      await book.essays.push(essay, essay2);
      await book.saveBang();
      await book.destroy();

      await assertDifference(
        () => EssayDestroyAsync.count(),
        -2,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await EssayDestroyAsync.deleteAll();
      await BookDestroyAsync.deleteAll();
    }
  });

  it("has_many with STI parent class destroys all children class records", async ({
    testCase: t,
  }: Ctx) => {
    const book = await BookDestroyAsync.createBang();
    await LongEssayDestroyAsync.createBang({ book });
    await ShortEssayDestroyAsync.createBang({ book });
    await book.destroy();

    await assertDifference(
      () => EssayDestroyAsync.count(),
      -2,
      null,
      () => t.performEnqueuedJobs(only),
    );
  });

  it("enqueues the has_many to be deleted with custom primary key", async ({
    testCase: t,
  }: Ctx) => {
    try {
      const dlKeyedHasMany = new DlKeyedHasMany();
      const parent = await DestroyAsyncParent.createBang();
      await parent.dlKeyedHasMany.push(dlKeyedHasMany);

      await parent.saveBang();
      await parent.destroy();

      await assertDifference(
        () => DlKeyedHasMany.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await DlKeyedHasMany.deleteAll();
      await DestroyAsyncParent.deleteAll();
    }
  });

  it("has_many associated with composite primary key", async ({ testCase: t }: Ctx) => {
    try {
      const book = await CpkBookDestroyAsync.createBang({ id: [1, 1] });
      await book.chapters.createBang({ id: [1, 1], title: "Chapter 1" });
      await book.chapters.createBang({ id: [1, 2], title: "Chapter 2" });

      await t.assertEnqueuedJobs(1, only, () => book.destroy());

      const sql: string[] = await t.captureSql({}, () =>
        assertDifference(
          () => CpkChapterDestroyAsync.count(),
          -2,
          null,
          () => t.performEnqueuedJobs(only),
        ),
      );

      const deleteSqls = sql.filter((sql) => sql.startsWith("DELETE"));
      assertEqual(2, deleteSqls.length);

      for (const sql of deleteSqls) {
        assertMatch(
          new RegExp(`${regexpEscape(t.quoteTableName("cpk_chapters.author_id"))} =`),
          sql,
        );
      }
    } finally {
      await CpkChapterDestroyAsync.deleteAll();
      await CpkBookDestroyAsync.deleteAll();
    }
  });

  it("not enqueue the job if transaction is not committed", async ({ testCase: t }: Ctx) => {
    try {
      const dlKeyedHasMany = new DlKeyedHasMany();
      const parent = await DestroyAsyncParent.createBang();
      await parent.dlKeyedHasMany.push(dlKeyedHasMany);

      await parent.saveBang();
      await t.assertNoEnqueuedJobs({}, () =>
        DestroyAsyncParent.transaction(async () => {
          await parent.destroy();
          throw new Rollback();
        }),
      );
    } finally {
      await DlKeyedHasMany.deleteAll();
      await DestroyAsyncParent.deleteAll();
    }
  });

  it("has many ensures function for parent", async ({ testCase: t }: Ctx) => {
    try {
      const tag = await Tag.createBang({ name: "Der be treasure" });
      const tag2 = await Tag.createBang({ name: "Der be rum" });
      const parent = await DestroyAsyncParentSoftDelete.createBang();
      await parent.tags.push(tag, tag2);
      await parent.saveBang();

      await parent.runCallbacks("destroy");
      await parent.runCallbacks("commit");

      await assertNoDifference(
        () => Tag.count(),
        null,
        () => assertRaises([DestroyAssociationAsyncError], {}, () => t.performEnqueuedJobs(only)),
      );

      await parent.destroy();
      await assertDifference(
        () => Tag.count(),
        -2,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await Tag.deleteAll();
      await DestroyAsyncParentSoftDelete.deleteAll();
    }
  });

  it("has one ensures function for parent", async ({ testCase: t }: Ctx) => {
    try {
      const child = await DlKeyedHasOne.createBang();
      const parent = await DestroyAsyncParentSoftDelete.createBang();
      await parent.setDlKeyedHasOne(child);
      await parent.saveBang();

      await parent.runCallbacks("destroy");
      await parent.runCallbacks("commit");

      await assertNoDifference(
        () => DlKeyedHasOne.count(),
        null,
        () => assertRaises([DestroyAssociationAsyncError], {}, () => t.performEnqueuedJobs(only)),
      );

      await parent.destroy();
      await assertDifference(
        () => DlKeyedHasOne.count(),
        -1,
        null,
        () => t.performEnqueuedJobs(only),
      );
    } finally {
      await DlKeyedHasOne.deleteAll();
      await DestroyAsyncParentSoftDelete.deleteAll();
    }
  });

  it("enqueues belongs_to to be deleted with ensuring function", async ({ testCase: t }: Ctx) => {
    try {
      const belongs = await DlKeyedBelongsToSoftDelete.createBang();
      const parent = await DestroyAsyncParentSoftDelete.createBang();
      belongs.destroyAsyncParentSoftDelete = parent;
      await belongs.saveBang();

      await belongs.runCallbacks("destroy");
      await belongs.runCallbacks("commit");

      await assertRaises([DestroyAssociationAsyncError], {}, () => t.performEnqueuedJobs(only));

      assertNot((await parent.reload()).isDeleted());

      await belongs.destroy();
      await t.performEnqueuedJobs(only);
      assertPredicate(await parent.reload(), (p) => p.isDeleted());
    } finally {
      await DlKeyedBelongsToSoftDelete.deleteAll();
      await DestroyAsyncParentSoftDelete.deleteAll();
    }
  });

  it("Don't enqueue with no relations", async ({ testCase: t }: Ctx) => {
    try {
      const parent = await DestroyAsyncParent.createBang();
      await parent.destroy();

      await t.assertNoEnqueuedJobs(only);
    } finally {
      await DestroyAsyncParent.deleteAll();
    }
  });

  it("Rollback prevents jobs from being enqueued", async ({ testCase: t }: Ctx) => {
    try {
      const tag = await Tag.createBang({ name: "Der be treasure" });
      const tag2 = await Tag.createBang({ name: "Der be rum" });
      const book = await BookDestroyAsync.createBang();
      await book.tags.push(tag, tag2);
      await book.saveBang();
      await Base.transaction(async () => {
        await book.destroy();
        throw new Rollback();
      });
      await t.assertNoEnqueuedJobs(only);
    } finally {
      await Tag.deleteAll();
      await BookDestroyAsync.deleteAll();
    }
  });
});
