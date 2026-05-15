/**
 * ActionController::Live
 *
 * Mix this module into your controller to stream data to the client.
 * @see https://api.rubyonrails.org/classes/ActionController/Live.html
 */

export class ClientDisconnected extends Error {
  constructor(message?: string) {
    super(message ?? "Client disconnected");
    this.name = "ClientDisconnected";
  }
}

export class Buffer {
  private _data: string[] = [];
  private _closed = false;

  write(chunk: string): void {
    if (this._closed) throw new ClientDisconnected();
    this._data.push(chunk);
  }

  close(): void {
    this._closed = true;
  }

  get closed(): boolean {
    return this._closed;
  }
}

export class SSE {
  private _stream: Buffer;
  private _retry?: number;
  private _event?: string;

  constructor(stream: Buffer, options: { retry?: number; event?: string } = {}) {
    this._stream = stream;
    this._retry = options.retry;
    this._event = options.event;
  }

  write(object: unknown, options: { event?: string; id?: string; retry?: number } = {}): void {
    const event = options.event ?? this._event;
    const retry = options.retry ?? this._retry;
    const id = options.id;

    const data = typeof object === "string" ? object : (JSON.stringify(object) ?? "null");

    let payload = "";
    if (id !== undefined) payload += `id: ${id}\n`;
    if (event !== undefined) payload += `event: ${event}\n`;
    if (retry !== undefined) payload += `retry: ${retry}\n`;

    for (const line of data.split(/\r?\n/)) {
      payload += `data: ${line}\n`;
    }
    payload += "\n";

    this._stream.write(payload);
  }

  close(): void {
    this._stream.close();
  }
}

export class Response {
  headers: Record<string, string> = {};
  stream: Buffer = new Buffer();
  status: number = 200;
}
