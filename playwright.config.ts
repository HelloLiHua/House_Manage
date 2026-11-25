import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', fullyParallel: false, workers: 1,
  timeout: 30000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1440, height: 1000 }, headless: true, channel: process.env.CI || process.platform !== 'win32' ? undefined : 'msedge', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
})
