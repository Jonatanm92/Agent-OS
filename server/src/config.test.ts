import os from 'os';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { expandHome } from './config.js';

describe('expandHome', () => {
  it('keeps empty and non-home paths unchanged', () => {
    expect(expandHome('')).toBe('');
    expect(expandHome('/tmp/agent-os')).toBe('/tmp/agent-os');
    expect(expandHome('relative/project')).toBe('relative/project');
  });

  it('expands a bare tilde to the current home directory', () => {
    expect(expandHome('~')).toBe(os.homedir());
  });

  it('expands slash-prefixed home paths', () => {
    expect(expandHome('~/freeclaude-vault')).toBe(
      path.join(os.homedir(), 'freeclaude-vault')
    );
  });

  it('expands backslash-prefixed home paths for cross-platform config input', () => {
    expect(expandHome('~\\freeclaude-scratch')).toBe(
      path.join(os.homedir(), 'freeclaude-scratch')
    );
  });
});
