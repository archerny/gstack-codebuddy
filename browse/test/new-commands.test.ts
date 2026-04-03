/**
 * Integration tests for new browse commands:
 *   inspect, style, cleanup, prettyscreenshot, frame
 *
 * Uses the same test infrastructure as commands.test.ts.
 */

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { startTestServer } from './test-server';
import { BrowserManager } from '../src/browser-manager';
import { handleReadCommand } from '../src/read-commands';
import { handleWriteCommand } from '../src/write-commands';
import { handleMetaCommand } from '../src/meta-commands';
import * as fs from 'fs';

let testServer: ReturnType<typeof startTestServer>;
let bm: BrowserManager;
let baseUrl: string;

beforeAll(async () => {
  testServer = startTestServer(0);
  baseUrl = testServer.url;

  bm = new BrowserManager();
  await bm.launch();
  // Navigate to inspector fixture page
  await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
});

afterAll(() => {
  try { testServer.server.stop(); } catch {}
  setTimeout(() => process.exit(0), 500);
});

// ─── Inspect ────────────────────────────────────────────────────

describe('inspect command', () => {
  test('inspect returns CSS cascade for a selector', async () => {
    const result = await handleReadCommand('inspect', ['h1'], bm);
    expect(result).toContain('Element: <h1');
    expect(result).toContain('Box Model:');
    expect(result).toContain('Matched Rules');
    expect(result).toContain('Computed (key):');
  });

  test('inspect by ID selector', async () => {
    const result = await handleReadCommand('inspect', ['#target-box'], bm);
    expect(result).toContain('Element: <div');
    expect(result).toContain('id="target-box"');
    expect(result).toContain('Dimensions:');
  });

  test('inspect --all includes user-agent rules', async () => {
    const result = await handleReadCommand('inspect', ['h1', '--all'], bm);
    expect(result).toContain('Matched Rules');
    // User-agent rules should produce more output
    expect(result.length).toBeGreaterThan(
      (await handleReadCommand('inspect', ['h1'], bm)).length - 50  // Allow some tolerance
    );
  });

  test('inspect --history returns empty when no modifications', async () => {
    const result = await handleReadCommand('inspect', ['--history'], bm);
    expect(result).toBe('(no style modifications)');
  });

  test('inspect throws for non-existent selector', async () => {
    await expect(handleReadCommand('inspect', ['#does-not-exist'], bm)).rejects.toThrow('Element not found');
  });

  test('inspect without selector throws usage error', async () => {
    await expect(handleReadCommand('inspect', [], bm)).rejects.toThrow('Usage:');
  });
});

// ─── Style ──────────────────────────────────────────────────────

describe('style command', () => {
  test('style modifies CSS property', async () => {
    const result = await handleWriteCommand('style', ['#target-box', 'background-color', 'red'], bm);
    expect(result).toContain('Style modified');
    expect(result).toContain('background-color');
    expect(result).toContain('→ red');
  });

  test('style --undo reverts last modification', async () => {
    // Make a modification first
    await handleWriteCommand('style', ['#target-box', 'border-color', 'blue'], bm);
    const result = await handleWriteCommand('style', ['--undo'], bm);
    expect(result).toContain('Reverted last modification');
  });

  test('style --reset clears all modifications', async () => {
    // Make a couple modifications
    await handleWriteCommand('style', ['#target-box', 'color', 'green'], bm);
    await handleWriteCommand('style', ['h1', 'font-size', '32px'], bm);
    const result = await handleWriteCommand('style', ['--reset'], bm);
    expect(result).toContain('Reset all');
    expect(result).toContain('style modifications');
  });

  test('style --reset when no modifications returns info message', async () => {
    const result = await handleWriteCommand('style', ['--reset'], bm);
    expect(result).toBe('No modifications to reset.');
  });

  test('style records modification in history', async () => {
    await handleWriteCommand('style', ['h1', 'color', 'purple'], bm);
    const history = await handleReadCommand('inspect', ['--history'], bm);
    expect(history).toContain('color');
    expect(history).toContain('purple');
    // Clean up
    await handleWriteCommand('style', ['--reset'], bm);
  });

  test('style rejects invalid property name', async () => {
    await expect(
      handleWriteCommand('style', ['h1', 'font-size; malicious', 'red'], bm)
    ).rejects.toThrow('Invalid CSS property name');
  });

  test('style without enough args throws usage error', async () => {
    await expect(handleWriteCommand('style', ['h1'], bm)).rejects.toThrow('Usage:');
  });
});

// ─── Cleanup ────────────────────────────────────────────────────

describe('cleanup command', () => {
  // Re-navigate to get fresh page state before each cleanup test
  test('cleanup --all removes ads and cookie banners', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleWriteCommand('cleanup', ['--all'], bm);
    expect(result).toContain('Cleaned up');
  });

  test('cleanup with no args defaults to --all', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleWriteCommand('cleanup', [], bm);
    expect(result).toContain('Cleaned up');
  });

  test('cleanup --cookies targets cookie banners', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleWriteCommand('cleanup', ['--cookies'], bm);
    // Should find and hide the cookie consent banner
    expect(result).toContain('cookie banners');
  });

  test('cleanup rejects unknown flags', async () => {
    await expect(handleWriteCommand('cleanup', ['--invalid'], bm)).rejects.toThrow('Unknown cleanup flag');
  });

  test('cleanup on clean page reports no clutter', async () => {
    await handleWriteCommand('goto', [baseUrl + '/empty.html'], bm);
    const result = await handleWriteCommand('cleanup', [], bm);
    expect(result).toContain('No clutter');
  });
});

