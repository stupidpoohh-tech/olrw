// ============================================
// MeetingRitual — closing ceremony
//   Phase 0: confirm count + period
//   Phase 1: choose cover + (optional) title
//   Phase 2: binding animation
//   Phase 3: result — book on shelf with stamp
// ============================================

const COVER_OPTIONS = [
  { id: 'sage',     label: '세이지' },
  { id: 'burgundy', label: '버건디' },
  { id: 'sand',     label: '샌드' },
  { id: 'navy',     label: '네이비' },
  { id: 'charcoal', label: '차콜' },
];

function PhaseConfirm({ count, period, vol, onCancel, onNext }) {
  return (
    <div className="ritual-card" key="confirm">
      <div className="ritual-step-label">— Closing the Volume —</div>
      <div className="ritual-title">이번 권을 닫습니다</div>
      <div className="ritual-sub">
        지금까지의 전보를 한 권으로 묶어<br />
        서가에 보관합니다.
      </div>
      <div className="ritual-meta">
        <div className="ritual-meta-item">
          <div className="ritual-meta-num">VOL.{vol}</div>
          <div className="ritual-meta-label">Volume</div>
        </div>
        <div className="ritual-meta-item">
          <div className="ritual-meta-num">{count}</div>
          <div className="ritual-meta-label">Telegrams</div>
        </div>
      </div>
      <div className="ritual-sub" style={{ marginTop: -8, marginBottom: 18 }}>
        {period}
      </div>
      <div className="ritual-btns">
        <button className="ritual-btn ghost" onClick={onCancel}>취소</button>
        <button className="ritual-btn primary" onClick={onNext}>다음 →</button>
      </div>
    </div>
  );
}

