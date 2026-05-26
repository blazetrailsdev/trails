export interface ServerAddress {
  port: number;
  family?: string;
  address?: string;
}

export interface ServerHandle {
  address(): ServerAddress | string | null;
  close(callback?: (err?: Error) => void): void;
}

export interface ServerApp {
  listen(port: number, host?: string, callback?: () => void): ServerHandle;
}

export class Server {
  static silencePuma = false;
  private _server: ServerHandle | undefined;
  private _host = "127.0.0.1";
  private _port = 0;

  get host(): string {
    return this._host;
  }
  get port(): number {
    return this._port;
  }

  run(app: ServerApp): Promise<void> {
    return this.setup(app);
  }

  async stop(): Promise<void> {
    if (!this._server) return;
    return new Promise((resolve, reject) => {
      this._server!.close((err) => {
        this._server = undefined;
        this._port = 0;
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /** @internal */
  private setup(app: ServerApp): Promise<void> {
    return new Promise((resolve) => {
      this.setServer(app, resolve);
    });
  }

  /** @internal */
  private setServer(app: ServerApp, callback: () => void): void {
    this._server = app.listen(0, this._host, () => {
      this.setPort();
      callback();
    });
  }

  /** @internal */
  private setPort(): void {
    const addr = this._server!.address();
    if (addr && typeof addr === "object") this._port = addr.port;
  }
}
