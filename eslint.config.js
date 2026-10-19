import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**"] },
  ...tseslint.configs.recommended,
);
