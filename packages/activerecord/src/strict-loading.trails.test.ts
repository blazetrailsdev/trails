import { findCollectionTarget as findHasManyTarget } from "./test-helpers/find-collection-target.js";
import { describe, it, expect } from "vitest";
import { loadSingularTarget } from "./test-helpers/load-singular-target.js";
import { StrictLoadingViolationError, registerModel } from "./index.js";
import { fixtures } from "./test-fixtures.js";
import { Developer, AuditLog } from "./test-helpers/models/developer.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Project } from "./test-helpers/models/project.js";
import { Firm } from "./test-helpers/models/company.js";
import { Contract } from "./test-helpers/models/contract.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";
import { Comment } from "./test-helpers/models/comment.js";
import { Member } from "./test-helpers/models/member.js";
import { Membership, CurrentMembership } from "./test-helpers/models/membership.js";
import { Club } from "./test-helpers/models/club.js";

describe("StrictLoadingNewRecordFindTargetTest", () => {
  const { developers, authors, members } = fixtures([
    "developers",
    "authors",
    "posts",
    "comments",
    "members",
    "memberships",
    "clubs",
  ]);
  registerModel(Developer);
  registerModel(AuditLog);
  registerModel(Ship);
  registerModel(Project);
  registerModel(Firm);
  registerModel(Contract);
  registerModel([Author, Post, Comment, Member, Membership, CurrentMembership, Club]);

  it("does not raise on lazy loading a has_many on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(true);
    await expect(findHasManyTarget(developer, "auditLogs")).resolves.toEqual([]);
  });

  it("does not raise on lazy loading a has_one on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    await expect(loadSingularTarget(developer, "ship")).resolves.toBeNull();
  });

  it("does not raise on lazy loading a belongs_to on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    await expect(loadSingularTarget(developer, "firm")).resolves.toBeNull();
  });

  it("does not raise on lazy loading a habtm on a new strict-loading owner without the foreign key", async () => {
    const developer = new Developer({ name: "New Dev" });
    developer.strictLoadingBang();
    await expect(developer.projects.toArray()).resolves.toEqual([]);
  });

  it("does not raise on lazy loading a belongs_to on a persisted strict-loading owner without the foreign key", async () => {
    const developer = await Developer.find(developers("david").id);
    developer.firm_id = null as unknown as number;
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(false);
    await expect(loadSingularTarget(developer, "firm")).resolves.toBeNull();
  });

  it("raises on lazy loading a belongs_to on a new strict-loading owner with the foreign key present", async () => {
    const developer = new Developer({ name: "New Dev", firm_id: 1 });
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(true);
    await expect(loadSingularTarget(developer, "firm")).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on lazy loading a has_many on a new strict-loading owner with the primary key present", async () => {
    const developer = new Developer({ name: "New Dev", id: 1 });
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(true);
    await expect(findHasManyTarget(developer, "auditLogs")).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("does not raise on lazy loading a disable_joins has_many :through on a strict-loading owner", async () => {
    const author = await Author.find(authors("david").id);
    author.strictLoadingBang();
    await expect(findHasManyTarget(author, "noJoinsComments")).resolves.toBeInstanceOf(Array);
  });

  it("does not raise on lazy loading a disable_joins has_one :through on a strict-loading owner", async () => {
    const member = await Member.find(members("groucho").id);
    member.strictLoadingBang();
    await expect(loadSingularTarget(member, "clubWithoutJoins")).resolves.not.toBeUndefined();
  });

  it("still raises on lazy loading a strict-loading has_many on a persisted owner", async () => {
    const developer = await Developer.find(developers("david").id);
    developer.strictLoadingBang();
    expect(developer.isNewRecord()).toBe(false);
    await expect(findHasManyTarget(developer, "auditLogs")).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });
});
