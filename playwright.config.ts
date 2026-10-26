import { defineConfig, devices } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { tmpdir } from 'node:os';
process.env.E2E_PASSWORD ??= randomBytes(24).toString('hex');
process.env.E2E_DIR ??= path.join(tmpdir(), 'wu-fitness-e2e-' + process.pid);
export default defineConfig({
  testDir: 'tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3107',
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command: 'npm run test:serve -w backend',
    url: 'http://127.0.0.1:3107/api/health',
    timeout: 60000,
    reuseExistingServer: false,
  },
});
