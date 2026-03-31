import { Message } from "./message.js";
import { MessageSerializer } from "./message-serializer.js";

/**
 * A message serializer that mirrors Rails'
 * ActiveRecord::Encryption::MessagePackMessageSerializer API but
 * currently delegates entirely to the JSON-based MessageSerializer.
 *
 * This implementation does not yet use MessagePack or any binary
 * serialization format; it exists as a compatibility layer so callers
 * can rely on the same interface as Rails while we remain JSON-only.
 *
 * TODO: Optionally integrate a real MessagePack library (e.g.
 * @msgpack/msgpack) in the future for compact binary serialization.
 *
 * Mirrors: ActiveRecord::Encryption::MessagePackMessageSerializer
 */
export class MessagePackMessageSerializer {
  private _fallback: MessageSerializer;

  constructor() {
    this._fallback = new MessageSerializer();
  }

  dump(message: Message): string {
    return this._fallback.dump(message);
  }

  load(serialized: string): Message {
    return this._fallback.load(serialized);
  }
}
