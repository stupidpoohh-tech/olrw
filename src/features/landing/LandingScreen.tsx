import { COVER_COLORS, PAPER_COLORS } from '../../design/colors';
import { coverBackground } from '../../design/paper';
import { SealedEnvelope } from '../inbox/InboxView';
import { TelegramCard } from '../telegram/TelegramCard';
import './LandingScreen.css';

/**
 * 로그인 앞에 서는 화면.
 *
 * 이 제품은 첫눈에 뭔지 알기 어렵다 — 전보함, 봉인, 제본, 서가. 그래서 계정을
 * 만들기 전에 무엇인지 먼저 보여준다. 설명 대신 **실제 화면 조각**을 쓴다.
 * 여기 보이는 전보 카드와 봉투는 앱에서 쓰는 그 컴포넌트 그대로다.
 */

const HOURS_AGO = (h: number): string => {
  const d = new Date();
  d.setHours(d.getHours() - h);
  return d.toISOString();
};

interface Props {
  onSignUp: () => void;
  onSignIn: () => void;
  onGuest: () => void;
}

export function LandingScreen({ onSignUp, onSignIn, onGuest }: Props) {
  return (
    <div className="lp">
      <header className="lp-head">
        <p className="lp-mark display">OLRW</p>
        <h1 className="lp-title display">Our love,<br />rightly written</h1>
        <p className="lp-lede">
          만나서 얘기하려고 아껴둔 말을,<br />
          전보로 보내고 책으로 묶습니다.
        </p>
        <div className="lp-cta">
          <button className="lp-primary" onClick={onSignUp}>전보함 열기</button>
          <button className="lp-secondary" onClick={onSignIn}>로그인</button>
        </div>
        <button className="lp-guest" onClick={onGuest}>
          계정 없이 먼저 둘러보기
        </button>
      </header>

      <section className="lp-step">
        <p className="lp-step-no display">01</p>
        <h2 className="lp-step-title">담습니다</h2>
        <p className="lp-step-body">
          하고 싶은 말이 생기면 타전합니다. 백 자까지, <span className="stop">STOP</span> 으로
          문장을 끊는 전보 문법을 씁니다. 용지 색이 곧 발신인이라, 누가 보냈는지 색으로 읽힙니다.
        </p>
        <div className="lp-demo">
          <TelegramCard
            id="a1b2c3d4" paper={PAPER_COLORS[0].id} author="나"
            body="고양이가 나를 따라옴 STOP 증거는 내 기억뿐 STOP"
            sentAt={HOURS_AGO(5)} mine
          />
          <TelegramCard
            id="e5f6a7b8" paper={PAPER_COLORS[1].id} author="민서"
            body="퇴근길에 분식집 지나감 STOP 발이 멈춤 STOP"
            sentAt={HOURS_AGO(2)} mine={false}
          />
        </div>
      </section>

      <section className="lp-step">
        <p className="lp-step-no display">02</p>
        <h2 className="lp-step-title">만나는 날까지 봉해 둡니다</h2>
        <p className="lp-step-body">
          남이 보낸 전보는 봉투로만 보입니다. 누가 언제 보냈는지, 얼마나 긴지는 알지만
          내용은 만나서 함께 엽니다. 미리 다 읽어 버리면 만나서 할 말이 남지 않으니까요.
        </p>
        <div className="lp-demo">
          <SealedEnvelope paper={PAPER_COLORS[3].id} author="재이" sentAt={HOURS_AGO(9)} bucket="medium" />
          <SealedEnvelope paper={PAPER_COLORS[1].id} author="민서" sentAt={HOURS_AGO(20)} bucket="short" />
        </div>
        <p className="lp-aside">읽음 표시도, 타이핑 표시도 없습니다. 느림이 기능입니다.</p>
      </section>

      <section className="lp-step">
        <p className="lp-step-no display">03</p>
        <h2 className="lp-step-title">만나서 맺습니다</h2>
        <p className="lp-step-body">
          실제로 만난 날 ‘만남 마감’을 합니다. 봉인이 풀리고 한 통씩 함께 읽은 뒤,
          그 회차가 한 권으로 제본되어 서가에 꽂힙니다. 그때의 이름과 색이 그대로 남아
          나중에 무엇을 바꾸어도 지난 책은 변하지 않습니다.
        </p>
        <div className="lp-shelf">
          <div className="shelf-books">
            {COVER_COLORS.map((c, i) => (
              <span className="spine" data-h={i % 5} key={c.id}
                style={{ background: coverBackground('color', c.id) }}>
                <span className="spine-vol display tnum">VOL.{i + 1}</span>
                <span className="spine-title">{['첫 봄', '여름 기록', '가을 어귀', '겨울 초입', '다시 봄'][i]}</span>
                <span className="spine-count display tnum">{6 + i * 3}</span>
              </span>
            ))}
          </div>
          <div className="shelf-board" />
        </div>
      </section>

      <section className="lp-rules">
        <h2 className="lp-rules-title">이런 것은 없습니다</h2>
        <ul>
          <li>읽음 표시와 타이핑 표시</li>
          <li>알림으로 재촉하는 일</li>
          <li>다섯 번째 사람 — 전보함 하나에 최대 네 명입니다</li>
        </ul>
        <p className="lp-aside">
          채팅이 아니라 원고를 쌓는 도구입니다. 제약은 실수가 아니라 설계입니다.
        </p>
      </section>

      <footer className="lp-foot">
        <p className="lp-foot-line">전보함을 만들어 코드를 나눠주거나, 받은 코드로 참여하세요.</p>
        <div className="lp-cta">
          <button className="lp-primary" onClick={onSignUp}>전보함 열기</button>
          <button className="lp-secondary" onClick={onSignIn}>로그인</button>
        </div>
        <button className="lp-guest" onClick={onGuest}>
          계정 없이 먼저 둘러보기
        </button>
        <p className="lp-mark display lp-foot-mark">OLRW</p>
      </footer>
    </div>
  );
}
