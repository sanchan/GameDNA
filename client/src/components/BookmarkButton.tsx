import { useBookmarks } from '../hooks/use-bookmarks';

interface BookmarkButtonProps {
  gameId: number;
  size?: number;
}

export default function BookmarkButton({ gameId, size = 16 }: BookmarkButtonProps) {
  const { isBookmarked, toggle } = useBookmarks();
  const active = isBookmarked(gameId);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(gameId);
      }}
      className={`p-1.5 rounded-lg hover:bg-[var(--muted)] transition-colors ${
        active
          ? 'text-[var(--primary)]'
          : 'text-[var(--muted-foreground)] hover:text-[var(--primary)]'
      }`}
      title={active ? 'Remove bookmark' : 'Bookmark'}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill={active ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
    </button>
  );
}
