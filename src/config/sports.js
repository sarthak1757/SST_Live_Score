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
};

// Special event type used by set-based sports. It scores no points.
const END_SET = 'end_set';

module.exports = { SPORTS, END_SET };
