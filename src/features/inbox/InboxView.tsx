import { getPaper, type PaperId } from '../../design/colors';
import { paperStyle, paperSwatchStyle } from '../../design/paper';
import { stamp } from '../../lib/format';
import type { Box, Envelope, LengthBucket } from '../../lib/types';
import { TelegramCard } from '../telegram/TelegramCard';
import './InboxView.css';

/** 봉인된 전보가 몇 줄쯤인지만 보여준다. 내용은 없다. */
const RULES: Record<LengthBucket, number> = { short: 1, medium: 2, long: 3 };
const BUCKET_LABEL: Record<LengthBucket, string> = {
  short: '짧은 전보', medium: '보통 길이', long: '긴 전보',
};

interface Props {
  box: Box;
  envelopes: readonly Envelope[];
  myId: string;
}

export function InboxView({ box, envelopes, myId }: Props) {
  const received = envelopes.filter((e) => e.authorId !== myId);
  const paperOf = (userId: string): PaperId =>
    box.members.find((m) => m.userId === userId)?.paper ?? 'ivory';
  const nameOf = (userId: string): string =>
    box.members.find((m) => m.userId === userId)?.displayName ?? '알 수 없음';

  const sealedCount = received.filter((e) => !e.unsealed).length;

  return (
    <div className="inbox fade-up">
      <div className="inbox-notice">
        받은 전보 · 이번 권
        {sealedCount > 0 && <span className="inbox-sealed-n">봉인 {sealedCount}</span>}
      </div>

      {received.length === 0 ? (
        <p className="empty">아직 도착한 전보가 없습니다.</p>
      ) : (
        <div className="inbox-list">
          {received.map((e) =>
            e.unsealed && e.body !== null ? (
              <TelegramCard
                key={e.id}
                id={e.id}
                paper={paperOf(e.authorId)}
                author={nameOf(e.authorId)}
                body={e.body}
                sentAt={e.createdAt}
                mine={false}
              />
            ) : (
              <SealedEnvelope
                key={e.id}
                paper={paperOf(e.authorId)}
                author={nameOf(e.authorId)}
                sentAt={e.createdAt}
                bucket={e.lengthBucket}
              />
            ),
          )}
        </div>
      )}

      {box.sealed && (
        <p className="inbox-foot">
          이 전보함은 봉인함입니다. 남이 보낸 전보는 <b>만남 마감의 함께 읽기</b>에서 열립니다.
        </p>
      )}
    </div>
  );
}

function SealedEnvelope({ paper, author, sentAt, bucket }: {
  paper: PaperId; author: string; sentAt: string; bucket: LengthBucket;
}) {
  const p = getPaper(paper);
  return (
    <article className="env" style={paperStyle(paper)} aria-label={`${author}의 봉인된 전보`}>
      <div className="env-head">
        <span className="env-from">
          <span className="env-swatch" style={paperSwatchStyle(paper)} />
          수신 · {author}
        </span>
        <span className="env-time tnum">{stamp(sentAt)}</span>
      </div>

      {/* 글자가 있던 자리. 몇 줄쯤인지만 남긴다. */}
      <div className="env-rules" aria-hidden="true">
        {Array.from({ length: RULES[bucket] }, (_, i) => (
          <span className="env-rule" key={i} style={{ background: p.ink }} />
        ))}
      </div>

      <div className="env-foot">
        <span className="env-seal">봉함</span>
        <span className="env-bucket">{BUCKET_LABEL[bucket]}</span>
      </div>
    </article>
  );
}
