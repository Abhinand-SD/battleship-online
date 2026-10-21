import { expect, test } from '@playwright/test';
import { confirmFleet, fireNext, newPlayer, turnOf } from './helpers';

test('practice mode: the AI opponent fires back and the player can forfeit', async ({ browser }) => {
  const p = await newPlayer(browser);
  await p.page.getByTestId('menu-practice').click();
  await p.page.getByTestId('practice-difficulty-hard').click();
  await p.page.getByTestId('practice-start').click();
  await confirmFleet(p.page);
  await expect(p.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 30_000 });

  // Play a few turns; the AI must respond on its own.
  for (let i = 0; i < 6; i++) {
    await expect.poll(() => turnOf(p.page), { timeout: 15_000 }).toBe('me');
    await fireNext(p.page);
  }
  const incoming = p.page.getByTestId('my-board').locator('[data-state="hit"], [data-state="miss"], [data-state="sunk"]');
  await expect.poll(async () => incoming.count(), { timeout: 15_000 }).toBeGreaterThan(0);

  await p.page.getByTestId('forfeit-button').click();
  await p.page.getByRole('button', { name: /^(forfeit|surrender|confirm)/i }).last().click();
  await expect(p.page.getByTestId('result-banner')).toHaveAttribute('data-result', 'defeat', { timeout: 15_000 });
  await p.context.close();
});
