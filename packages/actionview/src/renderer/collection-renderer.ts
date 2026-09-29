import { Notifications } from "@blazetrails/activesupport";
import { NotImplementedError, hasKey, rbObjRespondTo } from "@blazetrails/ruby-compat";

import {
  EmptyCollection,
  RenderedCollection,
  RenderedTemplate,
  localVariable,
  partialPath,
} from "./abstract-renderer.js";
import type {
  ObjectRenderingHost,
  RenderableTemplate,
  RenderOptions,
  ViewContext,
} from "./abstract-renderer.js";
import type { LookupContext } from "../lookup-context.js";
import { PartialRenderer } from "./partial-renderer.js";
import type { CollectionCachingView } from "./partial-renderer/collection-caching.js";

/** @internal */
export type IterationVariables = readonly string[];

type Collection = readonly unknown[];

type Relation = PromiseLike<readonly unknown[]> & {
  readonly isLoaded: boolean;
  skipPreloadingBang(): unknown;
  preloadAssociations(records: Collection): Promise<void>;
};

function isThenable<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return typeof (value as PromiseLike<T> | null)?.then === "function";
}

export class PartialIteration {
  readonly size: number;

  index: number;

  constructor(size: number) {
    this.size = size;
    this.index = 0;
  }

  isFirst(): boolean {
    return this.index === 0;
  }

  isLast(): boolean {
    return this.index === this.size - 1;
  }

  /** @internal */
  iterateBang(): void {
    this.index += 1;
  }
}

/** @internal */
export class CollectionIterator {
  protected collection: Collection;

  constructor(collection: Collection) {
    this.collection = collection;
  }

  each(blk: (object: unknown) => void): void {
    this.collection.forEach((object) => blk(object));
  }

  size(): number {
    return this.collection.length;
  }

  length(): number {
    return rbObjRespondTo(this.collection, "length") ? this.collection.length : this.size();
  }

  preloadBang(): void | Promise<void> {}
}

/** @internal */
export class SameCollectionIterator extends CollectionIterator {
  protected path: string;

  protected variables: IterationVariables;

  constructor(collection: Collection, path: string, variables: IterationVariables) {
    super(collection);
    this.path = path;
    this.variables = variables;
  }

  fromCollection(collection: Collection): SameCollectionIterator {
    return new (this.constructor as new (
      collection: Collection,
      path: string,
      variables: IterationVariables,
    ) => SameCollectionIterator)(collection, this.path, this.variables);
  }

  eachWithInfo(
    blk: (object: unknown, variables: IterationVariables) => void,
  ): void | Promise<void> {
    const variables = [this.path, ...this.variables];
    this.collection.forEach((o) => blk(o, variables));
  }
}

/** @internal */
export class PreloadCollectionIterator extends SameCollectionIterator {
  private relation: Relation;

  constructor(
    collection: Collection,
    path: string,
    variables: IterationVariables,
    relation: Relation,
  ) {
    super(collection, path, variables);
    if (!relation.isLoaded) relation.skipPreloadingBang();
    this.relation = relation;
  }

  override fromCollection(collection: Collection): SameCollectionIterator {
    return new PreloadCollectionIterator(collection, this.path, this.variables, this.relation);
  }

  override async eachWithInfo(
    blk: (object: unknown, variables: IterationVariables) => void,
  ): Promise<void> {
    await this.preloadBang();
    super.eachWithInfo(blk);
  }

  override async preloadBang(): Promise<void> {
    await this.relation.preloadAssociations(this.collection);
  }
}

/** @internal */
export class MixedCollectionIterator extends CollectionIterator {
  private paths: readonly IterationVariables[];

  constructor(collection: Collection, paths: readonly IterationVariables[]) {
    super(collection);
    this.paths = paths;
  }

  eachWithInfo(blk: (object: unknown, variables: IterationVariables) => void): void {
    this.collection.forEach((o, i) => blk(o, this.paths[i]));
  }
}

/** @internal */
export class CollectionRenderer extends PartialRenderer implements ObjectRenderingHost {
  /** @internal */
  localVariable = localVariable;
  /** @internal */
  partialPath = partialPath;

  /** @internal */
  contextPrefix: string;

  constructor(lookupContext: LookupContext, options: RenderOptions = {}) {
    super(lookupContext, options);
    this.contextPrefix = lookupContext.prefixes[0] ?? "";
  }

