import type { TutorialStep } from "../types.js";

export const steps: TutorialStep[] = [
  {
    title: "Welcome to Frontiers",
    panes: ["filetree", "editor"],
    description: [
      "Welcome to your first Trails tutorial! In this guide you'll build a document management application from scratch.",
      "Let's start by creating a new Trails app. Click the Run button below to scaffold your project.",
    ],
    diagram: `graph TD
  A[New App] --> B[Models]
  B --> C[Migrations]
  C --> D[Database]
  D --> E[Queries]`,
    diagramLabel: "Tutorial overview: from new app to queries",
    actions: [{ command: "new docs" }],
    checkpoint: [
      { type: "file_exists", target: "src/config/routes.ts" },
      { type: "file_exists", target: "src/app/controllers/application-controller.ts" },
    ],
  },
  {
    title: "Your First Model",
    panes: ["filetree", "editor", "database"],
    description: [
      "Now let's create a User model with name and email attributes.",
      "This will generate both the model file and a database migration.",
    ],
    diagram: `erDiagram
  USERS {
    integer id PK
    string name
    string email
    datetime created_at
    datetime updated_at
  }`,
    diagramLabel: "Users table schema",
    actions: [{ command: "generate model User name:string email:string" }],
    checkpoint: [
      { type: "file_exists", target: "src/app/models/user.ts" },
      {
        type: "file_contains",
        target: "src/app/models/user.ts",
        value: 'this.attribute("name", "string")',
      },
    ],
  },
];
