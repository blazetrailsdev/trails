import { defineModule, included, isPresent, minutes } from "@blazetrails/activesupport";
import type { Base } from "@blazetrails/activerecord";
import type { Leaf } from "../leaf.ts";
import type { Leafable } from "../leafable.ts";

export const MINIMUM_TIME_BETWEEN_VERSIONS = minutes(10);

type Params = Record<string, unknown>;

interface Host extends Leaf {
  isRecordNewEdit(leafableParams: Params): Promise<boolean>;
  isLastEditOld(): Promise<boolean>;
  isWillChangeLeafable(leafableParams: Params): Promise<boolean>;
  updateWithoutRecordingEdit(leafParams: Params, leafableParams: Params): Promise<void>;
  updateAndRecordEdit(leafParams: Params, leafableParams: Params): Promise<void>;
  dupLeafableWithAttachments(leafable: Leafable): Promise<Leafable>;
}

export const Editable = defineModule(
  {
    [included](base: typeof Base): void {
      base.hasMany("edits", { dependent: "destroy" });

      base.afterUpdate(":recordMovedToTrash", { if: ":isWasTrashed" });
    },

    async edit(
      this: Host,
      {
        leafableParams = {},
        leafParams = {},
      }: { leafableParams?: Params; leafParams?: Params } = {},
    ): Promise<void> {
      if (await this.isRecordNewEdit(leafableParams)) {
        await this.updateAndRecordEdit(leafParams, leafableParams);
      } else {
        await this.updateWithoutRecordingEdit(leafParams, leafableParams);
      }
    },
  },
  undefined,
  {
    async isRecordNewEdit(this: Host, leafableParams: Params): Promise<boolean> {
      return (await this.isWillChangeLeafable(leafableParams)) && (await this.isLastEditOld());
    },

    async isLastEditOld(this: Host): Promise<boolean> {
      const last = await this.edits.last();
      return (
        (await this.edits.isEmpty()) ||
        last!.created_at.isBefore(MINIMUM_TIME_BETWEEN_VERSIONS.ago())
      );
    },

    async isWillChangeLeafable(this: Host, leafableParams: Params): Promise<boolean> {
      const leafable = await this.leafable;
      const attributes = leafable.attributes as Params;
      return isPresent(
        Object.entries(leafableParams).filter(([key, value]) => attributes[key] !== value),
      );
    },

    async updateWithoutRecordingEdit(
      this: Host,
      leafParams: Params,
      leafableParams: Params,
    ): Promise<void> {
      await this.transaction(async () => {
        await (await this.leafable).updateBang(leafableParams);

        await (await this.edits.last())?.touch();
        await this.updateBang(leafParams);
      });
    },

    async updateAndRecordEdit(
      this: Host,
      leafParams: Params,
      leafableParams: Params,
    ): Promise<void> {
      await this.transaction(async () => {
        const leafable = await this.leafable;
        const newLeafable = await this.dupLeafableWithAttachments(leafable);
        await newLeafable.updateBang(leafableParams);

        await this.edits.revision().createBang({ leafable });
        await this.updateBang(
          (leafParams as unknown as { merge(o: object): Params }).merge({ leafable: newLeafable }),
        );
      });
    },

    async dupLeafableWithAttachments(this: Host, leafable: Leafable): Promise<Leafable> {
      const copy = leafable.dup();
      const klass = leafable.constructor as typeof Base & {
        attachmentReflections: Record<string, unknown>;
      };
      for (const name of Object.keys(klass.attachmentReflections ?? {})) {
        const source = (leafable as unknown as Record<string, { blob: Promise<unknown> }>)[name];
        await (copy as unknown as Record<string, { attach(b: unknown): Promise<void> }>)[
          name
        ].attach(await source.blob);
      }
      return copy;
    },

    async recordMovedToTrash(this: Host): Promise<void> {
      await this.edits.trash().createBang({ leafable: await this.leafable });
    },

    isWasTrashed(this: Host): boolean {
      return this.isTrashed() && Object.hasOwn(this.previousChanges, "status");
    },
  },
);