function PhaseCustomize({ vol, title, setTitle, cover, setCover, onBack, onBind }) {
  const { useRef, useState } = React;
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [imgErr, setImgErr] = useState('');
  const customImg = isImageCover(cover) ? cover : null;

  const onPick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-picking same file
    if (!file) return;
    setImgErr('');
    if (!file.type.startsWith('image/')) {
      setImgErr('이미지 파일만 올릴 수 있어요.');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToCoverDataURL(file);
      setCover(dataUrl);
    } catch (err) {
      setImgErr(err.message || '이미지를 처리하지 못했어요.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="ritual-card" key="customize">
      <div className="ritual-step-label">— Choose a Cover —</div>
      <div className="ritual-title">표지를 고르세요</div>
      <div className="ritual-sub">
        색을 고르거나 사진을 표지로 올릴 수 있어요.<br />
        (제목은 비워두면 VOL.{vol})
      </div>

      <input
        className="ritual-input"
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={`예) 봄날의 출퇴근 / VOL.${vol}`}
        maxLength={20}
      />

      <div className="ritual-covers">
        {COVER_OPTIONS.map((c) => (
          <button
            key={c.id}
            className={`cover-swatch ${c.id} ${cover === c.id ? 'active' : ''}`}
            onClick={() => setCover(c.id)}
            aria-label={c.label}
            title={c.label}
          />
        ))}

        <button
          className={`cover-swatch cover-upload ${customImg ? 'active has-img' : ''}`}
          onClick={() => fileRef.current && fileRef.current.click()}
          title="사진 표지 올리기"
          aria-label="사진 표지 올리기"
          style={customImg ? { background: `center / cover no-repeat url("${customImg}")` } : undefined}
        >
          {!customImg && <span className="cover-upload-plus">＋</span>}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          style={{ display: 'none' }}
        />
      </div>

      {uploading && <div className="ritual-img-note">사진을 표지로 다듬는 중…</div>}
      {customImg && !uploading && (
        <div className="ritual-img-note">사진 표지가 적용됐어요. 색을 누르면 되돌릴 수 있어요.</div>
      )}
      {imgErr && <div className="ritual-img-note err">{imgErr}</div>}

      <div className="ritual-btns">
        <button className="ritual-btn ghost" onClick={onBack}>← 이전</button>
        <button className="ritual-btn primary" onClick={onBind}>제본 시작 →</button>
      </div>
    </div>
  );
}

function BindingAnimation({ cover, vol, title, count, onDone }) {
  const { useEffect, useState, useMemo } = React;
  const [phase, setPhase] = useState(0); // 0 gather → 1 stack → 2 wrap → 3 stamp → 4 done
  const { playRoll, playStamp, playReturn } = useTypeSound();

  useEffect(() => {
    playRoll();
    const t1 = setTimeout(() => setPhase(1), 1600);   // pages settled
    const t2 = setTimeout(() => { setPhase(2); playRoll(); }, 2200); // covers wrapping
    const t3 = setTimeout(() => { setPhase(3); playStamp(); }, 3400); // gold stamp
    const t4 = setTimeout(() => { setPhase(4); playReturn(); }, 4400); // done
    const t5 = setTimeout(() => onDone(), 5800);
    return () => [t1, t2, t3, t4, t5].forEach(clearTimeout);
  }, []);

  // Pre-compute page entry transforms
  const pages = useMemo(() => Array.from({ length: 12 }).map((_, i) => ({
    delay: i * 0.06,
    x: (Math.random() - 0.5) * 420,
    y: (Math.random() - 0.5) * 380,
    rot: (Math.random() - 0.5) * 120,
    final: (Math.random() - 0.5) * 2.5,
    z: i,
  })), []);

  const sparks = useMemo(() => Array.from({ length: 14 }).map((_, i) => ({
    angle: (Math.PI * 2 * i) / 14 + Math.random() * 0.3,
    distance: 80 + Math.random() * 60,
    delay: Math.random() * 0.15,
  })), []);

  return (
    <>
      <style>{`
        @keyframes pageFly {
          0%   { opacity: 0; transform: translate(var(--x), var(--y)) rotate(var(--rot)) scale(0.6); }
          60%  { opacity: 1; }
          100% { opacity: 1; transform: translate(0, 0) rotate(var(--final)) scale(1); }
        }
        @keyframes coverWrapBack {
          0%   { transform: translateX(-110%) rotate(-4deg); }
          100% { transform: translateX(0) rotate(0); }
        }
        @keyframes coverWrapFront {
          0%   { transform: translateX(110%) rotate(4deg); }
          100% { transform: translateX(0) rotate(0); }
        }
        @keyframes goldStampIn {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(3) rotate(-12deg); filter: blur(4px); }
          50%  { opacity: 1; transform: translate(-50%, -50%) scale(0.9) rotate(-2deg); filter: blur(0); }
          75%  { transform: translate(-50%, -50%) scale(1.08) rotate(0); }
          100% { transform: translate(-50%, -50%) scale(1) rotate(0); }
        }
        @keyframes sparkFly {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          10%  { opacity: 1; }
          100% { opacity: 0; transform: translate(calc(-50% + var(--sx)), calc(-50% + var(--sy))) scale(0.3); }
        }
        @keyframes flashWhite {
          0%, 100% { opacity: 0; }
          15% { opacity: 1; }
        }
      `}</style>

      <div className="binding-stage">
        <div className="binding-pages">
          {/* Pages flying in and stacking */}
          {pages.map((p, i) => (
            <div
              key={i}
              className="binding-page"
              style={{
                '--x': `${p.x}px`,
                '--y': `${p.y}px`,
                '--rot': `${p.rot}deg`,
                '--final': `${p.final}deg`,
                animation: `pageFly 1.1s ${p.delay}s cubic-bezier(.2,.8,.2,1) both`,
                zIndex: p.z,
              }}
            />
          ))}

          {/* Cover wrapping from both sides (after phase 1) */}
          {phase >= 2 && (
            <>
              <div
                className={`binding-cover-back cover-swatch-bg cover-${cover}`}
                style={{
                  animation: 'coverWrapBack 0.7s cubic-bezier(.4,1.4,.5,1) both',
                  zIndex: 20,
                  background: getCoverBg(cover),
                }}
              />
              <div
                className={`binding-cover-front cover-${cover}`}
                style={{
                  animation: 'coverWrapFront 0.7s cubic-bezier(.4,1.4,.5,1) both',
                  zIndex: 22,
                  background: getCoverBg(cover),
                }}
              >
                {/* gold border */}
                <div style={{
                  position: 'absolute',
                  inset: 8,
                  border: '1px solid rgba(212, 184, 127, 0.6)',
                  borderRadius: 1,
                }} />
              </div>
            </>
          )}

          {/* Flash on stamp */}
          {phase === 3 && (
            <div style={{
              position: 'absolute',
              inset: -200,
              background: 'radial-gradient(circle, rgba(255,255,255,0.6), transparent 60%)',
              animation: 'flashWhite 0.5s ease',
              zIndex: 25,
              pointerEvents: 'none',
            }} />
          )}

          {/* Gold stamp */}
          {phase >= 3 && (
            <div
              className="binding-gold-stamp"
              style={{
                animation: 'goldStampIn 0.7s cubic-bezier(.3,1.6,.4,1) both',
                zIndex: 30,
                textAlign: 'center',
                width: '100%',
              }}
            >
              <div style={{ fontSize: 28, lineHeight: 1.2 }}>VOL.{vol}</div>
              {title && title !== `VOL.${vol}` && (
                <div style={{
                  fontFamily: "'Noto Serif KR', serif",
                  fontSize: 13,
                  letterSpacing: '0.1em',
                  marginTop: 6,
                  fontWeight: 600,
                }}>
                  {title}
                </div>
              )}
              <div style={{
                fontSize: 9,
                letterSpacing: '0.3em',
                marginTop: 8,
                opacity: 0.85,
              }}>
                {count} TELEGRAMS
              </div>
            </div>
          )}

          {/* Sparks at stamping */}
          {phase >= 3 && (
            <div className="sparks">
              {sparks.map((s, i) => (
                <div
                  key={i}
                  className="spark"
                  style={{
                    '--sx': `${Math.cos(s.angle) * s.distance}px`,
                    '--sy': `${Math.sin(s.angle) * s.distance}px`,
                    animation: `sparkFly 0.9s ${s.delay}s ease-out both`,
                    zIndex: 28,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="binding-status">
          {phase === 0 && '종이를 모으는 중 …'}
          {phase === 1 && '결을 맞추는 중 …'}
          {phase === 2 && '표지를 두르는 중 …'}
          {phase === 3 && '금박을 새기는 중 …'}
          {phase === 4 && '완성'}
        </div>
      </div>
    </>
  );
}

function isImageCover(cover) {
  return typeof cover === 'string' && (cover.startsWith('data:') || cover.startsWith('http') || cover.startsWith('blob:'));
}

function getCoverBg(cover) {
  if (isImageCover(cover)) {
    return `center / cover no-repeat url("${cover}")`;
  }
  const bgs = {
    sage:     'linear-gradient(to right, #4d6357, #6b8577, #4d6357)',
    burgundy: 'linear-gradient(to right, #5c2118, #8b3327, #5c2118)',
    sand:     'linear-gradient(to right, #806038, #ad8a5a, #806038)',
    navy:     'linear-gradient(to right, #1e2a3a, #344862, #1e2a3a)',
    charcoal: 'linear-gradient(to right, #1f1c18, #3a3530, #1f1c18)',
  };
  return bgs[cover] || bgs.sage;
}

// Downscale an uploaded image to a small JPEG data URL that fits a book cover
// (keeps Firestore docs well under the 1MB limit).
function fileToCoverDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('파일을 읽지 못했어요.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
      img.onload = () => {
        // cover aspect ratio ~ 5:7 (width:height)
        const TARGET_W = 320, TARGET_H = 448;
        const canvas = document.createElement('canvas');
        canvas.width = TARGET_W;
        canvas.height = TARGET_H;
        const ctx = canvas.getContext('2d');
        // cover-fit crop
        const scale = Math.max(TARGET_W / img.width, TARGET_H / img.height);
        const w = img.width * scale, h = img.height * scale;
        ctx.drawImage(img, (TARGET_W - w) / 2, (TARGET_H - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function PhaseDone({ vol, title, count, cover, onClose }) {
  return (
    <div className="ritual-card" key="done">
      <div style={{
        margin: '0 auto 22px',
        width: 100, height: 140,
        background: getCoverBg(cover),
        position: 'relative',
        boxShadow: '0 14px 30px rgba(0,0,0,0.4)',
        animation: 'stampIn 0.5s ease both',
      }}>
        <div style={{
          position: 'absolute', inset: 6,
          border: '1px solid rgba(212,184,127,0.5)',
        }} />
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: '0.1em',
          color: 'var(--gold-light)',
          textAlign: 'center',
          width: '90%',
        }}>
          <div>VOL.{vol}</div>
          {title && title !== `VOL.${vol}` && (
            <div style={{
              fontFamily: "'Noto Serif KR', serif",
              fontSize: 10,
              marginTop: 6,
              opacity: 0.9,
              fontWeight: 600,
              wordBreak: 'keep-all',
            }}>
              {title}
            </div>
          )}
        </div>
      </div>

      <div className="ritual-step-label">— Archived —</div>
      <div className="ritual-title">보관 완료</div>
      <div className="ritual-sub">
        {count}통의 전보가 서가에 꽂혔습니다.<br />
        새로운 권이 시작됩니다.
      </div>
      <div className="ritual-btns">
        <button className="ritual-btn primary" onClick={onClose}>서가에서 보기</button>
      </div>
    </div>
  );
}

function MeetingRitual({ state, onClose, onConfirmClose, onCloseAndGoArchive }) {
  const { useState, useMemo } = React;
  const [phase, setPhase] = useState('confirm'); // confirm → customize → binding → done
  const [title, setTitle] = useState('');
  const [cover, setCover] = useState('sage');
  const [closedVol, setClosedVol] = useState(null);

  const currentTg = state.telegrams.filter((t) => t.vol === state.currentVol);
  const count = currentTg.length;

  const period = useMemo(() => {
    if (count === 0) return '—';
    const times = currentTg.map((t) => new Date(t.time).getTime());
    const a = new Date(Math.min(...times));
    const b = new Date(Math.max(...times));
    const f = (d) => `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
    return `${f(a)} — ${f(b)}`;
  }, [currentTg, count]);

  const handleBind = () => {
    setPhase('binding');
  };

  const handleBindingDone = () => {
    const vol = onConfirmClose({ title, cover });
    setClosedVol(vol);
    setPhase('done');
  };

  const handleClose = () => {
    if (phase === 'binding') return; // can't dismiss mid-animation
    onClose();
  };

  return (
    <div className="ritual-stage" onClick={handleClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
        {phase === 'confirm' && (
          <PhaseConfirm
            count={count}
            period={period}
            vol={state.currentVol}
            onCancel={onClose}
            onNext={() => setPhase('customize')}
          />
        )}
        {phase === 'customize' && (
          <PhaseCustomize
            vol={state.currentVol}
            title={title} setTitle={setTitle}
            cover={cover} setCover={setCover}
            onBack={() => setPhase('confirm')}
            onBind={handleBind}
          />
        )}
        {phase === 'binding' && (
          <BindingAnimation
            cover={cover}
            vol={state.currentVol}
            title={title || `VOL.${state.currentVol}`}
            count={count}
            onDone={handleBindingDone}
          />
        )}
        {phase === 'done' && closedVol && (
          <PhaseDone
            vol={closedVol.vol}
            title={title}
            count={count}
            cover={cover}
            onClose={onCloseAndGoArchive}
          />
        )}
      </div>
    </div>
  );
}

window.MeetingRitual = MeetingRitual;
