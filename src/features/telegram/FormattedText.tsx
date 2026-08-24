import { Fragment } from 'react';

/**
 * STOP 을 따로 세운다. 전보 문법이고, 액센트색이 쓰이는 두 자리 중 하나다.
 * (다른 하나는 발신인 점)
 */
export function FormattedText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\bSTOP\b)/g).map((part, i) =>
        part === 'STOP'
          ? <span className="stop" key={i}>STOP</span>
          : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
