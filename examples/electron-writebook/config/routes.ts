import { Trails } from "@blazetrails/trailties";
import type { Base } from "@blazetrails/activerecord";

type RouteFor = (name: string, ...args: unknown[]) => string;

/** @noRailsEquivalent CONVERGEABLE direct-route-blocks-read-async-associations */
function loadedBook(leaf: Base): Base & { slug: string } {
  return leaf.association("book").target as Base & { slug: string };
}

Trails.application.routes().draw(function () {
  this.root("books#index");

  this.resource("first_run", { only: ["show", "create"] });

  this.resource("session", { only: ["new", "create", "destroy"] }, function () {
    this.scope({ module: "sessions" }, function () {
      this.resources("transfers", { only: ["show", "update"] });
    });
  });

  this.get("join/:join_code", { to: "users#new", as: "join" });
  this.post("join/:join_code", { to: "users#create" });

  this.resource("account", { only: [] }, function () {
    this.scope({ module: "accounts" }, function () {
      this.resource("join_code", { only: "create" });
      this.resource("custom_styles", { only: ["edit", "update"] });
    });
  });

  this.resources("books", { except: ["index", "show"] }, function () {
    this.resource("publication", {
      controller: "books/publications",
      only: ["show", "edit", "update"],
    });
    this.resource("bookmark", { controller: "books/bookmarks", only: "show" });

    this.scope({ module: "books" }, function () {
      this.namespace("leaves", function () {
        this.resources("moves", { only: "create" });
      });

      this.resource("search");
    });

    this.resources("sections");
    this.resources("pictures");
    this.resources("pages");
  });

  this.get("/:id/:slug", { to: "books#show", constraints: { id: /\d+/ }, as: "slugged_book" });
  this.get("/:book_id/:book_slug/:id/:slug", {
    to: "leafables#show",
    constraints: { book_id: /\d+/, id: /\d+/ },
    as: "slugged_leafable",
  });

  this.direct("book_slug", undefined, function (this: { routeFor: RouteFor }, book, options) {
    return this.routeFor("slugged_book", book, (book as { slug: string }).slug, options);
  });

  this.direct("leafable_slug", undefined, function (this: { routeFor: RouteFor }, leaf, options) {
    const book = loadedBook(leaf as Base);
    return this.routeFor(
      "slugged_leafable",
      book,
      book.slug,
      leaf,
      (leaf as { slug(): string }).slug(),
      options,
    );
  });

  this.resources("pages", { only: [] }, function () {
    this.scope({ module: "pages" }, function () {
      this.resources("edits", { only: "show" });
    });
  });

  this.resources("users", function () {
    this.scope({ module: "users" }, function () {
      this.resource("profile");
    });
  });

  this.direct("leafable", undefined, function (this: { routeFor: RouteFor }, leaf, options) {
    return this.routeFor(
      `book_${(leaf as { leafableName: string }).leafableName}`,
      loadedBook(leaf as Base),
      leaf,
      options,
    );
  });

  this.direct("edit_leafable", undefined, function (this: { routeFor: RouteFor }, leaf, options) {
    return this.routeFor(
      `edit_book_${(leaf as { leafableName: string }).leafableName}`,
      loadedBook(leaf as Base),
      leaf,
      options,
    );
  });

  this.namespace("action_text", { path: null }, function () {
    this.get("/u/*slug", { to: "markdown/uploads#show", as: "markdown_upload" });
    this.post("/uploads", { to: "markdown/uploads#create", as: "markdown_uploads" });
  });

  this.get("up", { to: "trails/health#show", as: "trails_health_check" });
});