  renderCollectionWithPartial(
    collection: Collection | Relation,
    partial: string,
    context: ViewContext,
    block: unknown,
  ): RenderedCollection | EmptyCollection | Promise<RenderedCollection | EmptyCollection> {
    const iterVars = this.retrieveVariable(partial);

    const collectionIterator = rbObjRespondTo(collection, "preloadAssociations")
      ? new PreloadCollectionIterator(
          collection as unknown as Collection,
          partial,
          iterVars,
          collection as Relation,
        )
      : new SameCollectionIterator(collection as Collection, partial, iterVars);

    const template = this.findTemplate(partial, [...Object.keys(this.locals), ...iterVars]);

    let layout: RenderableTemplate | null = null;
    const optionsLayout = this.options.layout;
    if (block == null && optionsLayout != null && optionsLayout !== false) {
      layout = this.findTemplate(String(optionsLayout), [...Object.keys(this.locals), ...iterVars]);
    }

    if (isThenable(collection)) {
      return Promise.resolve(collection).then((records) =>
        this.renderCollection(
          collectionIterator.fromCollection(records),
          context,
          partial,
          template,
          layout,
          block,
        ),
      );
    }
    return this.renderCollection(collectionIterator, context, partial, template, layout, block);
  }

  renderCollectionDerivePartial(
    collection: readonly unknown[],
    context: ViewContext,
    block: unknown,
  ): RenderedCollection | EmptyCollection | Promise<RenderedCollection | EmptyCollection> {
    const paths = collection.map((o) => this.partialPath(o, context));

    if (paths.filter((path, i) => paths.indexOf(path) === i).length === 1) {
      return this.renderCollectionWithPartial(collection, paths[0], context, block);
    } else {
      if (this.options.cached != null && this.options.cached !== false) {
        // @nie disposition=port-real rails=actionview/lib/action_view/renderer/collection_renderer.rb:137
        throw new NotImplementedError(
          "render caching requires a template. Please specify a partial when rendering",
        );
      }

      const pathVariables = paths.map((path) => [path, ...this.retrieveVariable(path)]);
      const collectionIterator = new MixedCollectionIterator(collection, pathVariables);
      return this.renderCollection(collectionIterator, context, null, null, null, block);
    }
  }

  /** @internal */
  protected retrieveVariable(path: string): [string, string, string] {
    const variable = this.localVariable(path);
    return [variable, `${variable}_counter`, `${variable}_iteration`];
  }

  /** @internal */
  protected renderCollection(
    collection: SameCollectionIterator | MixedCollectionIterator,
    view: ViewContext,
    path: string | null,
    template: RenderableTemplate | null,
    layout: RenderableTemplate | null,
    block: unknown,
  ): RenderedCollection | EmptyCollection | Promise<RenderedCollection | EmptyCollection> {
    void block;
    const identifier = (template && template.identifier) || path;
    return Notifications.instrument<
      RenderedCollection | EmptyCollection | Promise<RenderedCollection | EmptyCollection>
    >(
      "render_collection.action_view",
      {
        identifier,
        layout: layout && layout.virtualPath,
        count: collection.length(),
      },
      (payload) => {
        let spacer: RenderedTemplate;
        if (hasKey(this.options, "spacerTemplate")) {
          const spacerTemplate = this.findTemplate(
            String(this.options.spacerTemplate),
            Object.keys(this.locals),
          );
          spacer = this.buildRenderedTemplate(
            spacerTemplate.render(view, this.locals) as string,
            spacerTemplate,
          );
        } else {
          spacer = RenderedTemplate.EMPTY_SPACER;
        }

        const collectionBody = template
          ? this.cacheCollectionRender(
              payload,
              view as unknown as CollectionCachingView,
              template,
              collection as SameCollectionIterator,
              (filteredCollection) =>
                this.collectionWithTemplate(view, template, layout, filteredCollection),
            )
          : this.collectionWithTemplate(view, null, layout, collection);

        const build = (body: RenderedTemplate[]): RenderedCollection | EmptyCollection => {
          if (body.length === 0) {
            return RenderedCollection.empty(this.lookupContext.formats[0] as string);
          }

          return this.buildRenderedCollection(body, spacer);
        };
        return collectionBody instanceof Promise
          ? collectionBody.then(build)
          : build(collectionBody);
      },
    );
  }

  /** @internal */
  protected collectionWithTemplate(
    view: ViewContext,
    template: RenderableTemplate | null,
    layout: RenderableTemplate | null,
    collection: SameCollectionIterator | MixedCollectionIterator,
  ): RenderedTemplate[] | Promise<RenderedTemplate[]> {
    const locals = this.locals;
    const cache: Record<string, RenderableTemplate> = {};

    const partialIteration = new PartialIteration(collection.size());

    const rendered: RenderedTemplate[] = [];
    const each = collection.eachWithInfo((object, [path, as, counter, iteration]) => {
      const index = partialIteration.index;

      locals[as] = object;
      locals[counter] = index;
      locals[iteration] = partialIteration;

      const _template = (cache[path] ??=
        template ?? this.findTemplate(path, [...Object.keys(this.locals), as, counter, iteration]));

      let content = _template.render(view, locals, null, {
        implicitLocals: [counter, iteration],
      }) as string;
      if (layout) content = layout.render(view, locals, null, {}, () => content) as string;
      partialIteration.iterateBang();
      rendered.push(this.buildRenderedTemplate(content, _template));
    });
    return each instanceof Promise ? each.then(() => rendered) : rendered;
  }
}
