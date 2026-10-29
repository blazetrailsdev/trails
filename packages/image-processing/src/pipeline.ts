import { File, rbGetKwargs, rbObjRespondTo, Tempfile } from "@blazetrails/ruby-compat";
import type { Operation, Options } from "./chainable.js";
import { Error } from "./image-processing.js";

export class Pipeline {
  static DEFAULT_FORMAT = "jpg";

  declare private _source: unknown;
  declare private _loader: Record<string, unknown>;
  declare private _saver: Record<string, unknown>;
  declare private _format: string | null;
  declare private _operations: Operation[];
  declare private _processor: { call(options: Record<string, unknown>): unknown };
  declare private _destination: string | null | undefined;

  constructor(options: Partial<Options> & { destination?: string }) {
    if (options.source == null || options.source === false) {
      throw new Error("source file is not provided");
    }

    for (const [name, value] of Object.entries(options)) {
      (this as unknown as Record<string, unknown>)[`_${name}`] = value;
    }
  }

  get loader() {
    return this._loader;
  }

  get saver() {
    return this._saver;
  }

  get format() {
    return this._format;
  }

  get operations() {
    return this._operations;
  }

  get processor() {
    return this._processor;
  }

  get destination() {
    return this._destination;
  }

  async call(keywords: { save?: boolean } = {}): Promise<unknown> {
    rbGetKwargs(keywords, ["save"]);
    const { save = true } = keywords;
    if (save === false) {
      return this.callProcessor();
    } else if (this.destination != null) {
      const destination = this.destination;
      return this.handleDestination(() => this.callProcessor({ destination }));
    } else {
      return this.createTempfile((tempfile) =>
        this.callProcessor({ destination: tempfile.path()! }),
      );
    }
  }

  sourcePath(): string | null {
    const source = this.source();
    return typeof source === "string" ? source : null;
  }

  destinationFormat(): string {
    let format = this.destination != null ? this.determineFormat(this.destination) : null;
    format ??= this.format;
    const sourcePath = this.sourcePath();
    if (format == null && sourcePath != null) format = this.determineFormat(sourcePath);

    return format ?? Pipeline.DEFAULT_FORMAT;
  }

  /** @internal */
  private async callProcessor(options: { destination?: string } = {}): Promise<unknown> {
    return this.processor.call({
      source: this.source(),
      loader: this.loader,
      operations: this.operations,
      saver: this.saver,
      ...options,
    });
  }

  /** @internal */
  private async createTempfile(block: (tempfile: Tempfile) => Promise<unknown>): Promise<Tempfile> {
    let tempfile: Tempfile | undefined;
    try {
      tempfile = Tempfile.new(["image_processing", `.${this.destinationFormat()}`], null, {
        binmode: true,
      });

      await block(tempfile);

      tempfile.open();
      return tempfile;
    } catch (error) {
      if (tempfile) tempfile.closeBang();
      throw error;
    }
  }

  /** @internal */
  private async handleDestination(block: () => Promise<unknown>): Promise<unknown> {
    const destination = this.destination!;
    const destinationExisted = await File.isExistAsync(destination);
    try {
      return await block();
    } catch (error) {
      if ((await File.isExistAsync(destination)) && !destinationExisted) {
        await File.deleteAsync(destination);
      }
      throw error;
    }
  }

  /** @internal */
  private source(): unknown {
    if (typeof this._source === "string") {
      return this._source;
    } else if (rbObjRespondTo(this._source, "path")) {
      return (this._source as { path(): string }).path();
    } else if (rbObjRespondTo(this._source, "toPath")) {
      return (this._source as { toPath(): string }).toPath();
    } else {
      return this._source;
    }
  }

  /** @internal */
  private determineFormat(filePath: string): string | null {
    const extension = File.extname(filePath);

    return extension.length > 1 ? extension.slice(1) : null;
  }
}
