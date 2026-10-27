const { httpError } = require('../middleware/errors');

// Top 4 of the standings -> SF1: 1st vs 4th, SF2: 2nd vs 3rd.
function seedSemifinals(standings) {
  if (standings.length < 4) throw httpError(400, 'At least 4 teams are needed for a knockout bracket');
  return [
    { stage: 'sf1', a: standings[0], b: standings[3] },
    { stage: 'sf2', a: standings[1], b: standings[2] },
  ];
}

// The winning side ({ id, name }) of a finished knockout match.
function winnerOf(match) {
  if (match.status !== 'finished') throw httpError(409, 'Both semifinals must be finished first');
  if (match.winner === 'a') return match.teamA;
  if (match.winner === 'b') return match.teamB;
  throw httpError(409, 'A semifinal ended in a draw');
}

// Final = winner of SF1 vs winner of SF2.
function finalists(sf1, sf2) {
  if (!sf1 || !sf2) throw httpError(409, 'Generate the semifinals first');
  return { a: winnerOf(sf1), b: winnerOf(sf2) };
}

module.exports = { seedSemifinals, winnerOf, finalists };
