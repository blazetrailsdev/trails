import { NotImplementedError } from "../errors.js";
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

  // Rails returns true here because real MessagePack is binary.
  // This implementation delegates to JSON, so false is correct for
  // our current output format — the guard in EncryptedAttributeType
  // that prevents binary data from being stored in text columns must
  // not fire while we're producing JSON strings.
  isBinary(): boolean {
    return this._fallback.isBinary();
  }
}

/** @internal */
function messageToHash(message: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::MessagePackMessageSerializer#message_to_hash is not implemented",
  );
}

/** @internal */
function headersToHash(headers: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::MessagePackMessageSerializer#headers_to_hash is not implemented",
  );
}

/** @internal */
function hashToMessage(data: any, level: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::MessagePackMessageSerializer#hash_to_message is not implemented",
  );
}

/** @internal */
function validateMessageDataFormat(data: any, level: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::MessagePackMessageSerializer#validate_message_data_format is not implemented",
  );
}

/** @internal */
function parseProperties(headers: any, level: any): never {
  throw new NotImplementedError(
    "ActiveRecord::Encryption::MessagePackMessageSerializer#parse_properties is not implemented",
  );
}
