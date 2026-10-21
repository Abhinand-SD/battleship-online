import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real server (in-memory store, fast timings) and the Vite dev server.
 * Two browser contexts play a complete online match against each other.
 */
const SERVER_PORT = 3101;
const CLIENT_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${CLIENT_PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      // Uses the locally installed Google Chrome; set PW_CHANNEL=chromium to use Playwright's bundled browser.
      use: { ...devices['Desktop Chrome'], channel: process.env['PW_CHANNEL'] ?? 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../server',
      port: SERVER_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(SERVER_PORT),
        HOST: '127.0.0.1',
        DATABASE_URL: '',
        JWT_SECRET: 'e2e-secret-e2e-secret-e2e-secret',
        LOG_LEVEL: 'warn',
        LOG_PRETTY: 'false',
        LOBBY_COUNTDOWN_MS: '500',
        BATTLE_COUNTDOWN_MS: '500',
        AI_MOVE_DELAY_MS: '150',
        RECONNECT_GRACE_MS: '15000',
        CORS_ORIGINS: `http://localhost:${CLIENT_PORT},http://127.0.0.1:${CLIENT_PORT}`,
      },
    },
    {
      command: `npx vite --port ${CLIENT_PORT} --strictPort --host 127.0.0.1`,
      cwd: '.',
      port: CLIENT_PORT,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { VITE_DEV_SERVER_PROXY: `http://127.0.0.1:${SERVER_PORT}` },
    },
  ],
});
