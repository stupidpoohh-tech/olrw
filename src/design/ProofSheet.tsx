import { useState } from 'react';
import {
  PAPER_COLORS, TYPE_COLORS, COVER_COLORS,
  type PaperColor, type TypeColor,
} from './colors';
import { paperStyle, paperSwatchStyle, coverBackground } from './paper';
import './ProofSheet.css';

/* §3 의 색 토큰. CSS 변수와 이름·값이 같아야 한다. */
const NEUTRALS = [
  ['--bg', '#fafaf8'], ['--bg-soft', '#f4f4f0'], ['--surface', '#ffffff'],
  ['--surface-2', '#f7f7f5'], ['--divider', '#ececea'], ['--divider-soft', '#f0f0ee'],
] as const;

const INKS = [
  ['--ink', '#111111'], ['--ink-soft', '#2e2e2e'], ['--ink-mid', '#5b5b5b'],
  ['--ink-faded', '#8a8a8a'], ['--ink-light', '#b8b8b8'], ['--ink-faint', '#d8d8d6'],
] as const;

/**
 * 정원 4명이므로 한 전보함에서 동시에 보이는 용지는 최대 넷이다.
 * pickPaper() 가 앞에서부터 나눠주므로 실제 4인 방은 이 조합이 된다 —
 * solid / dashed / dotted / double 로 테두리가 전부 다르다.
 */
const ROOM: readonly { paper: PaperColor; name: string; body: string }[] = [
  { paper: PAPER_COLORS[0], name: '나',   body: '고양이가 나를 따라옴 STOP 증거는 내 기억뿐 STOP' },
  { paper: PAPER_COLORS[1], name: '민서', body: '퇴근길에 분식집 지나감 STOP 발이 멈춤 STOP' },
  { paper: PAPER_COLORS[2], name: '재이', body: '다큐 하나 봤는데 꼭 말해줘야함 STOP 만나서 STOP' },
  { paper: PAPER_COLORS[3], name: '현',   body: '새로 산 향수가 실패 STOP 수박껍질 냄새남 STOP' },
];

function Stopped({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\bSTOP\b)/g).map((part, i) =>
        part === 'STOP'
          ? <span key={i} className="ps-stop">STOP</span>
          : <span key={i}>{part}</span>,
      )}
    </>
  );
}

