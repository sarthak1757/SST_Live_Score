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

describe('team record', () => {
  const { teamRecord, sideOfHouse } = require('../src/services/browse');
  let d = 0;
  const m = (a, b, winner, status) => ({ status: status || 'finished', teamA: { name: a }, teamB: { name: b }, winner, finishedAt: new Date(2026, 0, ++d) });

  test('W/D/L, win rate and form across tournaments, matched case-insensitively', () => {
    const matches = [m('Phoenix', 'Leo', 'a'), m('kong', 'PHOENIX', 'a'), m('Phoenix', 'Tusker', 'draw'), m('Leo', 'Kong', 'a'), m('Phoenix', 'Leo', null, 'live')];
    const r = teamRecord(matches, 'phoenix');
    expect(r).toMatchObject({ played: 3, won: 1, drawn: 1, lost: 1, winRate: 33 });
    expect(r.form).toEqual(['W', 'L', 'D']);
    expect(sideOfHouse(matches[1], 'Phoenix')).toBe('b');
  });

  test('a house with no finished matches has an empty record', () => {
    expect(teamRecord([m('Leo', 'Kong', null, 'scheduled')], 'Leo')).toEqual({ played: 0, won: 0, drawn: 0, lost: 0, winRate: 0, form: [] });
  });
});
