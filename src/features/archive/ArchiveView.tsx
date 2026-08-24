import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { coverBackground, paperStyle, paperSwatchStyle } from '../../design/paper';
import { period, stamp } from '../../lib/format';
import { toUserMessage } from '../../lib/errors';
import { useStore } from '../../lib/storeContext';
import type { Volume, VolumePage } from '../../lib/types';
import { FormattedText } from '../telegram/FormattedText';
import './ArchiveView.css';

const PER_SHELF = 8;

export function ArchiveView({ boxId }: { boxId: string }) {
  const store = useStore();
  const [volumes, setVolumes] = useState<readonly Volume[] | null>(null);
  const [open, setOpen] = useState<Volume | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await store.listVolumes(boxId);
        if (alive) { setVolumes(list); setError(''); }
      } catch (e) {
        if (alive) setError(toUserMessage(e, '서가를 불러오지 못했습니다.'));
      }
    })();
    return () => { alive = false; };
  }, [store, boxId]);

  if (error) return <p className="shell-error" role="alert">{error}</p>;
  if (volumes === null) return <p className="empty">서가를 여는 중…</p>;

  const shelves: Volume[][] = [];
  for (let i = 0; i < volumes.length; i += PER_SHELF) shelves.push(volumes.slice(i, i + PER_SHELF));
  if (shelves.length === 0) shelves.push([]);

  return (
    <div className="archive fade-up">
      <h2 className="section-label display">서가 · Archive</h2>

      <div className="shelves">
        {shelves.map((books, si) => (
          <div className="shelf" key={si}>
            <div className="shelf-books">
              {books.length === 0
                ? <p className="shelf-empty">— 아직 보관된 권이 없습니다 —</p>
                : books.map((v, i) => (
                    <Spine key={v.id} volume={v} idx={si * PER_SHELF + i} onOpen={() => setOpen(v)} />
                  ))}
            </div>
            <div className="shelf-board" />
          </div>
        ))}
      </div>

      {volumes.length === 0 && (
        <p className="empty">첫 만남을 마감하면 이곳에 첫 권이 꽂힙니다.</p>
      )}

      {open && <BookOpen volume={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Spine({ volume, idx, onOpen }: { volume: Volume; idx: number; onOpen: () => void }) {
  const store = useStore();
  const bg = volume.coverKind === 'photo'
    ? coverBackground('photo', store.coverUrl(volume.coverValue))
    : coverBackground('color', volume.coverValue);

  return (
    <button className="spine" data-h={idx % 5} style={{ background: bg }}
      onClick={onOpen} aria-label={`VOL.${volume.vol} 열기`}>
      <span className="spine-vol display tnum">VOL.{volume.vol}</span>
      {volume.title && <span className="spine-title">{volume.title}</span>}
      <span className="spine-count display tnum">{volume.pageCount}</span>
    </button>
  );
}

function BookOpen({ volume, onClose }: { volume: Volume; onClose: () => void }) {
  const store = useStore();
  const [pages, setPages] = useState<readonly VolumePage[] | null>(null);
  const [error, setError] = useState('');

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [close]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await store.getVolumePages(volume.id);
        if (alive) setPages(list);
      } catch (e) {
        if (alive) setError(toUserMessage(e, '책을 펼치지 못했습니다.'));
      }
    })();
    return () => { alive = false; };
  }, [store, volume.id]);

  // 조상 요소에 transform 이 걸리면 position:fixed 가 그 안에 갇힌다.
  // 책은 화면 전체를 덮어야 하므로 body 에 직접 붙인다.
  return createPortal(
    <div className="book-stage" role="dialog" aria-modal="true" aria-label={`VOL.${volume.vol}`}>
      <div className="book-top">
        <button className="link" onClick={close}>← 서가</button>
        <span className="display tnum">VOL.{volume.vol}</span>
        <span />
      </div>

      <div className="book">
        <div className="book-title-page">
          <div className="book-vol display tnum">VOL.{volume.vol}</div>
          {volume.title && <div className="book-name">{volume.title}</div>}
          <div className="book-period display tnum">{period(volume.periodStart, volume.periodEnd)}</div>
          <div className="book-count display">{volume.pageCount} TELEGRAMS</div>
          {!volume.readTogether && (
            <div className="book-note">함께 읽기를 건너뛰고 제본했습니다.</div>
          )}
        </div>

        {error && <p className="shell-error" role="alert">{error}</p>}
        {pages === null && !error && <p className="empty">책장을 넘기는 중…</p>}

        {pages?.map((p) => (
          <div className="book-page" key={p.ord} style={paperStyle(p.paperColor)}>
            <div className="book-page-from">
              <span className="book-page-swatch" style={paperSwatchStyle(p.paperColor)} />
              {p.authorName}
            </div>
            <p className="book-page-body"><FormattedText text={p.body} /></p>
            <div className="book-page-time tnum">{stamp(p.sentAt)}</div>
          </div>
        ))}

        <div className="book-end display">— fin —</div>
      </div>
    </div>,
    document.body,
  );
}
