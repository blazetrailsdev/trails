export interface GeneratorFixture {
  name: string;
  command: string;
  expectedFiles: string[];
}

export const fixtures = {
  docs: [
    {
      name: "User",
      command: "generate model User name:string email:string",
      expectedFiles: [
        "app/models/user.ts",
        "test/models/user.test.ts",
        "db/migrate/*_create_users.ts",
      ],
    },
    {
      name: "Folder",
      command: "generate model Folder name:string user_id:integer parent_id:integer",
      expectedFiles: [
        "app/models/folder.ts",
        "test/models/folder.test.ts",
        "db/migrate/*_create_folders.ts",
      ],
    },
    {
      name: "Document",
      command: "generate model Document title:string body:text user_id:integer folder_id:integer",
      expectedFiles: [
        "app/models/document.ts",
        "test/models/document.test.ts",
        "db/migrate/*_create_documents.ts",
      ],
    },
  ] satisfies GeneratorFixture[],

  music: [
    {
      name: "Artist",
      command: "generate model Artist name:string bio:text",
      expectedFiles: [
        "app/models/artist.ts",
        "test/models/artist.test.ts",
        "db/migrate/*_create_artists.ts",
      ],
    },
    {
      name: "Album",
      command: "generate model Album title:string artist_id:integer release_date:date",
      expectedFiles: [
        "app/models/album.ts",
        "test/models/album.test.ts",
        "db/migrate/*_create_albums.ts",
      ],
    },
    {
      name: "Track",
      command:
        "generate model Track title:string album_id:integer track_number:integer duration:integer",
      expectedFiles: [
        "app/models/track.ts",
        "test/models/track.test.ts",
        "db/migrate/*_create_tracks.ts",
      ],
    },
    {
      name: "Genre",
      command: "generate model Genre name:string",
      expectedFiles: [
        "app/models/genre.ts",
        "test/models/genre.test.ts",
        "db/migrate/*_create_genres.ts",
      ],
    },
  ] satisfies GeneratorFixture[],

  finances: [
    {
      name: "Account",
      command: "generate model Account name:string balance:decimal",
      expectedFiles: [
        "app/models/account.ts",
        "test/models/account.test.ts",
        "db/migrate/*_create_accounts.ts",
      ],
    },
    {
      name: "Category",
      command: "generate model Category name:string parent_id:integer",
      expectedFiles: [
        "app/models/category.ts",
        "test/models/category.test.ts",
        "db/migrate/*_create_categories.ts",
      ],
    },
    {
      name: "Transaction",
      command:
        "generate model Transaction description:string amount:decimal account_id:integer category_id:integer date:date",
      expectedFiles: [
        "app/models/transaction.ts",
        "test/models/transaction.test.ts",
        "db/migrate/*_create_transactions.ts",
      ],
    },
    {
      name: "Budget",
      command:
        "generate model Budget category_id:integer amount:decimal period_start:date period_end:date",
      expectedFiles: [
        "app/models/budget.ts",
        "test/models/budget.test.ts",
        "db/migrate/*_create_budgets.ts",
      ],
    },
  ] satisfies GeneratorFixture[],
};
