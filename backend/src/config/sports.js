// One config object drives every sport: the buttons the scorer sees,
// the points each button gives, and whether the sport is played in sets.
// To add a sport, add an entry here - no other code changes needed.
const SPORTS = {
  football: {
    label: 'Football',
    actions: {
      goal: { label: 'Goal', points: 1 },
    },
  },
  basketball: {
    label: 'Basketball',
    actions: {
      point1: { label: '+1 (Free throw)', points: 1 },
      point2: { label: '+2', points: 2 },
      point3: { label: '+3', points: 3 },
    },
  },
  volleyball: {
    label: 'Volleyball',
    sets: { bestOf: 3 },
    actions: {
      point: { label: 'Point', points: 1 },
    },
  },
  badminton: {
    label: 'Badminton',
    sets: { bestOf: 3 },
    actions: {
      point: { label: 'Point', points: 1 },
    },
  },
  kabaddi: {
    label: 'Kabaddi',
    actions: {
      raid: { label: 'Raid point', points: 1 },
      tackle: { label: 'Tackle point', points: 1 },
      bonus: { label: 'Bonus', points: 1 },
      allout: { label: 'All-out', points: 2 },
    },
  },
  cricket: {
    label: 'Cricket',
    // limited-overs: Team A bats first. Overs can be set per tournament (default below).
    cricket: { overs: 10, wickets: 10 },
    actions: {
      dot: { label: 'Dot ball', points: 0, ball: true },
      run1: { label: '1 run', points: 1, ball: true },
      run2: { label: '2 runs', points: 2, ball: true },
      run3: { label: '3 runs', points: 3, ball: true },
      four: { label: 'Four', points: 4, ball: true },
      six: { label: 'Six', points: 6, ball: true },
      wide: { label: 'Wide', points: 1, extra: true }, // extras: 1 run, ball is bowled again
      noball: { label: 'No-ball', points: 1, extra: true },
      wicket: { label: 'Wicket', points: 0, ball: true, wicket: true },
    },
  },
};

// Special event type used by set-based sports. It scores no points.
const END_SET = 'end_set';
// Cricket: end the current innings early (innings also end automatically - see scoring.js).
const END_INNINGS = 'end_innings';

module.exports = { SPORTS, END_SET, END_INNINGS };