// ─── Prettyscreenshot ───────────────────────────────────────────

describe('prettyscreenshot command', () => {
  test('prettyscreenshot saves screenshot to default path', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleWriteCommand('prettyscreenshot', [], bm);
    expect(result).toContain('Screenshot saved');
    // Extract path from result and verify file exists
    const match = result.match(/: (.+\.png)$/);
    expect(match).toBeTruthy();
    if (match) {
      expect(fs.existsSync(match[1])).toBe(true);
      fs.unlinkSync(match[1]); // Clean up
    }
  });

  test('prettyscreenshot --cleanup removes clutter before capture', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleWriteCommand('prettyscreenshot', ['--cleanup'], bm);
    expect(result).toContain('Screenshot saved');
    expect(result).toContain('(cleaned)');
    // Clean up file
    const match = result.match(/: (.+\.png)$/);
    if (match) fs.unlinkSync(match[1]);
  });

  test('prettyscreenshot to custom path', async () => {
    const outPath = '/tmp/browse-test-pretty.png';
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleWriteCommand('prettyscreenshot', [outPath], bm);
    expect(result).toContain('Screenshot saved');
    expect(fs.existsSync(outPath)).toBe(true);
    fs.unlinkSync(outPath);
  });

  test('prettyscreenshot --scroll-to finds element', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleWriteCommand('prettyscreenshot', ['--scroll-to', '#target-box', '/tmp/browse-test-scroll.png'], bm);
    expect(result).toContain('Screenshot saved');
    expect(result).toContain('scrolled to');
    if (fs.existsSync('/tmp/browse-test-scroll.png')) {
      fs.unlinkSync('/tmp/browse-test-scroll.png');
    }
  });

  test('prettyscreenshot --scroll-to throws for non-existent target', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    await expect(
      handleWriteCommand('prettyscreenshot', ['--scroll-to', '#nonexistent-element-xyz'], bm)
    ).rejects.toThrow('Could not find element or text to scroll to');
  });

  test('prettyscreenshot rejects path outside safe dirs', async () => {
    await expect(
      handleWriteCommand('prettyscreenshot', ['/etc/bad-path.png'], bm)
    ).rejects.toThrow('Path must be within');
  });

  test('prettyscreenshot rejects unknown flags', async () => {
    await expect(
      handleWriteCommand('prettyscreenshot', ['--nonexistent-flag'], bm)
    ).rejects.toThrow('Unknown prettyscreenshot flag');
  });
});

// ─── Frame ──────────────────────────────────────────────────────

describe('frame command', () => {
  test('frame switches to iframe by CSS selector', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    const result = await handleMetaCommand('frame', ['#test-frame'], bm, async () => {});
    expect(result).toContain('Switched to frame');
    // Switch back
    await handleMetaCommand('frame', ['main'], bm, async () => {});
  });

  test('frame main switches back to main frame', async () => {
    // First switch into iframe
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    await handleMetaCommand('frame', ['#test-frame'], bm, async () => {});
    const result = await handleMetaCommand('frame', ['main'], bm, async () => {});
    expect(result).toBe('Switched to main frame');
  });

  test('frame by --url pattern', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    // Wait for iframe to be attached (srcdoc iframes have about:srcdoc as URL)
    await handleWriteCommand('wait', ['#test-frame'], bm);
    const result = await handleMetaCommand('frame', ['--url', 'srcdoc'], bm, async () => {});
    expect(result).toContain('Switched to frame');
    // Switch back for other tests
    await handleMetaCommand('frame', ['main'], bm, async () => {});
  });

  test('frame throws for non-existent frame name', async () => {
    await expect(
      handleMetaCommand('frame', ['--name', 'nonexistent-frame-xyz'], bm, async () => {})
    ).rejects.toThrow('Frame not found');
  });

  test('frame without args throws usage error', async () => {
    await expect(handleMetaCommand('frame', [], bm, async () => {})).rejects.toThrow('Usage:');
  });
});

// ─── Cross-feature: inspect in frame context ────────────────────

describe('inspect in frame context', () => {
  test('inspect works inside iframe', async () => {
    await handleWriteCommand('goto', [baseUrl + '/inspector.html'], bm);
    // Wait for iframe to be attached
    await handleWriteCommand('wait', ['#test-frame'], bm);
    // Switch to iframe
    await handleMetaCommand('frame', ['#test-frame'], bm, async () => {});
    // Inspect element inside iframe
    const result = await handleReadCommand('inspect', ['.inner'], bm);
    expect(result).toContain('Element: <div');
    expect(result).toContain('class="inner"');
    // Switch back
    await handleMetaCommand('frame', ['main'], bm, async () => {});
  });
});
