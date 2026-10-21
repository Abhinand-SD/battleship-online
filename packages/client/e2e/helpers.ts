import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Player {
  context: BrowserContext;
  page: Page;
}

/** Opens a fresh, independent browser session (own storage => own guest identity). */
export async function newPlayer(browser: Browser, path = '/play'): Promise<Player> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(path);
  await waitForConnected(page);
  return { context, page };
}

export async function waitForConnected(page: Page): Promise<void> {
  await expect(page.getByTestId('connection-status').first()).toHaveAttribute('data-status', 'connected', { timeout: 30_000 });
}

export async function readRoomCode(page: Page): Promise<string> {
  const text = (await page.getByTestId('room-code').first().innerText()).trim();
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Clicks through placement using the default (random, valid) fleet. */
export async function confirmFleet(page: Page): Promise<void> {
  const confirm = page.getByTestId('confirm-fleet');
  await expect(confirm).toBeVisible({ timeout: 30_000 });
  await expect(confirm).toBeEnabled();
  await confirm.click();
}

export async function turnOf(page: Page): Promise<'me' | 'opponent' | null> {
  const el = page.getByTestId('turn-indicator').first();
  if ((await el.count()) === 0) return null;
  const v = await el.getAttribute('data-turn');
  return v === 'me' || v === 'opponent' ? v : null;
}

export async function hasResult(page: Page): Promise<boolean> {
  return (await page.getByTestId('result-banner').count()) > 0;
}

/** Fires at the first untried enemy cell (row-major sweep). Returns false when nothing was fired. */
export async function fireNext(page: Page): Promise<boolean> {
  const board = page.getByTestId('enemy-board');
  const cell = board.locator('[data-state="empty"]').first();
  if ((await cell.count()) === 0) return false;
  await cell.click({ force: true });
  return true;
}

/**
 * Plays a full match between two pages by sweeping the board, until both pages show a result.
 * The test never learns the hidden fleets: it only sees what the UI shows.
 */
export async function playUntilFinished(a: Page, b: Page, maxTurns = 220): Promise<void> {
  for (let i = 0; i < maxTurns; i++) {
    if ((await hasResult(a)) && (await hasResult(b))) return;
    const ta = await turnOf(a);
    const tb = await turnOf(b);
    if (ta === 'me') {
      await fireNext(a);
      await expect
        .poll(async () => (await turnOf(a)) !== 'me' || (await hasResult(a)), { timeout: 10_000 })
        .toBeTruthy();
    } else if (tb === 'me') {
      await fireNext(b);
      await expect
        .poll(async () => (await turnOf(b)) !== 'me' || (await hasResult(b)), { timeout: 10_000 })
        .toBeTruthy();
    } else {
      await a.waitForTimeout(150);
    }
  }
  throw new Error('Match did not finish within the turn budget');
}
