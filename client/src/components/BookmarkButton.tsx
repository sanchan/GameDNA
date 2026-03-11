import { useTranslation } from 'react-i18next';
import { useBookmarks } from '../hooks/use-bookmarks';
import { useToast } from './Toast';

interface BookmarkButtonProps {
  gameId: number;
  size?: number;
  className?: string;
}

export default function BookmarkButton({ gameId, size = 16, className }: BookmarkButtonProps) {
  const { t } = useTranslation();
  const { isBookmarked, toggle } = useBookmarks();
  const { toast } = useToast();
  const active = isBookmarked(gameId);

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(gameId);
        toast(active ? 'Bookmark removed' : 'Bookmarked', 'success');
      }}
      className={className ?? `w-8 h-8 bg-[#1a1a1a]/80 backdrop-blur-sm hover:bg-[#1a1a1a] rounded-full flex items-center justify-center transition-all ${
        active
          ? 'text-[var(--primary)]'
          : 'text-white/70 hover:text-[var(--primary)]'
      }`}
      title={active ? t('common.removeBookmark') : t('common.bookmark')}
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
