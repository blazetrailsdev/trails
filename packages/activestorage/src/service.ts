import { Notifications, presenceIn } from "@blazetrails/activesupport";
import { ContentDisposition } from "@blazetrails/actionpack";
import { NotImplementedError, rbModName } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import type { Filename } from "./filename.js";
import { Configurator } from "./service/configurator.js";

export class Service {
  static Configurator = Configurator;

  name: string | null = null;
  protected public: boolean | undefined;

  static configure(
    serviceName: string,
    configurations: Record<string, Record<string, unknown>>,
  ): Service {
    return Configurator.build(serviceName, configurations);
  }

  /** @internal */
  static build(
    this: new (config: Record<string, unknown>) => Service,
    {
      configurator: _configurator,
      name,
      service: _service = null,
      ...serviceConfig
    }: { configurator: Configurator; name: string; service?: unknown; [k: string]: unknown },
  ): Service {
    const serviceInstance = new this(serviceConfig);
    serviceInstance.name = name;
    return serviceInstance;
  }

  async upload(
    _key: string,
    _io: unknown,
    _options: { checksum?: string | null; [k: string]: unknown } = {},
  ): Promise<void> {
    throw new NotImplementedError();
  }

  async updateMetadata(_key: string, _metadata: Record<string, unknown> = {}): Promise<void> {}

  async download(_key: string): Promise<Uint8Array> {
    throw new NotImplementedError();
  }

  async downloadChunk(_key: string, _range: unknown): Promise<Uint8Array> {
    throw new NotImplementedError();
  }

  async compose(
    _sourceKeys: string[],
    _destinationKey: string,
    _options: {
      filename?: Filename | null;
      contentType?: string | null;
      disposition?: string | null;
      customMetadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    throw new NotImplementedError();
  }

  async delete(_key: string): Promise<void> {
    throw new NotImplementedError();
  }

  async deletePrefixed(_prefix: string): Promise<void> {
    throw new NotImplementedError();
  }

  async isExist(_key: string): Promise<boolean> {
    throw new NotImplementedError();
  }

  url(key: string, options: Record<string, unknown> = {}): string {
    return this.instrument("url", { key: key }, (payload) => {
      let generatedUrl: string;
      if (this.isPublic()) {
        generatedUrl = this.publicUrl(key, options);
      } else {
        generatedUrl = this.privateUrl(key, options as PrivateUrlOptions);
      }

      payload.url = generatedUrl;

      return generatedUrl;
    });
  }

  urlForDirectUpload(
    _key: string,
    _options: {
      expiresIn: unknown;
      contentType: string;
      contentLength: number;
      checksum: string;
      customMetadata?: Record<string, unknown>;
    },
  ): string {
    throw new NotImplementedError();
  }

  headersForDirectUpload(
    _key: string,
    _options: {
      filename: Filename;
      contentType: string;
      contentLength: number;
      checksum: string;
      customMetadata?: Record<string, unknown>;
    },
  ): Record<string, string> {
    return {};
  }

  isPublic(): boolean | undefined {
    return this.public;
  }

  /** @internal */
  protected privateUrl(_key: string, _options: PrivateUrlOptions): string {
    throw new NotImplementedError();
  }

  /** @internal */
  protected publicUrl(_key: string, _options: Record<string, unknown> = {}): string {
    throw new NotImplementedError();
  }

  /** @internal */
  protected customMetadataHeaders(_metadata: Record<string, unknown>): Record<string, string> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected instrument<T>(
    operation: string,
    payload: Record<string, unknown> = {},
    block?: (payload: Record<string, unknown>) => T,
  ): T {
    return Notifications.instrument(
      `service_${operation}.active_storage`,
      { ...payload, service: this.serviceName() },
      block,
    ) as T;
  }

  /** @internal */
  protected serviceName(): string {
    return rbModName(this.constructor)!.split("::")[2].replaceAll("Service", "");
  }

  /** @internal */
  protected contentDispositionWith({
    type = "inline",
    filename,
  }: {
    type?: string;
    filename: Filename;
  }): string {
    const disposition = presenceIn(String(type), ["attachment", "inline"]) ?? "inline";
    return ContentDisposition.format({ disposition: disposition, filename: filename.sanitized() });
  }
}

type PrivateUrlOptions = {
  expiresIn: unknown;
  filename: Filename;
  disposition: string;
  contentType: string;
  [k: string]: unknown;
};

ActiveStorage.Service = Service;
