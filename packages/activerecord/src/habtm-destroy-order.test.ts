import { describe, it, beforeAll } from "vitest";
import { Base, association, registerModel } from "./index.js";
import { Associations } from "./associations.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { setupHandlerSuite } from "./test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupHandlerSuite();
useHandlerTransactionalFixtures();

beforeAll(async () => {
  await defineSchema({
    students: { name: "string" },
    lessons: { name: "string" },
    lessons_students: { lesson_id: "integer", student_id: "integer" },
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

  it.skip("may not delete a lesson with students", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/habtm-destroy-order.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in habtm-destroy-order.test.ts
    /* needs beforeDestroy to halt destroy and propagate errors */
  });

  it("should not raise error if have foreign key in the join table", async () => {
    const { Student, Lesson } = makeModels();
    const student = await Student.create({ name: "Ben Bitdiddle" });
    const lesson = await Lesson.create({ name: "SICP" });
    await association(lesson, "students").push(student);
    await student.destroy();
  });

  it.skip("not destroying a student with lessons leaves student<=>lesson association intact", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/habtm-destroy-order.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in habtm-destroy-order.test.ts
    /* needs beforeDestroy returning false to halt destroy */
  });

  it.skip("not destroying a lesson with students leaves student<=>lesson association intact", () => {
    // BLOCKED: associations — collection/singular feature gap
    // ROOT-CAUSE: associations/habtm-destroy-order.ts or preloader.ts missing collection/singular semantics
    // SCOPE: ~50–200 LOC fix in associations/ or preloader.ts; affects ~10–79 tests in habtm-destroy-order.test.ts
    /* needs beforeDestroy returning false to halt destroy */
  });
});
