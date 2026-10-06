import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../db/index.js';
import { deleteSkill, listSkills, seedSkillOnce } from './studio.js';

describe('seedSkillOnce', () => {
  beforeEach(() => {
    closeDb();
    getDb(':memory:');
  });

  afterEach(() => closeDb());

  it('creates the skill on first call and skips it afterwards', () => {
    const first = seedSkillOnce('demo', { name: 'Demo', prompt: 'Hi {{input}}' });
    expect(first?.name).toBe('Demo');
    expect(seedSkillOnce('demo', { name: 'Demo', prompt: 'Hi {{input}}' })).toBeNull();
    expect(listSkills()).toHaveLength(1);
  });

  it('does not re-create a seeded skill the user deleted', () => {
    const skill = seedSkillOnce('demo', { name: 'Demo', prompt: 'Hi' });
    deleteSkill(skill!.id);
    expect(seedSkillOnce('demo', { name: 'Demo', prompt: 'Hi' })).toBeNull();
    expect(listSkills()).toHaveLength(0);
  });
});
