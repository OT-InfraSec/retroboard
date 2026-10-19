import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3100", httpCredentials: { username: "e2e", password: "pw" } },
  webServer: [
    { command: "node e2e/fake-github.mjs", cwd: "..", port: 4010, reuseExistingServer: false },
    {
      command: "npm run build && npm run start",
      cwd: "..",
      port: 3100,
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        PORT: "3100",
        BASIC_AUTH_PASSWORD: "pw",
        GITHUB_TOKEN: "test-token",
        GITHUB_REPO: "acme/planning",
        GITHUB_API_URL: "http://localhost:4010",
        PUBLIC_BASE_URL: "http://localhost:3100",
        DATABASE_URL: "pglite:",
      },
    },
  ],
});
