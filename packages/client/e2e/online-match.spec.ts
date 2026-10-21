import { expect, test } from '@playwright/test';
import { confirmFleet, newPlayer, playUntilFinished, readRoomCode } from './helpers';

test.describe('online multiplayer', () => {
  test('two independent sessions play a complete private-room match and rematch', async ({ browser }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser);

    // Host creates a room and lands in the lobby.
    await host.page.getByTestId('menu-create-room').click();
    await expect(host.page.getByTestId('room-code')).toBeVisible({ timeout: 20_000 });
    const code = await readRoomCode(host.page);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);

    // Guest joins via the invite deep link.
    await guest.page.goto(`/join/${code}`);
    await expect(guest.page.getByTestId('room-code')).toBeVisible({ timeout: 20_000 });
    await expect(host.page.getByTestId('lobby-player-opponent')).toBeVisible({ timeout: 20_000 });

    // Both ready up -> countdown -> placement.
    await host.page.getByTestId('ready-toggle').click();
    await guest.page.getByTestId('ready-toggle').click();
    await confirmFleet(host.page);
    await confirmFleet(guest.page);

    // Battle: the UI must show a turn indicator for both players.
    await expect(host.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 30_000 });
    await expect(guest.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 30_000 });
    const turns = await Promise.all([
      host.page.getByTestId('turn-indicator').getAttribute('data-turn'),
      guest.page.getByTestId('turn-indicator').getAttribute('data-turn'),
    ]);
    expect(turns.sort()).toEqual(['me', 'opponent']);

    // The hidden enemy fleet must never be present in the page's state/DOM before it is sunk.
    const leaked = await host.page.evaluate(() => document.querySelectorAll('[data-testid="enemy-board"] [data-ship]').length);
    expect(leaked).toBe(0);

    await playUntilFinished(host.page, guest.page);

    const results = await Promise.all([
      host.page.getByTestId('result-banner').getAttribute('data-result'),
      guest.page.getByTestId('result-banner').getAttribute('data-result'),
    ]);
    expect(results.sort()).toEqual(['defeat', 'victory']);
    const winner = results[0] === 'victory' ? host.page : guest.page;
    await expect(winner.getByTestId('stat-hits')).toContainText('17');
    await expect(winner.getByTestId('stat-ships-sunk')).toContainText('5');

    // Rematch: both accept -> a fresh placement phase in the same room.
    await host.page.getByTestId('rematch-button').click();
    await guest.page.getByTestId('rematch-button').click();
    await expect(host.page.getByTestId('confirm-fleet')).toBeVisible({ timeout: 20_000 });
    await expect(guest.page.getByTestId('confirm-fleet')).toBeVisible({ timeout: 20_000 });

    await host.context.close();
    await guest.context.close();
  });

  test('quick match pairs two searching players', async ({ browser }) => {
    const a = await newPlayer(browser);
    const b = await newPlayer(browser);
    await a.page.getByTestId('menu-quick-match').click();
    await expect(a.page.getByTestId('queue-cancel')).toBeVisible({ timeout: 15_000 });
    await b.page.getByTestId('menu-quick-match').click();
    await expect(a.page.getByTestId('confirm-fleet')).toBeVisible({ timeout: 20_000 });
    await expect(b.page.getByTestId('confirm-fleet')).toBeVisible({ timeout: 20_000 });
    await a.context.close();
    await b.context.close();
  });

  test('a player survives a page reload mid-battle (reconnection)', async ({ browser }) => {
    const host = await newPlayer(browser);
    const guest = await newPlayer(browser);
    await host.page.getByTestId('menu-create-room').click();
    const code = await readRoomCode(host.page);
    await guest.page.goto(`/join/${code}`);
    await expect(host.page.getByTestId('lobby-player-opponent')).toBeVisible({ timeout: 20_000 });
    await host.page.getByTestId('ready-toggle').click();
    await guest.page.getByTestId('ready-toggle').click();
    await confirmFleet(host.page);
    await confirmFleet(guest.page);
    await expect(host.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 30_000 });

    await host.page.reload();
    await expect(host.page.getByTestId('turn-indicator')).toBeVisible({ timeout: 30_000 });
    await expect(guest.page.getByTestId('turn-indicator')).toBeVisible();
    await host.context.close();
    await guest.context.close();
  });

  test('unknown invite codes are rejected', async ({ browser }) => {
    const p = await newPlayer(browser, '/join/ZZZZZZ');
    await expect(p.page.getByText(/couldn.t join room/i)).toBeVisible({ timeout: 20_000 });
    await p.context.close();
  });
});
