import { describe, it, expect } from "vitest";
import {
  assertNoDifference,
  assertNotEmpty,
  assertRaises,
  assertNothingRaised,
} from "@blazetrails/activesupport";
import {
  collectionProxyFor as association,
  registerModel,
  resetCallbacks,
  Rollback,
} from "./index.js";
import "./support/canonical-model-index.js";
import { Lesson, LessonError } from "./test-helpers/models/lesson.js";
import { Student } from "./test-helpers/models/student.js";
import { fixtures } from "./test-fixtures.js";

fixtures([]);

describe("HabtmDestroyOrderTest", () => {
  registerModel([Lesson, Student]);

  it("may not delete a lesson with students", async () => {
    const sicp = await Lesson.create({ name: "SICP" });
    const ben = await Student.create({ name: "Ben Bitdiddle" });
    await association(sicp, "students").push(ben);

    await assertRaises([LessonError], {}, async () => {
      await assertNoDifference(
        async () => Number(await Lesson.count()),
        null,
        async () => {
          await sicp.destroy();
        },
      );
    });
    expect(sicp.isDestroyed()).toBeFalsy();
  });

  it("should not raise error if have foreign key in the join table", async () => {
    const student = await Student.create({ name: "Ben Bitdiddle" });
    const lesson = await Lesson.create({ name: "SICP" });
    await association(lesson, "students").push(student);
    await assertNothingRaised(async () => {
      await student.destroy();
    });
  });

  it("not destroying a student with lessons leaves student<=>lesson association intact", async () => {
    await resetCallbacks(Student, "destroy", async () => {
      Student.beforeDestroy(async (r: any) => {
        if (!(await association(r, "lessons").isEmpty())) throw new Rollback();
      });
      const sicp = await Lesson.create({ name: "SICP" });
      const ben = await Student.create({ name: "Ben Bitdiddle" });
      await association(ben, "lessons").push(sicp);

      await ben.destroy();
      await ben.reload();
      assertNotEmpty(await association(ben, "lessons"));
    });
  });

  it("not destroying a lesson with students leaves student<=>lesson association intact", async () => {
    const sicp = await Lesson.create({ name: "SICP" });
    const ben = await Student.create({ name: "Ben Bitdiddle" });
    await association(sicp, "students").push(ben);

    await expect(sicp.destroy()).rejects.toThrow(LessonError);
    await sicp.reload();
    assertNotEmpty(await association(sicp, "students"));
  });
});
