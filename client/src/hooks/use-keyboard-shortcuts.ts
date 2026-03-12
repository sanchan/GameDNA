import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const pendingKey = useRef<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture if typing in an input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return;
      }

      const key = e.key.toLowerCase();

      // Handle chord: G + second key
      if (pendingKey.current === 'g') {
        pendingKey.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        e.preventDefault();

        switch (key) {
          case 'd': navigate('/discover'); break;
          case 'r': navigate('/recommendations'); break;
          case 'l': navigate('/lists'); break;
          case 'h': navigate('/history'); break;
          case 'b': navigate('/backlog'); break;
          case 'p': navigate('/profile'); break;
          case 's': navigate('/settings'); break;
          case 'c': navigate('/chat'); break;
          case 't': navigate('/stats'); break;
        }
        return;
      }

      // Start chord with 'g'
      if (key === 'g') {
        pendingKey.current = 'g';
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          pendingKey.current = null;
        }, 500);
        return;
      }

      // '/' to focus search
      if (key === '/') {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      }
    };

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [navigate]);
}
