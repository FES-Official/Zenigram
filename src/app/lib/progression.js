export const EXPLORATION_ACHIEVEMENTS = [
  {
    id: "explorer",
    title: "Explorer",
    description: "View 50 stories around the world.",
    requiredViews: 50,
  },
  {
    id: "world-explorer",
    title: "World Explorer",
    description: "View 100 stories around the world.",
    requiredViews: 100,
  },
  {
    id: "world-traveler",
    title: "World Traveler",
    description: "View 500 stories around the world.",
    requiredViews: 500,
  },
  {
    id: "globe-master",
    title: "Globe Master",
    description: "View 1,000 stories around the world.",
    requiredViews: 1000,
  },
  {
    id: "planet-pioneer",
    title: "Planet Pioneer",
    description: "View 2,500 stories around the world.",
    requiredViews: 2500,
  },
];

export const LAST_HOURS_GOAL = 100;

export function achievementIdsForViews(viewCount) {
  return EXPLORATION_ACHIEVEMENTS.filter(
    (achievement) => viewCount >= achievement.requiredViews,
  ).map((achievement) => achievement.id);
}

export function toDayKey(value = new Date(), timeZone = "UTC") {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(value));
    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value]),
    );

    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return new Date(value).toISOString().slice(0, 10);
  }
}

export function isPreviousDay(previousKey, currentKey) {
  if (!previousKey || !currentKey) return false;

  const previous = new Date(`${previousKey}T00:00:00.000Z`);
  const current = new Date(`${currentKey}T00:00:00.000Z`);

  return current.getTime() - previous.getTime() === 24 * 60 * 60 * 1000;
}
