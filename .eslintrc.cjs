/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module"
  },
  extends: [
    "eslint:recommended",
    "plugin:prettier/recommended"
  ],
  plugins: [
    "prettier"
  ],
  // Foundry VTT globals (v13) used throughout the module
  globals: {
    foundry: "readonly",
    game: "readonly",
    ui: "readonly",
    CONFIG: "readonly",
    Hooks: "readonly",
    canvas: "readonly",
    Actor: "readonly",
    Item: "readonly",
    Scene: "readonly",
    fromUuid: "readonly",
    CONST: "readonly",
    // Additional Foundry/core globals referenced in legacy areas
    JournalEntry: "readonly",
    Folder: "readonly",
    DocumentSheetConfig: "readonly",
    jQuery: "readonly"
  },
  rules: {
    "prettier/prettier": "warn",
    "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    // Allow empty catch blocks (common in Foundry-safe guards) but warn elsewhere
    "no-empty": ["warn", { "allowEmptyCatch": true }],
    // Many code paths intentionally use constant conditions for guards; keep as warn
    "no-constant-condition": ["warn", { "checkLoops": false }],
    // Strings built for regexes sometimes intentionally escape chars; treat as warn
    "no-useless-escape": "warn"
  },
  env: {
    browser: true,
    es2022: true,
    node: true,
    jquery: true
  },
  ignorePatterns: [
    "node_modules/",
    "dist/",
    "coverage/"
  ]
};


