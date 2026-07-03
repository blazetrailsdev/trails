import type { AssociationProxy } from "./associations/collection-proxy.js";
import { describe, it, expect } from "vitest";
import { Base, association, registerModel, Rollback } from "./index.js";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

// Mirrors vendor/rails/activerecord/test/models/lesson.rb — `class LessonError`.
class LessonError extends Error {}

setupFixtures();
useHandlerTransactionalFixtures();

describe("HabtmDestroyOrderTest", () => {
  function makeModels() {
    class Student extends Base {
      declare name: string;
      declare lessons: AssociationProxy<Lesson>;

      static {
        this.attribute("name", "string");
        this.hasAndBelongsToMany("lessons", {
          className: "Lesson",
          joinTable: "lessons_students",
        });
      }
    }
    class Lesson extends Base {
      declare name: string;
      declare students: AssociationProxy<Student>;

      static {
        this.attribute("name", "string");
        // Mirrors models/lesson.rb: before_destroy :ensure_no_students,
        // which raises `unless students.empty?`. Because destroyAssociations
        // (HABTM join cleanup) runs AFTER before_destroy, this callback still
        // sees the students at destroy time.
        this.beforeDestroy(async (r: any) => {
          if (!(await association(r, "students").isEmpty())) throw new LessonError();
        });
        this.hasAndBelongsToMany("students", {
          className: "Student",
          joinTable: "lessons_students",
        });
      }
    }
    registerModel("Student", Student);
    registerModel("Lesson", Lesson);
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
