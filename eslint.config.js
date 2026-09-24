import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/lib/**",
      "**/dist/**",
      "**/build/**",
      "**/generated/**",
      "packages/proto/src/generated/**",
      "**/coverage/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["packages/*/src/**/*.ts", "packages/*/tests/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          "./packages/proto/tsconfig.json",
          "./packages/client/tsconfig.json",
          "./packages/mcp/tsconfig.eslint.json",
        ],
        tsconfigRootDir: import.meta.dirname,
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        module: "readonly",
        require: "readonly",
        exports: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      // Disable base no-unused-vars in favor of TypeScript version
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
];
