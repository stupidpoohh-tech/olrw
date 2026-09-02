/**
 * 무엇이 잘못됐는지 사람 말로 옮긴다.
 *
 * 서버 함수는 이미 한국어로 raise 한다(`정원이 가득 찼습니다.` 등). 그건 그대로 쓰고,
 * 인증 쪽 영어 코드와 네트워크 오류만 옮긴다. Neon 의 SupabaseAuthAdapter 가 Better Auth
 * 오류를 아래와 같은 코드로 정규화해 주므로, 이 표는 갈아탄 뒤에도 그대로 맞는다.
 * 원문을 그대로 흘리면 사용자가 읽을 수 없는 문장이 화면에 뜬다. (docs/AUDIT.md §04-3)
 */

const AUTH: Readonly<Record<string, string>> = {
  invalid_credentials: '이메일 또는 비밀번호가 일치하지 않습니다.',
  email_address_invalid: '이메일 형식이 올바르지 않습니다.',
  user_already_exists: '이미 가입된 이메일입니다.',
  email_exists: '이미 가입된 이메일입니다.',
  weak_password: '비밀번호는 6자 이상이어야 합니다.',
  over_request_rate_limit: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  over_email_send_rate_limit: '메일 발송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
  email_not_confirmed: '메일함에서 인증 링크를 먼저 확인해 주세요.',
  signup_disabled: '지금은 가입을 받지 않습니다.',
};

/** 서버 함수가 raise 한 우리 문장은 이미 한국어이고 마침표로 끝난다. */
const looksKorean = (s: string): boolean => /[가-힣]/.test(s);

export function toUserMessage(e: unknown, fallback = '문제가 생겼습니다. 잠시 후 다시 시도해 주세요.'): string {
  if (!e) return fallback;

  if (typeof e === 'object') {
    const err = e as { code?: unknown; message?: unknown; name?: unknown };

    const code = typeof err.code === 'string' ? err.code : '';
    if (code && AUTH[code]) return AUTH[code]!;

    const message = typeof err.message === 'string' ? err.message : '';

    if (looksKorean(message)) return message;

    if (/failed to fetch|networkerror|network request failed/i.test(message)) {
      return '네트워크 연결을 확인해 주세요.';
    }
    if (/duplicate key value.*invite_code/i.test(message)) {
      return '코드 생성에 실패했습니다. 다시 시도해 주세요.';
    }
    if (/duplicate key value.*paper_color/i.test(message)) {
      return '이미 다른 참여자가 쓰고 있는 용지색입니다. 다른 색을 골라 주세요.';
    }
    if (/row-level security|permission denied/i.test(message)) {
      return '권한이 없습니다. 다시 로그인해 주세요.';
    }
    for (const [k, v] of Object.entries(AUTH)) {
      if (message.toLowerCase().includes(k.replace(/_/g, ' '))) return v;
    }
  }

  if (typeof e === 'string' && looksKorean(e)) return e;
  return fallback;
}
