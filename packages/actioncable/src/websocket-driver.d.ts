declare module "websocket-driver" {
  interface DriverRequest {
    method: string;
    url: string;
    headers: Record<string, string>;
  }

  interface DriverEvent {
    data: string | Uint8Array;
    reason: string;
    code: number;
    message: string;
  }

  interface DriverIO {
    on(event: "data", listener: (data: Uint8Array) => void): unknown;
  }

  interface Driver {
    readonly io: DriverIO;
    readonly protocol: string | undefined;
    on(event: "open" | "message" | "close" | "error", listener: (e: DriverEvent) => void): unknown;
    start(): boolean;
    text(message: string): boolean;
    binary(message: number[] | Uint8Array): boolean;
    close(reason?: string, code?: number): boolean;
    parse(chunk: Uint8Array): void;
  }

  const websocket: {
    http(request: DriverRequest, options?: { protocols?: readonly string[] }): Driver;
    isWebSocket(request: DriverRequest): boolean;
  };
  export default websocket;
}
