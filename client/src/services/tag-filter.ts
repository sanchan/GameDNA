// Port of server/services/tag-filter.ts — no changes needed (pure logic).

export const DEFAULT_BLACKLISTED_TAGS: string[] = [
  'NSFW',
  'Sexual Content',
  'Nudity',
  'Mature',
  'Hentai',
  'Adult Only',
  'Erotic',
];

// Pre-defined tag collections users can toggle during onboarding / filters
export const TAG_COLLECTIONS: { id: string; label: string; description: string; tags: string[] }[] = [
  {
    id: 'nsfw',
    label: 'NSFW / Sexual Content',
    description: 'Sexual content, nudity, and adult-only games',
    tags: [
      'NSFW',
      'Sexual Content',
      'Nudity',
      'Mature',
      'Hentai',
      'Adult Only',
      'Erotic',
    ],
  },
  {
    id: 'dating-sim',
    label: 'Dating Sim / Visual Novel (Adult)',
    description: 'Adult-oriented dating sims and visual novels',
    tags: [
      'Dating Sim',
      'Visual Novel',
      'Romance',
      'Anime',
    ],
  },
];

export function getBlacklistedTagsSet(userBlacklistedTags?: string[]): Set<string> {
  const tags = userBlacklistedTags ?? DEFAULT_BLACKLISTED_TAGS;
  return new Set(tags.map((t) => t.toLowerCase()));
}

/** @deprecated Use getBlacklistedTagsSet */
export const getIgnoredTagsSet = getBlacklistedTagsSet;

export function isTagBlacklisted(tag: string, blacklistSet: Set<string>): boolean {
  return blacklistSet.has(tag.toLowerCase());
}

/** @deprecated Use isTagBlacklisted */
export const isTagIgnored = isTagBlacklisted;
