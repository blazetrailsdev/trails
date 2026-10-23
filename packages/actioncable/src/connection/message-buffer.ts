import { rbModConstSet, rbObjClassname } from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

interface MessageBufferConnection {
  logger: { error(message: string): unknown };
  receive(message: string): unknown;
}

export class MessageBuffer {
  /** @internal */
  private readonly connection: MessageBufferConnection;
  /** @internal */
  private readonly bufferedMessages: string[];
  private _processing?: boolean;

  constructor(connection: MessageBufferConnection) {
    this.connection = connection;
    this.bufferedMessages = [];
  }

  append(message: unknown): void {
    if (this.isValid(message)) {
      if (this.isProcessing()) {
        this.receive(message);
      } else {
        this.buffer(message);
      }
    } else {
      this.connection.logger.error(
        `Couldn't handle non-string message: ${rbObjClassname(message)}`,
      );
    }
  }

  isProcessing(): boolean | undefined {
    return this._processing;
  }

  processBang(): void {
    this._processing = true;
    this.receiveBufferedMessages();
  }

  /** @internal */
  private isValid(message: unknown): message is string {
    return typeof message === "string";
  }

  /** @internal */
  private receive(message: string): void {
    this.connection.receive(message);
  }

  /** @internal */
  private buffer(message: string): void {
    this.bufferedMessages.push(message);
  }

  /** @internal */
  private receiveBufferedMessages(): void {
    while (this.bufferedMessages.length !== 0) this.receive(this.bufferedMessages.shift()!);
  }
}

rbModConstSet(Connection, "MessageBuffer", MessageBuffer);
