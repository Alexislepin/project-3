import { useState, useRef, useEffect } from 'react';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';

interface ActivityMenuProps {
  activityId: string;
  userId: string;
  currentUserId: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function ActivityMenu({ activityId, userId, currentUserId, onEdit, onDelete }: ActivityMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  // Only show menu if this is the current user's activity
  if (userId !== currentUserId) {
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="p-1.5 rounded-full hover:bg-stone-100 transition-colors"
        aria-label="Menu"
      >
        <MoreVertical className="w-4 h-4 text-stone-500" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-8 bg-white rounded-xl shadow-lg border border-stone-200 py-1 z-50 min-w-[140px]">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onEdit();
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-stone-700 hover:bg-stone-50 flex items-center gap-2 transition-colors"
          >
            <Edit className="w-4 h-4" />
            Modifier
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsOpen(false);
              onDelete();
            }}
            className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}

