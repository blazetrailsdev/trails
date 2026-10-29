import { describe, expect, it } from "vitest";
import { fixtures } from "./test-helpers/use-fixtures.js";
import {
  DestroyAssociationAsyncError,
  DestroyAssociationAsyncJob,
} from "./destroy-association-async-job.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Reply } from "./test-helpers/models/reply.js";

describe("DestroyAssociationAsyncJob", () => {
  fixtures(["topics"]);

  it("raises when the owner still exists", async () => {
    const topic = (await Topic.first())!;
    await expect(
      new DestroyAssociationAsyncJob().perform({
        ownerModelName: "Topic",
        ownerId: topic.id,
        associationClass: "Reply",
        associationIds: [],
        associationPrimaryKeyColumn: "id",
      }),
    ).rejects.toThrow(DestroyAssociationAsyncError);
  });

  it("destroys each associated record once the owner is gone", async () => {
    const reply = (await Reply.first())!;
    await new DestroyAssociationAsyncJob().perform({
      ownerModelName: "Topic",
      ownerId: -1,
      associationClass: "Reply",
      associationIds: [reply.id],
      associationPrimaryKeyColumn: "id",
    });
    expect(await Reply.findBy({ id: reply.id })).toBeNull();
  });
});
