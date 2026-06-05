import { describe, it, expect, beforeAll } from "vitest";
import { Base, association, registerModel, Rollback } from "./index.js";
import { Associations } from "./associations.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";
import { TEST_SCHEMA } from "./test-helpers/test-schema.js";

// Mirrors vendor/rails/activerecord/test/models/lesson.rb — `class LessonError`.
class LessonError extends Error {}

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    students: TEST_SCHEMA.students,
    lessons: TEST_SCHEMA.lessons,
    lessons_students: TEST_SCHEMA.lessons_students,
  });
});

describe("HabtmDestroyOrderTest", () => {
  function makeModels() {
    class Student extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class Lesson extends Base {
      static {
        this.attribute("name", "string");
        // Mirrors models/lesson.rb: before_destroy :ensure_no_students,
        // which raises `unless students.empty?`. Because destroyAssociations
        // (HABTM join cleanup) runs AFTER before_destroy, this callback still
        // sees the students at destroy time.
        this.beforeDestroy(async (r: any) => {
          if (!(await association(r, "students").isEmpty())) throw new LessonError();
        });
      }
    }
    registerModel("Student", Student);
    registerModel("Lesson", Lesson);
    Associations.hasAndBelongsToMany.call(Lesson, "students", {
      className: "Student",
      joinTable: "lessons_students",
    });
    Associations.hasAndBelongsToMany.call(Student, "lessons", {
      className: "Lesson",
      joinTable: "lessons_students",
    });
    return { Student, Lesson };
  }

  it("may not delete a lesson with students", async () => {
    const { Student, Lesson } = makeModels();
    const sicp = await Lesson.create({ name: "SICP" });
    const ben = await Student.create({ name: "Ben Bitdiddle" });
    await association(sicp, "students").push(ben);

    const before = Number(await Lesson.count());
    await expect(sicp.destroy()).rejects.toThrow(LessonError);
    expect(Number(await Lesson.count())).toBe(before);
    expect(sicp.isDestroyed()).toBe(false);
  });

  it("should not raise error if have foreign key in the join table", async () => {
    const { Student, Lesson } = makeModels();
    const student = await Student.create({ name: "Ben Bitdiddle" });
    const lesson = await Lesson.create({ name: "SICP" });
    await association(lesson, "students").push(student);
    await student.destroy();
  });

  it("not destroying a student with lessons leaves student<=>lesson association intact", async () => {
    // test a normal before_destroy doesn't destroy the habtm joins
    const { Student, Lesson } = makeModels();
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

  it("not destroying a lesson with students leaves student<=>lesson association intact", async () => {
    // test a more aggressive before_destroy doesn't destroy the habtm joins and still throws the exception
    const { Student, Lesson } = makeModels();
    const sicp = await Lesson.create({ name: "SICP" });
    const ben = await Student.create({ name: "Ben Bitdiddle" });
    await association(sicp, "students").push(ben);

    await expect(sicp.destroy()).rejects.toThrow(LessonError);
    await sicp.reload();
    expect(await association(sicp, "students").isEmpty()).toBe(false);
  });
});
