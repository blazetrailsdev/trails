import { Base, registerJob } from "@blazetrails/activejob";
import { Message } from "./message.js";
import { SolidCable } from "./solid-cable.js";

export class TrimJob extends Base {
  async perform(): Promise<void> {
    if (!this.isTrim()) return;

    await Message.transaction(async () => {
      const ids = await Message.trimmable()
        .nonBlockingLock()
        .limit(this.trimBatchSize())
        .pluck("id");
      await Message.where({ id: ids }).deleteAll();
    });
  }

  /** @internal */
  private trimBatchSize(): number {
    return SolidCable.trimBatchSize();
  }

  /** @internal */
  private isTrim(): boolean {
    const expiresPerWrite = (1 / this.trimBatchSize()) * SolidCable.trimChance();

    return Math.random() < expiresPerWrite - Math.floor(expiresPerWrite);
  }
}
registerJob("SolidCable::TrimJob", TrimJob);
