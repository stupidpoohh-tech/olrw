import { useEffect, useRef, type ReactNode } from 'react';
import './Modal.css';

interface Props { title: string; onClose: () => void; children: ReactNode; wide?: boolean }

export function Modal({ title, onClose, children, wide = false }: Props) {
  const card = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // 열려 있는 동안 뒤 화면이 스크롤되지 않게
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    card.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-stage" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal-card ${wide ? 'wide' : ''}`} ref={card} tabIndex={-1}
        role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  );
}
