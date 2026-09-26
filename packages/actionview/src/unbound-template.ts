import type { DetailKey, TemplateDetails } from "./template-details.js";
import { Template } from "./template.js";

export class UnboundTemplate {
  readonly virtualPath: string;
  readonly details: TemplateDetails;
  private readonly _source: string;
  private readonly _identifier: string;
  private _templates = new Map<string, Template>();
  private _templatesDefault: Template | undefined;

  constructor(
    source: string,
    identifier: string,
    { details, virtualPath }: { details: TemplateDetails; virtualPath: string },
  ) {
    this._source = source;
    this._identifier = identifier;
    this.details = details;
    this.virtualPath = virtualPath;
  }

  get locale(): DetailKey {
    return this.details.locale;
  }

  get format(): DetailKey {
    return this.details.format;
  }

  get variant(): DetailKey {
    return this.details.variant;
  }

  get handler(): DetailKey {
    return this.details.handler;
  }

  bindLocals(locals: ReadonlyArray<string>): Template {
    let template = this._templates.get(JSON.stringify(locals)) ?? this._templatesDefault;
    if (template === undefined) {
      const normalizedLocals = this.normalizeLocals(locals);

      const key = JSON.stringify(normalizedLocals);
      template = this._templates.get(key) ?? this._templatesDefault;
      if (template === undefined) {
        template = this.buildTemplate(normalizedLocals);
        this._templates.set(key, template);
      }

      if (template.isStrictLocals()) {
        this._templates = new Map();
        this._templatesDefault = template;
      } else {
        this._templates.set(JSON.stringify(locals), template);
      }
    }
    return template;
  }

  builtTemplates(): Template[] {
    return [...this._templates.values()];
  }

  /** @internal */
  private buildTemplate(locals: ReadonlyArray<string>): Template {
    return new Template({
      source: this._source,
      identifier: this._identifier,
      extension: this.details.handler as string,

      format: this.details.formatOrDefault() as string | null,
      variant: (this.variant as string | null) ?? null,
      virtualPath: this.virtualPath,

      locals: [...locals],
    });
  }

  /** @internal */
  private normalizeLocals(locals: ReadonlyArray<string>): readonly string[] {
    return Object.freeze([...locals].sort());
  }
}
