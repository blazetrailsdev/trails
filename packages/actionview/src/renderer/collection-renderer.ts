import { Notifications } from "@blazetrails/activesupport";
import { NotImplementedError, rbObjRespondTo } from "@blazetrails/ruby-compat";

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
export interface PreloadableRelation {
  isLoaded(): boolean;
  skipPreloadingBang(): void;
  preloadAssociations(records: readonly unknown[]): void;
}

/** @internal */
export type IterationVariables = readonly string[];

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
  protected collection: readonly unknown[];

  constructor(collection: readonly unknown[]) {
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

  preloadBang(): void {}
}

/** @internal */
export class SameCollectionIterator extends CollectionIterator {
  protected path: string;

  protected variables: IterationVariables;

  constructor(collection: readonly unknown[], path: string, variables: IterationVariables) {
    super(collection);
    this.path = path;
    this.variables = variables;
  }

  fromCollection(collection: readonly unknown[]): SameCollectionIterator {
    return new (this.constructor as new (
      collection: readonly unknown[],
      path: string,
      variables: IterationVariables,
    ) => SameCollectionIterator)(collection, this.path, this.variables);
  }

  eachWithInfo(blk: (object: unknown, variables: IterationVariables) => void): void {
    const variables = [this.path, ...this.variables];
    this.collection.forEach((o) => blk(o, variables));
  }
}

/** @internal */
export class PreloadCollectionIterator extends SameCollectionIterator {
  private relation: PreloadableRelation;

  constructor(
    collection: readonly unknown[],
    path: string,
    variables: IterationVariables,
    relation: PreloadableRelation,
  ) {
    super(collection, path, variables);
    if (!relation.isLoaded()) relation.skipPreloadingBang();
    this.relation = relation;
  }

  override fromCollection(collection: readonly unknown[]): SameCollectionIterator {
    return new PreloadCollectionIterator(collection, this.path, this.variables, this.relation);
  }

  override eachWithInfo(blk: (object: unknown, variables: IterationVariables) => void): void {
    this.preloadBang();
    super.eachWithInfo(blk);
  }

  override preloadBang(): void {
    this.relation.preloadAssociations(this.collection);
  }
}

/** @internal */
export class MixedCollectionIterator extends CollectionIterator {
  private paths: readonly IterationVariables[];

  constructor(collection: readonly unknown[], paths: readonly IterationVariables[]) {
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

  async renderCollectionWithPartial(
    collection: readonly unknown[],
    partial: string,
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedCollection | EmptyCollection> {
    const iterVars = this.retrieveVariable(partial);

    const collectionIterator = rbObjRespondTo(collection, "preloadAssociations")
      ? new PreloadCollectionIterator(
          collection,
          partial,
          iterVars,
          collection as unknown as PreloadableRelation,
        )
      : new SameCollectionIterator(collection, partial, iterVars);

    const template = this.findTemplate(partial, [...Object.keys(this.locals), ...iterVars]);

    let layout: RenderableTemplate | null = null;
    const optionsLayout = this.options.layout;
    if (block == null && optionsLayout != null && optionsLayout !== false) {
      layout = this.findTemplate(String(optionsLayout), [...Object.keys(this.locals), ...iterVars]);
    }

    return this.renderCollection(collectionIterator, context, partial, template, layout, block);
  }

  async renderCollectionDerivePartial(
    collection: readonly unknown[],
    context: ViewContext,
    block: unknown,
  ): Promise<RenderedCollection | EmptyCollection> {
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
  protected async renderCollection(
    collection: SameCollectionIterator | MixedCollectionIterator,
    view: ViewContext,
    path: string | null,
    template: RenderableTemplate | null,
    layout: RenderableTemplate | null,
    block: unknown,
  ): Promise<RenderedCollection | EmptyCollection> {
    void block;
    const identifier = (template && template.identifier) || path;
    return Notifications.instrument<Promise<RenderedCollection | EmptyCollection>>(
      "render_collection.action_view",
      {
        identifier,
        layout: layout && layout.virtualPath,
        count: collection.length(),
      },
      async (payload) => {
        let spacer: RenderedTemplate;
        if ("spacerTemplate" in this.options) {
          const spacerTemplate = this.findTemplate(
            String(this.options.spacerTemplate),
            Object.keys(this.locals),
          );
          spacer = this.buildRenderedTemplate(
            await spacerTemplate.render(view, this.locals),
            spacerTemplate,
          );
        } else {
          spacer = RenderedTemplate.EMPTY_SPACER;
        }

        const collectionBody = template
          ? await this.cacheCollectionRender(
              payload,
              view as unknown as CollectionCachingView,
              template,
              collection as SameCollectionIterator,
              (filteredCollection) =>
                this.collectionWithTemplate(view, template, layout, filteredCollection),
            )
          : await this.collectionWithTemplate(view, null, layout, collection);

        if (collectionBody.length === 0) {
          return RenderedCollection.empty(this.lookupContext.formats[0] as string);
        }

        return this.buildRenderedCollection(collectionBody, spacer);
      },
    );
  }

  /** @internal */
  protected async collectionWithTemplate(
    view: ViewContext,
    template: RenderableTemplate | null,
    layout: RenderableTemplate | null,
    collection: SameCollectionIterator | MixedCollectionIterator,
  ): Promise<RenderedTemplate[]> {
    const locals = this.locals;
    const cache: Record<string, RenderableTemplate> = {};

    const partialIteration = new PartialIteration(collection.size());

    const pairs: [unknown, IterationVariables][] = [];
    collection.eachWithInfo((object, variables) => pairs.push([object, variables]));

    const rendered: RenderedTemplate[] = [];
    for (const [object, [path, as, counter, iteration]] of pairs) {
      const index = partialIteration.index;

      locals[as] = object;
      locals[counter] = index;
      locals[iteration] = partialIteration;

      const _template = (cache[path] ??=
        template ?? this.findTemplate(path, [...Object.keys(this.locals), as, counter, iteration]));

      let content = await _template.render(view, locals, null, {
        implicitLocals: [counter, iteration],
      });
      if (layout) {
        view.viewFlow?.set("layout", content);
        content = await layout.render(view, locals);
      }
      partialIteration.iterateBang();
      rendered.push(this.buildRenderedTemplate(content, _template));
    }
    return rendered;
  }
}
