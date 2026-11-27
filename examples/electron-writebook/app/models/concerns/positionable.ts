import { defineModule, extend, included, stripThenable } from "@blazetrails/activesupport";
import type { Base, Relation } from "@blazetrails/activerecord";

export const REBALANCE_THRESHOLD = 1e-10;
export const ELEMENT_GAP = 1;

/** The readers `positionedWithin` defines on the including class. */
export interface PositionedWithin {
  positioningParent(): Promise<Base>;
  allPositionedSiblings(): Promise<Siblings>;
  otherPositionedSiblings(): Promise<Siblings>;
}

interface Positioned extends Base, PositionedWithin {
  position_score: number;
  rebalanceRequired?: boolean;
  withPositioningLock<T>(block: () => Promise<T>): Promise<T | undefined>;
  ordinalPosition(): Promise<number>;
  positionAtEnd(): Promise<void>;
  positionAtStart(): Promise<void>;
  beforeAndAfterFor(options: { offset: number; moving: Positioned[] }): Promise<[number, number]>;
  rememberToRebalancePositions(): void;
  isRebalanceRequired(): boolean | undefined;
  rebalancePositions(): Promise<void>;
}

type Scoped = Relation<Positioned> & {
  positioned(): Relation<Positioned>;
  before(other: Positioned): Relation<Positioned>;
  after(other: Positioned): Relation<Positioned>;
};

/** A sibling relation handed back unevaluated through `stripThenable`. */
type Siblings = Omit<Scoped, "then">;

export const ClassMethods = {
  positionedWithin(
    this: typeof Base,
    parent: string,
    { association, filter }: { association: string; filter: string },
  ): void {
    Object.defineProperties(this.prototype, {
      positioningParent: {
        value: async function (this: Record<string, unknown>) {
          return await this[parent];
        },
        writable: true,
        configurable: true,
      },
      allPositionedSiblings: {
        value: async function (this: Positioned) {
          const owner = (await this.positioningParent()) as unknown as Record<
            string,
            Relation<Base>
          >;
          const filtered = (owner[association] as unknown as Record<string, () => Scoped>)[
            filter
          ]();
          return stripThenable(filtered.positioned());
        },
        writable: true,
        configurable: true,
      },
      otherPositionedSiblings: {
        value: async function (this: Positioned) {
          return stripThenable((await this.allPositionedSiblings()).excluding(this));
        },
        writable: true,
        configurable: true,
      },
    });
  },
};

export const Positionable = defineModule(
  {
    [included](base: typeof Base): void {
      extend(base, ClassMethods);

      base.scope("positioned", function () {
        return this.order("position_score", "id");
      });

      base.scope("before", function (this: Scoped, other: Positioned) {
        return this.positioned().where("position_score < ?", other.position_score);
      });
      base.scope("after", function (this: Scoped, other: Positioned) {
        return this.positioned().where("position_score > ?", other.position_score);
      });

      base.aroundCreate(":insertAtDefaultPosition");
      base.afterSaveCommit(":rebalancePositions", { if: ":isRebalanceRequired" });
    },

    async previous(this: Positioned): Promise<Positioned | null> {
      return await (await this.otherPositionedSiblings()).before(this).last();
    },

    async next(this: Positioned): Promise<Positioned | null> {
      return await (await this.otherPositionedSiblings()).after(this).first();
    },

    async moveToPosition(
      this: Positioned,
      offset: number,
      { followedBy = [] }: { followedBy?: Base[] } = {},
    ): Promise<void> {
      await this.withPositioningLock(async () => {
        const allToMove = [this, ...(followedBy as Positioned[])];
        const [before, after] = await this.beforeAndAfterFor({ offset, moving: allToMove });
        const gap = (after - before) / (allToMove.length + 1);

        for (const [i, item] of allToMove.entries()) {
          await item.updateBang({ position_score: before + (i + 1) * gap });
        }

        if (gap < REBALANCE_THRESHOLD) this.rememberToRebalancePositions();
      });
    },

    async positionAsPercentage(this: Positioned): Promise<number> {
      return (
        (100 * (await this.ordinalPosition())) /
        (await (await this.allPositionedSiblings()).count())
      );
    },
  },
  undefined,
  {
    async ordinalPosition(this: Positioned): Promise<number> {
      return (await (await this.otherPositionedSiblings()).before(this).count()) + 1;
    },

    async insertAtDefaultPosition(this: Positioned, block: () => Promise<void>): Promise<void> {
      await this.withPositioningLock(async () => {
        await this.positionAtEnd();
        await block();
      });
    },

    async positionAtStart(this: Positioned): Promise<void> {
      this.position_score =
        (((await (await this.allPositionedSiblings()).minimum("position_score")) as
          | number
          | null) ?? 2 * ELEMENT_GAP) - ELEMENT_GAP;
    },

    async positionAtEnd(this: Positioned): Promise<void> {
      this.position_score =
        (((await (await this.allPositionedSiblings()).maximum("position_score")) as
          | number
          | null) ?? 0) + ELEMENT_GAP;
    },

    async beforeAndAfterFor(
      this: Positioned,
      { offset, moving }: { offset: number; moving: Positioned[] },
    ): Promise<[number, number]> {
      const all = await this.allPositionedSiblings();
      const otherItems = all.excluding(...moving);
      let before: number;
      let after: number;

      if (offset < 1) {
        after = ((await all.minimum("position_score")) as number | null) ?? 2 * ELEMENT_GAP;
        before = after - ELEMENT_GAP;
      } else {
        const scores = (await otherItems
          .offset(offset - 1)
          .limit(2)
          .pluck("position_score")) as number[];
        before = scores[0] ?? ((await all.maximum("position_score")) as number);
        after = scores[1] ?? before + (moving.length + 1) * ELEMENT_GAP;
      }

      return [before, after];
    },

    rememberToRebalancePositions(this: Positioned): void {
      this.rebalanceRequired = true;
    },

    isRebalanceRequired(this: Positioned): boolean | undefined {
      return this.rebalanceRequired;
    },

    async rebalancePositions(this: Positioned): Promise<void> {
      await this.withPositioningLock(async () => {
        const klass = this.constructor;
        const odered = (await this.allPositionedSiblings()).select(
          "row_number() over (order by position_score, id) as new_score, id",
        );
        const sql = `update ${klass.tableName} set position_score = new_score from (${odered.toSql()}) as ordered where ${klass.tableName}.id = ordered.id`;

        await (await klass.leaseConnection()).execute(sql);
      });
      this.rebalanceRequired = false;
    },

    async withPositioningLock<T>(
      this: Positioned,
      block: () => Promise<T>,
    ): Promise<T | undefined> {
      return await (await this.positioningParent()).withLock(block);
    },
  },
);
