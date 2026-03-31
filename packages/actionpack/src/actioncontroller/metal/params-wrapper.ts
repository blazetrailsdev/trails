/**
 * ActionController::ParamsWrapper::Options
 *
 * Configuration data container for parameter wrapping. The wrapping
 * logic itself lives in actioncontroller/params-wrapper.ts.
 * @see https://api.rubyonrails.org/classes/ActionController/ParamsWrapper.html
 */

export class Options {
  name: string | null;
  format: string[] | null;
  include: string[] | null;
  exclude: string[] | null;
  klass: unknown;
  model: unknown;

  constructor(
    name: string | null = null,
    format: string[] | null = null,
    include: string[] | null = null,
    exclude: string[] | null = null,
    klass: unknown = null,
    model: unknown = null,
  ) {
    this.name = name;
    this.format = format;
    this.include = include;
    this.exclude = exclude;
    this.klass = klass;
    this.model = model;
  }
}
