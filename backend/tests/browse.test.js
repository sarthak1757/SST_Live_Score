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

describe('player stats', () => {
  const { playerStats, samePlayer } = require('../src/services/browse');

  test('points, matches, cards and a per-action breakdown', () => {
    const events = [
      { match: 'm1', type: 'raid', points: 1 }, { match: 'm1', type: 'allout', points: 2 },
      { match: 'm2', type: 'raid', points: 1 }, { match: 'm2', type: 'raid', points: 1 },
    ];
    const s = playerStats(events, 'kabaddi');
    expect(s).toMatchObject({ matches: 2, points: 5, actions: 4, yellow: 0, red: 0 });
    expect(s.breakdown).toEqual([{ label: 'Raid point', count: 3, points: 3 }, { label: 'All-out', count: 1, points: 2 }]);
    const f = playerStats([{ match: 'x', type: 'goal', points: 1 }, { match: 'x', type: 'yellow', points: 0 }, { match: 'y', type: 'red', points: 0 }], 'football');
    expect(f).toMatchObject({ matches: 2, points: 1, actions: 1, yellow: 1, red: 1 });
  });

  test('the same name in the same house across tournaments is one player', () => {
    const list = [
      { id: '1', name: 'Aman Rao', team: 'Phoenix' }, { id: '2', name: 'aman rao', team: 'PHOENIX' },
      { id: '3', name: 'Aman Rao', team: 'Leo' }, { id: '4', name: 'Ravi', team: 'Phoenix' },
    ];
    expect(samePlayer(list, list[0]).map((p) => p.id)).toEqual(['1', '2']);
  });
});
