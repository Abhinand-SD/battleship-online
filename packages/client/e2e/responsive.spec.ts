import { devices, expect, test } from '@playwright/test';
import { confirmFleet, waitForConnected } from './helpers';

test.use({ ...devices['Pixel 7'], channel: process.env['PW_CHANNEL'] ?? 'chrome' });

test('mobile: no horizontal overflow on landing, menu and placement', async ({ page }) => {
  const noOverflow = async () => {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  };
  await page.goto('/');
  await waitForConnected(page);
  await expect(page.getByTestId('cta-play-online')).toBeVisible();
  await noOverflow();

  await page.goto('/play');
  await waitForConnected(page);
  await noOverflow();

  await page.getByTestId('menu-practice').click();
  await page.getByTestId('practice-difficulty-easy').click();
  await page.getByTestId('practice-start').click();
  await expect(page.getByTestId('confirm-fleet')).toBeVisible({ timeout: 20_000 });
  await noOverflow();
  // The board must be large enough to tap: at least 280px wide on a phone.
  const box = await page.getByTestId('placement-board').boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(280);
  await confirmFleet(page);
  await expect(page.getByTestId('turn-indicator')).toBeVisible({ timeout: 30_000 });
  await noOverflow();
});
