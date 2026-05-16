/**
 * AssociationQueryValue — predicate-builder/association_query_value_test.rb mirror.
 *
 * Focused on `convertToId` semantics: scalar PK extraction, array-PK tuple
 * extraction (the query_constraints feature), and the queries() hash shape
 * that PredicateBuilder consumes downstream.
 */
import { describe, it, expect } from "vitest";
import { AssociationQueryValue } from "./association-query-value.js";

describe("AssociationQueryValue", () => {
  describe("scalar primary key", () => {
    it("extracts the id from a record-like value", () => {
      const value = { id: 7, title: "x" };
      const av = new AssociationQueryValue(
        { joinForeignKey: "author_id", joinPrimaryKey: "id" },
        value,
      );
      expect(av.queries()).toEqual([{ author_id: [7] }]);
    });

    it("wraps a scalar value in a single-element array", () => {
      const av = new AssociationQueryValue(
        { joinForeignKey: "author_id", joinPrimaryKey: "id" },
        42,
      );
      expect(av.queries()).toEqual([{ author_id: [42] }]);
    });

    it("maps an array of records to an id list", () => {
      const v1 = { id: 1 };
      const v2 = { id: 2 };
      const av = new AssociationQueryValue({ joinForeignKey: "author_id", joinPrimaryKey: "id" }, [
        v1,
        v2,
      ]);
      expect(av.queries()).toEqual([{ author_id: [1, 2] }]);
    });
  });

  describe("composite primary key (query_constraints)", () => {
    it("extracts a tuple from a single record using the pk columns", () => {
      const comment = { blog_id: 11, blog_post_id: 22, body: "hi" };
      const av = new AssociationQueryValue(
        {
          joinForeignKey: ["blog_id", "id"],
          joinPrimaryKey: ["blog_id", "blog_post_id"],
        },
        comment,
      );
      // Single record → one query hash with fk[i] mapped to pk[i] value.
      expect(av.queries()).toEqual([{ blog_id: 11, id: 22 }]);
    });

    it("extracts tuples from an array of records", () => {
      const c1 = { blog_id: 11, blog_post_id: 22 };
      const c2 = { blog_id: 12, blog_post_id: 33 };
      const av = new AssociationQueryValue(
        {
          joinForeignKey: ["blog_id", "id"],
          joinPrimaryKey: ["blog_id", "blog_post_id"],
        },
        [c1, c2],
      );
      // One hash per record — PredicateBuilder OR-groups them.
      expect(av.queries()).toEqual([
        { blog_id: 11, id: 22 },
        { blog_id: 12, id: 33 },
      ]);
    });

    it("uses readAttribute('id') when a pk column is literally 'id' (id_value parity)", () => {
      // Composite-PK records expose `id` as the full tuple, while Rails
      // `id_value` reads the scalar id column. We mirror via readAttribute('id').
      const record = {
        blog_id: 5,
        id: [5, 99], // composite-pk id surface
        readAttribute(name: string) {
          // Scalar id column under the surface.
          return name === "id" ? 99 : (this as any)[name];
        },
      };
      const av = new AssociationQueryValue(
        {
          joinForeignKey: ["blog_id", "blog_post_id"],
          joinPrimaryKey: ["blog_id", "id"],
        },
        record,
      );
      expect(av.queries()).toEqual([{ blog_id: 5, blog_post_id: 99 }]);
    });

    it("returns null tuple entries when value is null", () => {
      const av = new AssociationQueryValue(
        {
          joinForeignKey: ["blog_id", "id"],
          joinPrimaryKey: ["blog_id", "blog_post_id"],
        },
        [null],
      );
      expect(av.queries()).toEqual([{ blog_id: null, id: null }]);
    });
  });
});
