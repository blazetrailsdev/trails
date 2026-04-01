import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/svelte";
import DatabaseBrowser from "./DatabaseBrowser.svelte";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { SqlJsAdapter } from "../../sql-js-adapter.js";
import { VirtualFS } from "../../virtual-fs.js";

let SQL: SqlJsStatic;
let adapter: SqlJsAdapter;
let vfs: VirtualFS;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  adapter = new SqlJsAdapter(new SQL.Database());
  vfs = new VirtualFS(adapter);
});

afterEach(() => cleanup());

describe("DatabaseBrowser", () => {
  it("shows empty state when no tables exist", async () => {
    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getByTestId("db-empty")).toBeTruthy());
    expect(screen.getByTestId("db-empty").textContent).toContain("No tables");
  });

  it("lists tables with row counts", async () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Alice')");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Bob')");
    adapter.execRaw("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)");

    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getAllByTestId("db-table").length).toBe(2));

    const tables = screen.getAllByTestId("db-table");
    const usersTable = tables.find((t) => t.getAttribute("data-table") === "users");
    expect(usersTable?.textContent).toContain("users");
    expect(usersTable?.textContent).toContain("2 rows");
  });

  it("excludes VFS internal tables", async () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getAllByTestId("db-table").length).toBe(1));

    const tableNames = screen.getAllByTestId("db-table").map((t) => t.getAttribute("data-table"));
    expect(tableNames).not.toContain("_vfs_files");
  });

  it("expands table to show columns on click", async () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT)");
    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getByTestId("db-table")).toBeTruthy());

    const button = screen.getByTestId("db-table");
    await fireEvent.click(button);

    const columns = screen.getAllByTestId("db-column");
    expect(columns.length).toBe(3);

    const idCol = columns.find((c) => c.textContent?.includes("id"));
    expect(idCol?.textContent).toContain("INTEGER");
    expect(idCol?.textContent).toContain("PK");

    const nameCol = columns.find((c) => c.textContent?.includes("name"));
    expect(nameCol?.textContent).toContain("TEXT");
    expect(nameCol?.textContent).toContain("NOT NULL");
  });

  it("collapses table on second click", async () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getByTestId("db-table")).toBeTruthy());

    const button = screen.getByTestId("db-table");
    await fireEvent.click(button);
    expect(screen.getAllByTestId("db-column").length).toBeGreaterThan(0);

    await fireEvent.click(button);
    expect(screen.queryByTestId("db-column")).toBeNull();
  });

  it("refreshes when VFS changes", async () => {
    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getByTestId("db-empty")).toBeTruthy());

    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    vfs.write("trigger-refresh.ts", "");

    await waitFor(() => expect(screen.getByTestId("db-table")).toBeTruthy());
  });

  it("sorts tables alphabetically", async () => {
    adapter.execRaw("CREATE TABLE zebras (id INTEGER PRIMARY KEY)");
    adapter.execRaw("CREATE TABLE accounts (id INTEGER PRIMARY KEY)");
    adapter.execRaw("CREATE TABLE posts (id INTEGER PRIMARY KEY)");

    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getAllByTestId("db-table").length).toBe(3));

    const names = screen.getAllByTestId("db-table").map((t) => t.getAttribute("data-table"));
    expect(names).toEqual(["accounts", "posts", "zebras"]);
  });

  it("excludes schema_migrations table", async () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");
    adapter.execRaw("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)");

    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getAllByTestId("db-table").length).toBe(1));

    const names = screen.getAllByTestId("db-table").map((t) => t.getAttribute("data-table"));
    expect(names).not.toContain("schema_migrations");
  });

  it("shows data preview when table is expanded", async () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Alice')");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Bob')");

    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getByTestId("db-table")).toBeTruthy());

    const button = screen.getByTestId("db-table");
    await fireEvent.click(button);

    await waitFor(() => expect(screen.getByTestId("db-preview")).toBeTruthy());
    expect(screen.getByTestId("db-preview").textContent).toContain("Alice");
    expect(screen.getByTestId("db-preview").textContent).toContain("Bob");
  });

  it("navigates tables with keyboard", async () => {
    adapter.execRaw("CREATE TABLE accounts (id INTEGER PRIMARY KEY)");
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");

    render(DatabaseBrowser, { props: { adapter, vfs } });
    await waitFor(() => expect(screen.getAllByTestId("db-table").length).toBe(2));

    const browser = screen.getByTestId("database-browser");
    await fireEvent.keyDown(browser, { key: "ArrowDown" });
    await fireEvent.keyDown(browser, { key: "ArrowDown" });
    await fireEvent.keyDown(browser, { key: "Enter" });

    await waitFor(() => expect(screen.getAllByTestId("db-column").length).toBeGreaterThan(0));
  });
});
