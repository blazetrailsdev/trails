/**
 * Mirrors Rails activerecord/test/cases/associations/eager_load_nested_include_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { defineSchema, type Schema } from "../test-helpers/define-schema.js";
import { fixtures, setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";
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
  declare shape_type: string;
  declare shape_id: number;
  declare paint_type: string;
  declare paint_id: number;
  declare shape: Base | null;
  declare paint: Base | null;
  declare loadBelongsTo: ((name: "shape") => Promise<Base | null>) &
    ((name: "paint") => Promise<Base | null>);

  static {
    this._tableName = "shape_expressions";
    this.attribute("shape_type", "string");
    this.attribute("shape_id", "integer");
    this.attribute("paint_type", "string");
    this.attribute("paint_id", "integer");
    this.belongsTo("shape", { polymorphic: true });
    this.belongsTo("paint", { polymorphic: true });
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
  declare non_poly_one_id: number;
  declare nonPoly: NonPolyOne | null;
  declare loadBelongsTo: (name: "nonPoly") => Promise<NonPolyOne | null>;

  static {
    this._tableName = "paint_colors";
    this.attribute("non_poly_one_id", "integer");
    this.belongsTo("nonPoly", {
      foreignKey: "non_poly_one_id",
      className: "NonPolyOne",
    });
  }
}
class PaintTexture extends Base {
  declare non_poly_two_id: number;
  declare nonPoly: NonPolyTwo | null;
  declare loadBelongsTo: (name: "nonPoly") => Promise<NonPolyTwo | null>;

  static {
    this._tableName = "paint_textures";
    this.attribute("non_poly_two_id", "integer");
    this.belongsTo("nonPoly", {
      foreignKey: "non_poly_two_id",
      className: "NonPolyTwo",
    });
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
  setupFixtures();
  useHandlerTransactionalFixtures();
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
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
      circles.push(await Circle.create({}));
      squares.push(await Square.create({}));
      triangles.push(await Triangle.create({}));
      nonPolyOnes.push(await NonPolyOne.create({}));
      nonPolyTwos.push(await NonPolyTwo.create({}));
    }
    for (let i = 0; i < NUM_SIMPLE_OBJS; i++) {
      paintColors.push(await PaintColor.create({ non_poly_one_id: sample(nonPolyOnes).id }));
      paintTextures.push(await PaintTexture.create({ non_poly_two_id: sample(nonPolyTwos).id }));
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

    const res = await ShapeExpression.all().includes("shape", { paint: "nonPoly" });
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
  fixtures(["categories"]);
  beforeAll(async () => {
    await defineSchema(
      Base.connection,
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
    const daveyMcdave = await Author.create({ name: "Davey McDave" });
    const firstPost = await Post.create({
      author_id: daveyMcdave.id,
      title: "Davey Speaks",
      body: "Expressive wordage",
    });
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
      .order("categories.name");
  });
});
