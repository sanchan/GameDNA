// Port of server/services/tag-filter.ts — no changes needed (pure logic).

export const DEFAULT_BLACKLISTED_TAGS: string[] = [];

/** @deprecated Use DEFAULT_BLACKLISTED_TAGS */
export const DEFAULT_IGNORED_TAGS = DEFAULT_BLACKLISTED_TAGS;

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
