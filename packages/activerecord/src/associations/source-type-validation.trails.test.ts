import { describe, it, expect } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations, association } from "../associations.js";
import { findCollectionTarget as findTarget } from "../test-helpers/find-collection-target.js";
import { fixtures } from "../test-fixtures.js";

class StvAuthor extends Base {
  static {
    this._tableName = "stv_authors";
    this.attribute("id", "integer");
  }
}
class StvComment extends Base {
  static {
    this._tableName = "stv_comments";
  }
}
class StvPost extends Base {
  static {
    this._tableName = "stv_posts";
  }
}
class StvMember extends Base {
  static {
    this._tableName = "stv_members";
  }
}

registerModel("StvAuthor", StvAuthor);
registerModel("StvComment", StvComment);
registerModel("StvPost", StvPost);
registerModel("StvMember", StvMember);

function freshAssociations() {
  (StvAuthor as any)._reflections = {};
  (StvComment as any)._reflections = {};
  (StvPost as any)._reflections = {};
}

function author() {
  return Object.assign(new StvAuthor(), { id: 1 });
}

describe("ThroughReflection — checkValidityBang at first use", () => {
  fixtures([]);

  it("raises PolymorphicSourceError when source is polymorphic but sourceType is missing", () => {
    freshAssociations();
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.hasMany.call(StvAuthor, "originFromComments", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    expect(() => association(author(), "originFromComments")).toThrow(
      /polymorphic association 'origin'/,
    );
  });

  it("raises PointlessSourceTypeError when sourceType is set but source is not polymorphic", () => {
    freshAssociations();
    Associations.hasMany.call(StvAuthor, "stvPosts", {
      className: "StvPost",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvPost, "author", {
      className: "StvAuthor",
      foreignKey: "stv_author_id",
    });
    Associations.hasMany.call(StvAuthor, "authorsByPost", {
      className: "StvAuthor",
      through: "stvPosts",
      source: "author",
      sourceType: "StvAuthor",
    });
    expect(() => association(author(), "authorsByPost")).toThrow(/:source_type/);
  });

  it("fires at the loadHasMany entry point too (not just association() / Association#ctor)", async () => {
    freshAssociations();
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.hasMany.call(StvAuthor, "originFromComments", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    await expect(findTarget(author(), "originFromComments")).rejects.toThrow(
      /polymorphic association 'origin'/,
    );
  });

  it("raises HasManyThroughSourceAssociationNotFoundError for an unresolvable source", () => {
    freshAssociations();
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.hasMany.call(StvAuthor, "missingSource", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    expect(() => association(author(), "missingSource")).toThrow(
      /Could not find the source association/,
    );
  });

  it("re-throws a cached validation error on subsequent calls (caught-then-retried can't sneak past)", () => {
    freshAssociations();
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.hasMany.call(StvAuthor, "originFromComments", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    const a = author();
    expect(() => association(a, "originFromComments")).toThrow(/polymorphic association 'origin'/);
    expect(() => association(a, "originFromComments")).toThrow(/polymorphic association 'origin'/);
  });

  it("raises HasOneThroughCantAssociateThroughCollection for has_one :through collection", () => {
    freshAssociations();
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
    });
    Associations.hasOne.call(StvAuthor, "singularThroughCollection", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
    });
    expect(() => association(author(), "singularThroughCollection")).toThrow(
      /has_one :through association.*going through.*which is a collection/,
    );
  });

  it("accepts the valid shape: polymorphic source with sourceType", () => {
    freshAssociations();
    Associations.hasMany.call(StvAuthor, "stvComments", {
      className: "StvComment",
      foreignKey: "stv_author_id",
    });
    Associations.belongsTo.call(StvComment, "origin", {
      className: "StvMember",
      foreignKey: "origin_id",
      polymorphic: true,
    });
    Associations.hasMany.call(StvAuthor, "stvMembersViaComments", {
      className: "StvMember",
      through: "stvComments",
      source: "origin",
      sourceType: "StvMember",
    });
    expect(() => association(author(), "stvMembersViaComments")).not.toThrow();
  });
});
