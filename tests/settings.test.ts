import { beforeEach, describe, expect, it } from 'vitest';
import {
  commitSettings,
  historyState,
  loadSettings,
  redo,
  resetSettings,
  settings,
  undo,
  type Settings,
} from '../src/store/settings.svelte';

function snap(): Settings {
  return JSON.parse(JSON.stringify(settings)) as Settings;
}

beforeEach(() => {
  resetSettings();
});

describe('settings history', () => {
  it('undoes a committed edit', () => {
    settings.spacing = 10;
    commitSettings(snap());
    expect(historyState.canUndo).toBe(true);
    undo();
    expect(settings.spacing).toBe(0);
    expect(historyState.canRedo).toBe(true);
    redo();
    expect(settings.spacing).toBe(10);
  });

  it('keeps an edit that has not been committed yet when undoing', () => {
    settings.spacing = 10;
    commitSettings(snap());
    settings.spacing = 25;
    undo();
    expect(settings.spacing).toBe(10);
    redo();
    expect(settings.spacing).toBe(25);
  });

  it('undoing with nothing pending steps back exactly one state', () => {
    settings.spacing = 10;
    commitSettings(snap());
    settings.spacing = 25;
    commitSettings(snap());
    undo();
    expect(settings.spacing).toBe(10);
    undo();
    expect(settings.spacing).toBe(0);
  });

  it('does nothing when there is nothing to undo or redo', () => {
    undo();
    redo();
    expect(settings.spacing).toBe(0);
    expect(historyState.canUndo).toBe(false);
    expect(historyState.canRedo).toBe(false);
  });

  it('commits a pending edit before redo so the redo stack is not resurrected over it', () => {
    settings.spacing = 10;
    commitSettings(snap());
    undo();
    settings.spacing = 40;
    redo();
    expect(settings.spacing).toBe(40);
    expect(historyState.canRedo).toBe(false);
  });

  it('restores per-glyph adjustments', () => {
    loadSettings({ glyphs: { 97: { dy: 5, scale: 1.2, lsb: null, rsb: null, missing: false, source: null, alts: null } } });
    commitSettings(snap());
    loadSettings({});
    commitSettings(snap());
    undo();
    expect(settings.glyphs[97]?.dy).toBe(5);
  });
});
