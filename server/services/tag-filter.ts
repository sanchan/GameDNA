// Steam categories/features that are not meaningful game content descriptors.
// These are ignored by default when building taste profiles and recommendations.
export const DEFAULT_IGNORED_TAGS: string[] = [
  // Steam platform features
  'Steam Achievements',
  'Steam Trading Cards',
  'Steam Cloud',
  'Steam Workshop',
  'Steam Leaderboards',
  'Stats',
  'Valve Anti-Cheat enabled',
  'Includes Source SDK',
  'Commentary available',
  'Includes level editor',

  // Controller/Input support
  'Full controller support',
  'Partial Controller Support',
  'Tracked Controller Support',
  'Mouse Only Option',
  'Keyboard Only Option',

  // Multiplayer modes (structural, not content)
  'Single-player',
  'Multi-player',
  'Co-op',
  'Online Co-op',
  'Online PvP',
  'PvP',
  'LAN Co-op',
  'LAN PvP',
  'Shared/Split Screen',
  'Shared/Split Screen Co-op',
  'Shared/Split Screen PvP',
  'Cross-Platform Multiplayer',
  'Family Sharing',
  'MMO',
  'Massively Multiplayer',

  // Remote Play / Streaming
  'Remote Play on Tablet',
  'Remote Play on Phone',
  'Remote Play on TV',
  'Remote Play Together',
  'Remote Play on Steam Deck',

  // VR
  'VR Supported',
  'VR Support',
  'VR Only',

  // Accessibility features
  'Adjustable Text Size',
  'Camera Comfort',
  'Custom Volume Controls',
  'Color Alternatives',
  'Adjustable Difficulty',
  'Playable without Timed Input',
  'Captions available',
  'Save Anytime',
  'Narrated Game Menus',
  'Audio Description',

  // Distribution/Monetization
  'In-App Purchases',
  'Free To Play',
  'Early Access',

  // HDR
  'HDR available',
];

export function getIgnoredTagsSet(userIgnoredTags?: string[]): Set<string> {
  const tags = userIgnoredTags ?? DEFAULT_IGNORED_TAGS;
  return new Set(tags.map((t) => t.toLowerCase()));
}

export function isTagIgnored(tag: string, ignoredSet: Set<string>): boolean {
  return ignoredSet.has(tag.toLowerCase());
}
