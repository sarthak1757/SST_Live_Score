const { houseSummaries, playerList, search, validateQuery } = require('../src/services/browse');

const tournaments = [
  { _id: 't1', name: 'Football Cup', sport: 'football', teams: [
    { _id: 'a', name: 'Phoenix', players: [{ _id: 'p1', name: 'Aman Rao', jersey: 7 }] },
    { _id: 'b', name: 'Leo', players: [] },
  ] },
  { _id: 't2', name: 'Kabaddi League', sport: 'kabaddi', teams: [
    { _id: 'c', name: 'phoenix', players: [{ _id: 'p2', name: 'Ravi', jersey: 9 }] },
    { _id: 'd', name: 'Kong', players: [] },
  ] },
];

describe('browse and search', () => {
  test('houses are merged across tournaments (case-insensitive) with sports and player counts', () => {
    const houses = houseSummaries(tournaments);
    expect(houses.map((h) => h.name)).toEqual(['Kong', 'Leo', 'Phoenix']);
    expect(houses[2]).toEqual({ name: 'Phoenix', tournaments: 2, sports: ['Football', 'Kabaddi'], players: 2 });
    expect(playerList(tournaments).map((p) => p.name)).toEqual(['Aman Rao', 'Ravi']);
  });

  test('search finds tournaments, houses and players; validates the query', () => {
    const r = search(tournaments, 'PHOE');
    expect(r.teams.map((t) => t.name)).toEqual(['Phoenix']);
    expect(r.players.map((p) => p.name)).toEqual([]); // "phoe" is not a full house name
    expect(search(tournaments, 'phoenix').players.map((p) => p.name)).toEqual(['Aman Rao', 'Ravi']);
    expect(search(tournaments, 'kabaddi').tournaments.map((t) => t.name)).toEqual(['Kabaddi League']);
    expect(search(tournaments, '#7').players[0].name).toBe('Aman Rao');
    expect(() => validateQuery('a')).toThrow(/2 characters/);
    expect(() => validateQuery('x'.repeat(51))).toThrow(/50/);
    expect(validateQuery('  leo ')).toBe('leo');
  });
});
