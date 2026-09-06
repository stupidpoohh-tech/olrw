/**
 * 무엇이 잘못됐는지 사람 말로 옮긴다.
 *
 * 서버 함수는 이미 한국어로 raise 한다(`정원이 가득 찼습니다.` 등). 그건 그대로 쓰고,
 * 인증 쪽 영어 코드와 네트워크 오류만 옮긴다.
 *
 * **표는 비어 있으면 안 된다.** Neon 의 SupabaseAuthAdapter 는 Better Auth 오류를
 * 정해진 코드 집합(`AuthErrorCode`)으로 정규화해 준다. 그 집합 중 하나라도 여기
 * 빠져 있으면 화면에는 "문제가 생겼습니다" 만 뜨고, 사용자도 우리도 무슨 일인지
 * 알 수 없다 — 실제로 `session_not_found` 가 빠져 있어서, 비밀번호가 맞는데도
 * 가입도 로그인도 안 되는 사람이 아무 단서 없이 막혔다.
 * 표가 그 집합을 다 덮는지는 `pnpm errors:check` 가 패키지와 대조해 지킨다.
 */

/**
 * 로그인 서버가 이 주소를 모르는 경우.
 *
 * Better Auth 는 요청의 `Origin` 헤더를 신뢰 목록과 대조하고, 목록에 없으면
 * 자격 증명을 보기도 전에 403 `Invalid origin` 으로 끊는다. 어댑터는 403 을
 * 전부 `feature_not_supported` 로 뭉뚱그리는데, 우리 앱은 OAuth·SSO·전화번호를
 * 쓰지 않으므로 403 이 올 현실적인 이유가 이것 하나다.
 *
 * 기다린다고 풀리지 않는다 — Neon 콘솔에 주소를 등록해야 한다. 그래서 여기서만
 * 클릭 경로를 문장에 담는다 (docs/SETUP.md §5-1).
 */
function invalidOriginMessage(): string {
  let origin = '';
  try { origin = location.origin; } catch { /* 브라우저가 아님 */ }
  return `이 주소는 로그인 서버에 등록되어 있지 않습니다${origin ? ` (${origin})` : ''}. `
    + 'Neon 콘솔 → Auth → Configuration → Domains 에 이 주소를 넣어야 합니다.';
}

/**
 * 어댑터가 내는 코드 전부.
 *
 * 순서와 이름은 `@neondatabase/auth` 의 `AuthErrorCode` 를 그대로 따른다.
 * 우리 앱이 쓰지 않는 경로(전화번호·OAuth·SSO·Web3)도 비워 두지 않는다 —
 * 언젠가 서버 설정이 바뀌어 그 코드가 날아와도 담백한 문장이 서게 한다.
 */
