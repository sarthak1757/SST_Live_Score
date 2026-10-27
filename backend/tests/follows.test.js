const { houseNames, validateFollows, matchesForHouses } = require('../src/services/follows');

const tournaments = [
  { teams: [{ name: 'Red' }, { name: 'Blue' }] },
  { teams: [{ name: 'red' }, { name: 'Green' }] },
];

describe('follow houses', () => {
  test('house names are unique across tournaments, case-insensitive, sorted', () => {
    expect(houseNames(tournaments)).toEqual(['Blue', 'Green', 'Red']);
  });

  test('follows are validated against existing houses and de-duplicated', () => {
    const existing = houseNames(tournaments);
    expect(validateFollows([' red ', 'RED', 'Blue'], existing)).toEqual(['Red', 'Blue']);
    expect(() => validateFollows(['Purple'], existing)).toThrow(/Unknown house/);
    expect(() => validateFollows('Red', existing)).toThrow(/list/);
  });

  test('feed keeps only matches involving a followed house', () => {
    const matches = [
      { id: 1, teamA: { name: 'Red' }, teamB: { name: 'Blue' } },
      { id: 2, teamA: { name: 'Green' }, teamB: { name: 'Yellow' } },
      { id: 3, teamA: { name: 'Yellow' }, teamB: { name: 'RED' } },
    ];
    expect(matchesForHouses(matches, ['Red']).map((m) => m.id)).toEqual([1, 3]);
    expect(matchesForHouses(matches, [])).toEqual([]);
  });
});