function TokenGrid({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <div className="ps-tokens">
      {items.map(([name, hex]) => (
        <div className="ps-token" key={name}>
          <div className="ps-token-chip" style={{ background: hex }} />
          <div className="ps-token-meta">
            <div className="ps-token-name">{name}</div>
            <div className="ps-token-hex">{hex}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Telegram({ paper, name, body }: { paper: PaperColor; name: string; body: string }) {
  return (
    <div className="ps-card" style={paperStyle(paper.id)}>
      <div className="ps-card-meta">
        <span className="ps-swatch" style={paperSwatchStyle(paper.id)} />
        수신 · {name}
      </div>
      <div className="ps-card-body"><Stopped text={body} /></div>
    </div>
  );
}

function TypewriterTint({ color }: { color: TypeColor }) {
  return (
    <div className="ps-type">
      <img src="/assets/typewriter.png" alt="" style={{ filter: color.filter }} />
      <div className="ps-type-name">
        <span className="ps-dot" style={{ background: color.tint }} />
        {color.label}
      </div>
    </div>
  );
}

export function ProofSheet() {
  const [motionKey, setMotionKey] = useState(0);

  return (
    <div className="ps">
      <header className="ps-head">
        <h1 className="ps-title">토큰 확인표</h1>
        <p className="ps-sub">
          docs/PORTING-SPEC.md §3 · §4 · §6 의 값이 그대로 옮겨졌는지 눈으로 확인하는 표입니다.
          단계 3에서 실제 화면으로 교체됩니다.
        </p>
      </header>

      <section className="ps-sec">
        <div className="ps-sec-label">§3 뉴트럴</div>
        <TokenGrid items={NEUTRALS} />
      </section>

      <section className="ps-sec">
        <div className="ps-sec-label">§3 잉크</div>
        <TokenGrid items={INKS} />
      </section>

      <section className="ps-sec">
        <div className="ps-sec-label">§3 액센트</div>
        <p className="ps-note">
          따뜻한 단 하나의 음입니다. STOP 과 점 표시에만 씁니다. 역할 없는 색을 추가하지 않습니다.
        </p>
        <TokenGrid items={[['--accent', '#8a3a31'], ['--gold-light', '#d4b87f']]} />
      </section>

      <section className="ps-sec">
        <div className="ps-sec-label">§4-1 용지색 — 발신인 구분</div>
        <p className="ps-note">
          여덟 가지 용지에 서로 다른 테두리를 짝지었습니다. 색약 사용자가 색을 놓쳐도
          테두리로 발신인을 읽을 수 있습니다.
        </p>
        <div className="ps-papers">
          {PAPER_COLORS.map((p) => (
            <div className="ps-card" key={p.id} style={paperStyle(p.id)}>
              <div className="ps-card-meta">
                <span className="ps-swatch" style={paperSwatchStyle(p.id)} />
                {p.label}
              </div>
              <div className="ps-card-body">{p.bg} · {p.edge} · {p.ink}</div>
              <div className="ps-card-edge">{p.edgeStyle} {p.edgeWidth}px</div>
            </div>
          ))}
        </div>
      </section>

      <section className="ps-sec">
        <div className="ps-sec-label">비색상 단서가 실제로 작동하는가</div>
        <p className="ps-note">
          같은 전보함, 같은 네 사람입니다. 오른쪽은 색을 전부 걷어낸 화면입니다.
          오른쪽에서도 네 장이 서로 다른 사람의 것으로 읽혀야 합니다.
        </p>
        <div className="ps-split">
          <div>
            <div className="ps-split-label">색 있음</div>
            <div className="ps-room">
              {ROOM.map((m) => <Telegram key={m.paper.id} {...m} />)}
            </div>
          </div>
          <div>
            <div className="ps-split-label">색 없음 (grayscale)</div>
            <div className="ps-room ps-gray">
              {ROOM.map((m) => <Telegram key={m.paper.id} {...m} />)}
            </div>
          </div>
        </div>
      </section>

      <section className="ps-sec">
        <div className="ps-sec-label">§4-2 타자기색 — 전보함 구분</div>
        <p className="ps-note">
          §4-2 의 filter 값을 그대로 옮겼습니다. 이 색은 본인만 봅니다.
        </p>
        <div className="ps-warn">
          <div className="ps-warn-label">작동하지 않습니다 — 결정이 필요합니다</div>
          <p>
            §4-2 는 원본 사진이 <b>채도 높은 청록색</b>이라고 전제하고 채도를 낮춘 뒤
            hue-rotate 합니다. 그런데 번들에 담겨 온 사진은 <b>이미 채도가 0.084</b> 로
            거의 무채색입니다. 낮출 채도가 없고, 무채색에 건 hue-rotate 는 아무 일도 하지 않습니다.
          </p>
          <p>
            아래 여덟 장의 본체 평균색을 재보면 서로 <b>ΔE 1.0~6.4</b> 밖에 차이가 나지 않습니다.
            ΔE 1 은 나란히 놓고도 거의 구분되지 않는 거리입니다. 즉 <b>전보함을 색으로 구분한다는
            장치가 실제로는 동작하지 않습니다.</b> 참조 구현도 같은 사진을 썼으므로 기존 서비스에서도
            줄곧 이랬을 것입니다.
          </p>
        </div>
        <div className="ps-types">
          {TYPE_COLORS.map((t) => <TypewriterTint key={t.id} color={t} />)}
        </div>
      </section>

      <section className="ps-sec">
        <div className="ps-sec-label">§4-3 표지색 — 제본된 권</div>
        <p className="ps-note">가로 그라디언트가 책등의 원통형 입체감을 만듭니다.</p>
        <div className="ps-spines">
          {COVER_COLORS.map((c, i) => (
            <div
              className="ps-spine"
              key={c.id}
              style={{ background: coverBackground('color', c.id) }}
            >
              <span className="ps-spine-vol">VOL.{i + 1}</span>
              <span className="ps-spine-name">{c.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="ps-sec">
        <div className="ps-sec-label">§6-3 모션</div>
        <p className="ps-note">
          전환은 전부 0.12~0.25초입니다. 느린 이징을 쓰지 않습니다 — 기계식 타자기는
          반응이 빠릅니다. 모션을 줄이는 설정에서는 아래가 움직이지 않습니다.
        </p>
        <div className="ps-motion" key={motionKey}>
          <div className="ps-motion-box" style={{ animation: 'fadeUp .25s cubic-bezier(.2,.8,.2,1) both' }}>fadeUp</div>
          <div className="ps-motion-box" style={{ animation: 'stampIn .45s cubic-bezier(.2,.8,.2,1) both' }}>stampIn</div>
          <button className="ps-replay" onClick={() => setMotionKey((k) => k + 1)}>다시 보기</button>
        </div>
      </section>
    </div>
  );
}
