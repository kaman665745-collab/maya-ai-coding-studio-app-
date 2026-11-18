// Standard Playwright E2E test spec (run with npx playwright test against running server)
// Uses dynamic check-friendly structure compatible with @playwright/test in CI/CD.
import { test, expect } from '@playwright/test';

test.describe('Advanced Coding Studio E2E', () => {
  test('loads IDE workspace, switches tabs, runs tests, and renders live preview', async ({ page }) => {
    await page.goto('/?demo=1');
    await expect(page.getByText('Advanced Coding Studio')).toBeVisible();

    // Verify file explorer loaded starter files
    await expect(page.getByRole('button', { name: /App\.tsx/i })).toBeVisible();

    // Run project unit tests in bottom panel
    await page.getByRole('button', { name: /Run Tests/i }).click();
    await expect(page.getByText(/passed/i)).toBeVisible({ timeout: 15_000 });

    // Switch to Live Preview mode and start sandbox preview
    await page.getByRole('button', { name: 'Preview' }).click();
    await page.getByRole('button', { name: /Start Preview|Rebuild/i }).click();
    await expect(page.locator('iframe[title="ACS Sandbox Live Preview"]')).toBeVisible({ timeout: 15_000 });
  });
});