const AUTH: Readonly<Record<string, string>> = {
  // ── 세션 ────────────────────────────────────────────────────────────────
  bad_jwt: '로그인이 풀렸습니다. 다시 로그인해 주세요.',
  session_expired: '로그인한 지 오래되어 풀렸습니다. 다시 로그인해 주세요.',
  session_not_found: '로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.',
  invalid_grant: '로그인을 마치지 못했습니다. 다시 시도해 주세요.',

  // ── 자격 ────────────────────────────────────────────────────────────────
  invalid_credentials: '이메일 또는 비밀번호가 일치하지 않습니다.',
  user_not_found: '가입되지 않은 이메일입니다. 가입 탭에서 계정을 만들어 주세요.',
  identity_not_found:
    '이 계정에는 비밀번호가 설정되어 있지 않습니다. 「비밀번호를 잊으셨나요」 로 새로 정해 주세요.',
  user_already_exists: '이미 가입된 이메일입니다. 로그인 탭으로 들어가 주세요.',
  email_exists: '이미 가입된 이메일입니다. 로그인 탭으로 들어가 주세요.',
  phone_exists: '이미 등록된 번호입니다.',
  email_not_confirmed: '메일함에서 인증 링크를 먼저 확인해 주세요.',
  phone_not_confirmed: '번호 확인을 먼저 마쳐 주세요.',

  // ── 입력 ────────────────────────────────────────────────────────────────
  validation_failed: '입력한 값을 다시 확인해 주세요.',
  bad_json: '요청을 보내지 못했습니다. 새로고침한 뒤 다시 시도해 주세요.',
  weak_password: '비밀번호는 8자 이상이어야 합니다.',
  email_address_invalid: '이메일 형식이 올바르지 않습니다.',
  bad_oauth_callback: '로그인을 마치지 못했습니다. 처음부터 다시 시도해 주세요.',

  // ── 쓰지 않는 문 ────────────────────────────────────────────────────────
  // 403 은 거의 언제나 주소 미등록이라, toUserMessage 가 이 자리를 먼저 가로채
  // 클릭 경로가 담긴 문장을 내보낸다. 여기 있는 문장은 그 판단이 바뀔 때를 위한
  // 자리다 — 표에서 빠지면 대조 시험이 걸린다.
  feature_not_supported: '지금은 이 방법으로 들어올 수 없습니다.',
  not_implemented: '지금은 이 방법으로 들어올 수 없습니다.',
  oauth_provider_not_supported: '지금은 이 방법으로 들어올 수 없습니다.',
  phone_provider_disabled: '전화번호로는 들어올 수 없습니다. 이메일을 써 주세요.',
  magic_link_not_supported: '지금은 이 방법으로 들어올 수 없습니다.',
  sso_provider_disabled: '지금은 이 방법으로 들어올 수 없습니다.',
  anonymous_provider_disabled: '지금은 이 방법으로 들어올 수 없습니다.',
  web3_provider_disabled: '지금은 이 방법으로 들어올 수 없습니다.',
  oauth_callback_failed: '로그인을 마치지 못했습니다. 다시 시도해 주세요.',
  signup_disabled: '지금은 가입을 받지 않습니다.',

  // ── 너무 잦음 ───────────────────────────────────────────────────────────
  over_request_rate_limit: '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
  over_email_send_rate_limit: '메일 발송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',
  over_sms_send_rate_limit: '발송이 너무 잦습니다. 잠시 후 다시 시도해 주세요.',

  // ── 서버 ────────────────────────────────────────────────────────────────
  // internal_error 는 FAILED_TO_CREATE_USER · FAILED_TO_CREATE_SESSION ·
  // FAILED_TO_UPDATE_USER 셋뿐이다. 전부 "서버가 저장하지 못했다" 는 뜻이다.
  internal_error: '로그인 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  unexpected_failure: '로그인 서버에 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
  unknown_error: '문제가 생겼습니다. 잠시 후 다시 시도해 주세요.',
};

/** 서버 함수가 raise 한 우리 문장은 이미 한국어이고 마침표로 끝난다. */
const looksKorean = (s: string): boolean => /[가-힣]/.test(s);

const readCode = (e: unknown): string => {
  if (typeof e !== 'object' || e === null) return '';
  const c = (e as { code?: unknown }).code;
  return typeof c === 'string' ? c : '';
};

/**
 * 화면 아래 작게 남길 표식. 코드가 없으면 HTTP 상태라도 남긴다.
 *
 * 사용자가 읽으라고 두는 것이 아니다. 스크린샷 한 장으로 어느 자리에서 막혔는지
 * 알아내기 위한 것이다 — 콘솔에만 남기면 휴대폰에서는 아무도 볼 수 없다.
 *
 * 그래서 **우리가 이미 제대로 옮긴 오류에는 달지 않는다.** 그런 오류는 문장이
 * 이미 어느 자리인지 말하고 있고, 영어 코드가 덧붙으면 화면만 지저분해진다.
 */
export function errorTag(e: unknown): string {
  const code = readCode(e);
  if (code && AUTH[code]) return '';
  if (code) return code;
  if (typeof e === 'object' && e !== null) {
    const s = (e as { status?: unknown }).status;
    if (typeof s === 'number') return `HTTP ${s}`;
  }
  return '';
}

export function toUserMessage(e: unknown, fallback = '문제가 생겼습니다. 잠시 후 다시 시도해 주세요.'): string {
  if (!e) return fallback;

  if (typeof e === 'object') {
    const err = e as { message?: unknown };
    const message = typeof err.message === 'string' ? err.message : '';
    const code = readCode(e);

    // 우리가 직접 쓴 문장이 가장 정확하다. 코드보다 앞선다.
    if (looksKorean(message)) return message;

    if (/invalid origin/i.test(message) || code === 'feature_not_supported') {
      return invalidOriginMessage();
    }

    if (code && AUTH[code]) return AUTH[code]!;

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

  // 여기까지 왔다는 것은 무엇이 잘못됐는지 우리도 모른다는 뜻이다. 화면에는
  // 담백한 문장을 내보내되, 원본은 콘솔에 남긴다 — 다음에 같은 일이 생기면
  // 패키지 안을 뒤지지 않고 바로 읽는다.
  try { console.error('[olrw] 옮기지 못한 오류:', e); } catch { /* 콘솔이 없음 */ }
  return fallback;
}

/** 시험이 표를 통째로 대조한다. 앱에서는 쓰지 않는다. */
export const KNOWN_AUTH_CODES: readonly string[] = Object.keys(AUTH);
