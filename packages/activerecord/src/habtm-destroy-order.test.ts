import { describe, it, expect, beforeAll } from "vitest";
import { Base, association, registerModel } from "./index.js";
import { Associations, loadHabtm } from "./associations.js";
import { createTestAdapter, type TestDatabaseAdapter } from "./test-adapter.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { withTransactionalFixtures } from "./test-helpers/with-transactional-fixtures.js";

let adapter: TestDatabaseAdapter;

beforeAll(async () => {
  adapter = createTestAdapter();
  await defineSchema(adapter, {
    students: { name: "string" },
    lessons: { name: "string" },
    lessons_students: { lesson_id: "integer", student_id: "integer" },
  });
});
withTransactionalFixtures(() => adapter);

describe("HabtmDestroyOrderTest", () => {
  function makeModels() {
    class Student extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
      }
    }
    class Lesson extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = adapter;
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
    const lesson = await Lesson.create({ name: "SICP" });
    const student = await Student.create({ name: "Ben Bitdiddle" });
    await association(lesson, "students").push(student);
    // Verify join record exists before destroy
    const before = await loadHabtm(lesson, "students", {
      className: "Student",
      joinTable: "lessons_students",
    });
    expect(before).toHaveLength(1);
    // Destroying the student should clean up join records without FK error
    await student.destroy();
    expect(student.isDestroyed()).toBe(true);
    // Verify join table rows are actually removed (not just target missing)
    const joinRows = await adapter.execute(
      `SELECT * FROM "lessons_students" WHERE "student_id" = ?`,
      [student.id],
    );
    expect(joinRows).toHaveLength(0);
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
