import { paperStyle, paperSwatchStyle } from '../../design/paper';
import { getPaper, type PaperId } from '../../design/colors';
import { serial, stamp } from '../../lib/format';
import { FormattedText } from './FormattedText';
import './TelegramCard.css';

interface Props {
  id: string;
  paper: PaperId;
  author: string;
  body: string;
  sentAt: string;
  mine: boolean;
  /** 내 전보만 회수할 수 있다. 없으면 회수 단추를 그리지 않는다. */
  onRetract?: ((id: string) => void) | undefined;
}

export function TelegramCard({ id, paper, author, body, sentAt, mine, onRetract }: Props) {
  const p = getPaper(paper);
  return (
    <article className="tg" style={paperStyle(paper)}>
      <div className="tg-head">
        <span className="tg-from">
          <span className="tg-swatch" style={paperSwatchStyle(paper)} />
          {mine ? '송신' : '수신'} · {author}
        </span>
        <span className="tg-no display">No.{serial(id)}</span>
      </div>

      <p className="tg-body"><FormattedText text={body} /></p>

      <div className="tg-foot">
        <span className="tg-time tnum">{stamp(sentAt)}</span>
        {onRetract && (
          <button
            className="tg-retract"
            style={{ color: p.ink }}
            onClick={() => onRetract(id)}
          >회수</button>
        )}
      </div>
    </article>
  );
}
