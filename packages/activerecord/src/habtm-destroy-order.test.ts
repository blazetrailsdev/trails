import { describe, it, expect } from "vitest";
import { association, registerModel, resetCallbacks, Rollback } from "./index.js";
import "./test-helpers/canonical-model-index.js";
import { Lesson, LessonError } from "./test-helpers/models/lesson.js";
import { Student } from "./test-helpers/models/student.js";
import { fixtures } from "./test-helpers/fixtures.js";

fixtures([]);

describe("HabtmDestroyOrderTest", () => {
  registerModel([Lesson, Student]);

  it("may not delete a lesson with students", async () => {
    const sicp = await Lesson.create({ name: "SICP" });
    const ben = await Student.create({ name: "Ben Bitdiddle" });
    await association(sicp, "students").push(ben);

    const before = Number(await Lesson.count());
    await expect(sicp.destroy()).rejects.toThrow(LessonError);
    expect(Number(await Lesson.count())).toBe(before);
    expect(sicp.isDestroyed()).toBe(false);
  });

  it("should not raise error if have foreign key in the join table", async () => {
    const student = await Student.create({ name: "Ben Bitdiddle" });
    const lesson = await Lesson.create({ name: "SICP" });
    await association(lesson, "students").push(student);
    await student.destroy();
  });

  it("not destroying a student with lessons leaves student<=>lesson association intact", async () => {
    // test a normal before_destroy doesn't destroy the habtm joins
    // `resetCallbacks` restores Student's destroy callbacks afterwards, matching
    // the `ensure Student.reset_callbacks(:destroy)` in the Rails test.
    await resetCallbacks(Student, "destroy", async () => {
      // add a before destroy to student
      Student.beforeDestroy(async (r: any) => {
        if (!(await association(r, "lessons").isEmpty())) throw new Rollback();
      });
      const sicp = await Lesson.create({ name: "SICP" });
      const ben = await Student.create({ name: "Ben Bitdiddle" });
      await association(ben, "lessons").push(sicp);

      await ben.destroy();
      await ben.reload();
      expect(await association(ben, "lessons").isEmpty()).toBe(false);
    });
  });

  it("not destroying a lesson with students leaves student<=>lesson association intact", async () => {
    // test a more aggressive before_destroy doesn't destroy the habtm joins and still throws the exception
    const sicp = await Lesson.create({ name: "SICP" });
    const ben = await Student.create({ name: "Ben Bitdiddle" });
    await association(sicp, "students").push(ben);

    await expect(sicp.destroy()).rejects.toThrow(LessonError);
    await sicp.reload();
    expect(await association(sicp, "students").isEmpty()).toBe(false);
  });
});
