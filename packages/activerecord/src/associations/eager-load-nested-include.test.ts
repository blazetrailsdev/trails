/**
 * Mirrors Rails activerecord/test/cases/associations/eager_load_nested_include_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { assertNoQueries } from "../testing/query-assertions.js";
import { Author, AuthorFavorite } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";

// Inline models mirroring the polymorphic graph defined in the Rails test
// (eager_load_nested_include_test.rb). The Rails test declares these classes in
// the test file itself; the tables (circles, squares, triangles, paint_colors,
// paint_textures, non_poly_ones, non_poly_twos, shape_expressions) are canonical
// TEST_SCHEMA tables.
class ShapeExpression extends Base {
  static {
    this._tableName = "shape_expressions";
    this.attribute("shape_type", "string");
    this.attribute("shape_id", "integer");
    this.attribute("paint_type", "string");
    this.attribute("paint_id", "integer");
  }
}
class Circle extends Base {
  static {
    this._tableName = "circles";
  }
}
class Square extends Base {
  static {
    this._tableName = "squares";
  }
}
class Triangle extends Base {
  static {
    this._tableName = "triangles";
  }
}
class PaintColor extends Base {
  static {
    this._tableName = "paint_colors";
    this.attribute("non_poly_one_id", "integer");
  }
}
class PaintTexture extends Base {
  static {
    this._tableName = "paint_textures";
    this.attribute("non_poly_two_id", "integer");
  }
}
class NonPolyOne extends Base {
  static {
    this._tableName = "non_poly_ones";
  }
}
class NonPolyTwo extends Base {
  static {
    this._tableName = "non_poly_twos";
  }
}

Associations.belongsTo.call(ShapeExpression, "shape", { polymorphic: true });
Associations.belongsTo.call(ShapeExpression, "paint", { polymorphic: true });
Associations.belongsTo.call(PaintColor, "nonPoly", {
  foreignKey: "non_poly_one_id",
  className: "NonPolyOne",
});
Associations.belongsTo.call(PaintTexture, "nonPoly", {
  foreignKey: "non_poly_two_id",
  className: "NonPolyTwo",
});
registerModel("ShapeExpression", ShapeExpression);
registerModel("Circle", Circle);
registerModel("Square", Square);
registerModel("Triangle", Triangle);
registerModel("PaintColor", PaintColor);
registerModel("PaintTexture", PaintTexture);
registerModel("NonPolyOne", NonPolyOne);
registerModel("NonPolyTwo", NonPolyTwo);

const NUM_SIMPLE_OBJS = 50;
const NUM_SHAPE_EXPRESSIONS = 100;

function sample<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

describe("EagerLoadPolyAssocsTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(
      Base.connection as Parameters<typeof defineSchema>[0],
      {
        shape_expressions: canonicalSchema.shape_expressions,
        circles: canonicalSchema.circles,
        squares: canonicalSchema.squares,
        triangles: canonicalSchema.triangles,
        paint_colors: canonicalSchema.paint_colors,
        paint_textures: canonicalSchema.paint_textures,
        non_poly_ones: canonicalSchema.non_poly_ones,
        non_poly_twos: canonicalSchema.non_poly_twos,
      } as Schema,
      { dropExisting: true },
    );
  });

  it("include query", async () => {
    const circles: Circle[] = [];
    const squares: Square[] = [];
    const triangles: Triangle[] = [];
    const nonPolyOnes: NonPolyOne[] = [];
    const nonPolyTwos: NonPolyTwo[] = [];
    const paintColors: PaintColor[] = [];
    const paintTextures: PaintTexture[] = [];

    for (let i = 0; i < NUM_SIMPLE_OBJS; i++) {
      circles.push((await Circle.create({})) as Circle);
      squares.push((await Square.create({})) as Square);
      triangles.push((await Triangle.create({})) as Triangle);
      nonPolyOnes.push((await NonPolyOne.create({})) as NonPolyOne);
      nonPolyTwos.push((await NonPolyTwo.create({})) as NonPolyTwo);
    }
    for (let i = 0; i < NUM_SIMPLE_OBJS; i++) {
      paintColors.push(
        (await PaintColor.create({ non_poly_one_id: sample(nonPolyOnes).id })) as PaintColor,
      );
      paintTextures.push(
        (await PaintTexture.create({ non_poly_two_id: sample(nonPolyTwos).id })) as PaintTexture,
      );
    }
    for (let i = 0; i < NUM_SHAPE_EXPRESSIONS; i++) {
      const shapePool = sample([circles, squares, triangles]) as Base[];
      const shape = sample(shapePool);
      const shapeType = (shape.constructor as typeof Base).name;
      const usePaintColor = Math.random() < 0.5;
      const paint = usePaintColor ? sample(paintColors) : sample(paintTextures);
      const paintType = usePaintColor ? "PaintColor" : "PaintTexture";
      await ShapeExpression.create({
        shape_type: shapeType,
        shape_id: shape.id,
        paint_type: paintType,
        paint_id: paint.id,
      });
    }

    const res = await ShapeExpression.all().includes("shape", { paint: "nonPoly" }).toArray();
    expect(res).toHaveLength(NUM_SHAPE_EXPRESSIONS);
    await assertNoQueries(false, async () => {
      for (const se of res) {
        const paint = se.association("paint").target as Base;
        expect(paint).not.toBeNull();
        expect(paint.association("nonPoly").target).not.toBeNull();
        expect(se.association("shape").target).not.toBeNull();
      }
    });
  });
});

describe("EagerLoadNestedIncludeWithMissingDataTest", () => {
  useHandlerFixtures(["categories"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection as Parameters<typeof defineSchema>[0],
      {
        authors: canonicalSchema.authors,
        posts: canonicalSchema.posts,
        comments: canonicalSchema.comments,
        categorizations: canonicalSchema.categorizations,
        categories: canonicalSchema.categories,
        author_favorites: canonicalSchema.author_favorites,
      } as Schema,
      { dropExisting: true },
    );
  });
  registerModel(Author);
  registerModel(Post);
  registerModel(Comment);
  registerModel(Category);
  registerModel(Categorization);
  registerModel(AuthorFavorite);

  it("missing data in a nested include should not cause errors when constructing objects", async () => {
    const daveyMcdave = (await Author.create({ name: "Davey McDave" })) as Author;
    const firstPost = (await Post.create({
      author_id: daveyMcdave.id,
      title: "Davey Speaks",
      body: "Expressive wordage",
    })) as Post;
    await Comment.create({ post_id: firstPost.id, body: "Inflammatory doublespeak" });
    const firstCategory = (await Category.first()) as Category;
    await Categorization.create({
      author_id: daveyMcdave.id,
      category_id: firstCategory.id,
      post_id: firstPost.id,
    });

    // @daveyMcdave has no author_favorites; the nested include must not raise
    // when constructing objects across the missing branch.
    await Author.all()
      .includes(
        { posts: "comments" },
        { categorizations: "category" },
        { authorFavorites: "favoriteAuthor" },
      )
      .where({ authors: { name: (daveyMcdave as unknown as { name: string }).name } })
      .references("categorizations")
      .order("categories.name")
      .toArray();
  });
});
