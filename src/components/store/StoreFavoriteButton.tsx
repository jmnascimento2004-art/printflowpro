'use client';

import type { KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { Heart } from 'lucide-react';

interface StoreFavoriteButtonProps {
  productId: string;
  isFavorite: boolean;
  isPending: boolean;
  onToggle: (productId: string) => void;
  className?: string;
}

export function StoreFavoriteButton({
  productId,
  isFavorite,
  isPending,
  onToggle,
  className = ''
}: StoreFavoriteButtonProps) {
  const stopMousePropagation = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const stopPointerPropagation = (event: PointerEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const stopKeyboardPropagation = (event: KeyboardEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isPending) return;
    onToggle(productId);
  };

  const handleDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <span
      className="inline-flex"
      onClick={stopMousePropagation}
      onDoubleClick={stopMousePropagation}
      onMouseDown={stopMousePropagation}
      onPointerDown={stopPointerPropagation}
      onKeyDown={stopKeyboardPropagation}
      onKeyUp={stopKeyboardPropagation}
    >
      <button
        type="button"
        className={`flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 ${
          isFavorite ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'
        } ${isPending ? 'cursor-wait opacity-70' : ''} ${className}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        aria-disabled={isPending}
        aria-pressed={isFavorite}
        aria-busy={isPending}
        aria-label={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
        title={isFavorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} />
      </button>
    </span>
  );
}
