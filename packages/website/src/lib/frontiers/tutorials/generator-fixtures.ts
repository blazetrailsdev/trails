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
        "src/app/models/user.ts",
        "test/models/user.test.ts",
        "db/migrations/*-create-users.ts",
      ],
    },
    {
      name: "Folder",
      command: "generate model Folder name:string user_id:integer parent_id:integer",
      expectedFiles: [
        "src/app/models/folder.ts",
        "test/models/folder.test.ts",
        "db/migrations/*-create-folders.ts",
      ],
    },
    {
      name: "Document",
      command: "generate model Document title:string body:text user_id:integer folder_id:integer",
      expectedFiles: [
        "src/app/models/document.ts",
        "test/models/document.test.ts",
        "db/migrations/*-create-documents.ts",
      ],
    },
  ] satisfies GeneratorFixture[],

  music: [
    {
      name: "Artist",
      command: "generate model Artist name:string bio:text",
      expectedFiles: [
        "src/app/models/artist.ts",
        "test/models/artist.test.ts",
        "db/migrations/*-create-artists.ts",
      ],
    },
    {
      name: "Album",
      command: "generate model Album title:string artist_id:integer release_date:date",
      expectedFiles: [
        "src/app/models/album.ts",
        "test/models/album.test.ts",
        "db/migrations/*-create-albums.ts",
      ],
    },
    {
      name: "Track",
      command:
        "generate model Track title:string album_id:integer track_number:integer duration:integer",
      expectedFiles: [
        "src/app/models/track.ts",
        "test/models/track.test.ts",
        "db/migrations/*-create-tracks.ts",
      ],
    },
    {
      name: "Genre",
      command: "generate model Genre name:string",
      expectedFiles: [
        "src/app/models/genre.ts",
        "test/models/genre.test.ts",
        "db/migrations/*-create-genres.ts",
      ],
    },
  ] satisfies GeneratorFixture[],

  finances: [
    {
      name: "Account",
      command: "generate model Account name:string balance:decimal",
      expectedFiles: [
        "src/app/models/account.ts",
        "test/models/account.test.ts",
        "db/migrations/*-create-accounts.ts",
      ],
    },
    {
      name: "Category",
      command: "generate model Category name:string parent_id:integer",
      expectedFiles: [
        "src/app/models/category.ts",
        "test/models/category.test.ts",
        "db/migrations/*-create-categories.ts",
      ],
    },
    {
      name: "Transaction",
      command:
        "generate model Transaction description:string amount:decimal account_id:integer category_id:integer date:date",
      expectedFiles: [
        "src/app/models/transaction.ts",
        "test/models/transaction.test.ts",
        "db/migrations/*-create-transactions.ts",
      ],
    },
    {
      name: "Budget",
      command:
        "generate model Budget category_id:integer amount:decimal period_start:date period_end:date",
      expectedFiles: [
        "src/app/models/budget.ts",
        "test/models/budget.test.ts",
        "db/migrations/*-create-budgets.ts",
      ],
    },
  ] satisfies GeneratorFixture[],
};
