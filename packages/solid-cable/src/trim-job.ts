import { Base, registerJob } from "@blazetrails/activejob";
import { Message } from "./message.js";
import { SolidCable } from "./solid-cable.js";

export class TrimJob extends Base {
  /**
   * @missingRailsArgs trimmable — CONVERGEABLE solid-cable-config-reads-are-async
   * @missingRailsArgs non_blocking_lock — CONVERGEABLE solid-cable-config-reads-are-async
   */
  async perform(): Promise<void> {
    if (!(await this.isTrim())) return;

    await Message.transaction(async () => {
      const ids = await (
        Message.trimmable(await SolidCable.messageRetention()) as unknown as typeof Message
      )
        .nonBlockingLock(await SolidCable.useSkipLocked())
        .limit(await this.trimBatchSize())
        .pluck("id");
      await Message.where({ id: ids }).deleteAll();
    });
  }

  /** @internal */
  private async trimBatchSize(): Promise<number> {
    return await SolidCable.trimBatchSize();
  }

  /** @internal */
  private async isTrim(): Promise<boolean> {
    const expiresPerWrite = (1 / (await this.trimBatchSize())) * SolidCable.trimChance();

    return Math.random() < expiresPerWrite - Math.floor(expiresPerWrite);
  }
}
registerJob("SolidCable::TrimJob", TrimJob);
