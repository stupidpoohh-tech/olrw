import { useRef, useState } from 'react';
import { COVER_COLORS, type CoverId, type CoverKind } from '../../design/colors';
import { coverBackground } from '../../design/paper';
import { toCoverJpeg } from './cover';

interface Props {
  vol: number;
  title: string;
  setTitle: (v: string) => void;
  cover: { kind: CoverKind; value: string; preview?: string };
  setCover: (c: { kind: CoverKind; value: string; preview?: string; file?: Blob }) => void;
  onBack: () => void;
  onBind: () => void;
  busy: boolean;
  /** 사진 표지를 올릴 수 있는 구현인가. 아니면 색만 내준다. (D14) */
  canUploadCover: boolean;
}

export function PhaseCustomize({ vol, title, setTitle, cover, setCover, onBack, onBind, busy, canUploadCover }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError(''); setWorking(true);
    try {
      const blob = await toCoverJpeg(f);
      setCover({ kind: 'photo', value: '', preview: URL.createObjectURL(blob), file: blob });
    } catch (e) {
      setError(e instanceof Error ? e.message : '사진을 처리하지 못했습니다.');
    } finally { setWorking(false); }
  };

  return (
    <div className="rt-card">
      <p className="rt-lead display">— Choose a Cover —</p>
      <h2 className="rt-title">표지를 고르세요</h2>
      <p className="rt-sub">
        {canUploadCover ? '색을 고르거나 사진을 올릴 수 있습니다.' : '색을 고르세요.'}<br />
        제목을 비워두면 VOL.{vol} 로 남습니다.
      </p>

      <input className="onb-input rt-input" type="text" value={title} maxLength={20}
        placeholder={`예) 봄날의 출퇴근`}
        onChange={(e) => setTitle(e.target.value)} />

      <div className="covers">
        {COVER_COLORS.map((c) => (
          <button key={c.id} type="button"
            className={`cover ${cover.kind === 'color' && cover.value === c.id ? 'active' : ''}`}
            style={{ background: coverBackground('color', c.id as CoverId) }}
            title={c.label} aria-label={c.label}
            onClick={() => setCover({ kind: 'color', value: c.id })} />
        ))}
        {canUploadCover && (
          <>
            <button type="button"
              className={`cover upload ${cover.kind === 'photo' ? 'active' : ''}`}
              style={cover.preview ? { background: `center / cover no-repeat url("${cover.preview}")` } : undefined}
              title="사진 표지 올리기" aria-label="사진 표지 올리기"
              onClick={() => file.current?.click()}>
              {!cover.preview && <span aria-hidden="true">＋</span>}
            </button>
            <input ref={file} type="file" accept="image/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void pick(f); }} />
          </>
        )}
      </div>

      {working && <p className="rt-note">사진을 표지로 다듬는 중…</p>}
      {cover.kind === 'photo' && !working && (
        <p className="rt-note">사진 표지가 적용됐습니다. 색을 누르면 되돌아갑니다.</p>
      )}
      {error && <p className="onb-error" role="alert">{error}</p>}

      <div className="rt-btns">
        <button className="btn-ghost" onClick={onBack} disabled={busy}>← 이전</button>
        <button className="onb-primary" onClick={onBind} disabled={busy || working}>
          {busy ? '올리는 중…' : '제본 시작 →'}
        </button>
      </div>
    </div>
  );
}
