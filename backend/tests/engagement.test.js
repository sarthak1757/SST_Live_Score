const { createLimiter } = require('../src/services/rateLimit');
const { validateComment, validateReaction, validateClientId, displayName } = require('../src/services/engagement');

describe('rate limiter', () => {
  test('allows max hits per window, then blocks, then allows again after the window', () => {
    const hit = createLimiter(2, 1000);
    expect(hit('browser1', 0)).toBe(true);
    expect(hit('browser1', 100)).toBe(true);
    expect(hit('browser1', 200)).toBe(false);
    expect(hit('browser1', 1150)).toBe(true); // first hit has expired
  });

  test('keys are limited independently', () => {
    const hit = createLimiter(1, 1000);
    expect(hit('a', 0)).toBe(true);
    expect(hit('a', 10)).toBe(false);
    expect(hit('b', 10)).toBe(true);
  });
});

describe('engagement validation', () => {
  test('comments are trimmed and limited to 200 characters', () => {
    expect(validateComment('  Great raid!  ')).toBe('Great raid!');
    expect(() => validateComment('   ')).toThrow(/empty/);
    expect(() => validateComment('x'.repeat(201))).toThrow(/200/);
    expect(() => validateComment(42)).toThrow(/empty/);
  });

  test('only known reactions and well-formed client ids are accepted; names hide the email', () => {
    expect(validateReaction('fire')).toBe('fire');
    expect(() => validateReaction('angry')).toThrow(/Unknown/);
    expect(validateClientId('abc12345-xyz')).toBe('abc12345-xyz');
    expect(() => validateClientId('<script>')).toThrow();
    expect(displayName('riya.k@sst.edu')).toBe('riya.k');
  });
});
