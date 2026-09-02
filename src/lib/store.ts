import type { PaperId } from '../design/colors';
import type { TypeId } from '../design/typewriters';
import type {
  Box, BoxSummary, CloseVolumeInput, CreateBoxInput, Envelope,
  JoinBoxInput, Session, Uuid, Volume, VolumePage,
} from './types';

/**
 * 상태 계층은 이 인터페이스 하나다.
 *
 * 기존 구현은 local/firebase 두 구현이 한 파일에 병렬로 있어 모든 변경을 두 번 해야 했다.
 * (docs/AUDIT.md §01-1) 구현체는 갈아끼우되 인터페이스는 하나만 둔다.
 *
 * 구현: neonStore(운영) · memoryStore(체험 모드·테스트·오프라인 개발)
 *
 * 규칙
 *  - 전보함 생성·참여·제본·탈퇴는 서버 함수로만 간다. 테이블 직접 INSERT 는 telegrams 뿐이다.
 *  - 남의 이번 권 전보는 봉투(Envelope)로만 읽는다. 본문을 직접 꺼내는 경로를 두지 않는다.
 *  - 실시간 구독을 두지 않는다. 화면에 들어올 때 가져오고, 당겨서 새로 고친다. (D6)
 */
export interface BoxStore {
  /* ── 인증 ────────────────────────────────────────────────────────────── */
  getSession(): Session | null;
  /** 세션이 바뀌면 부른다. 구독 해제 함수를 돌려준다. */
  onSessionChange(cb: (s: Session | null) => void): () => void;
  /** 최초 세션 복구가 끝날 때까지 기다린다. 부팅 중 로그인 화면이 깜빡이는 것을 막는다. */
  ready(): Promise<void>;

  /** 표지 사진을 올릴 수 있는 구현인가. false 면 화면이 사진 버튼을 아예 내지 않는다. */
  readonly canUploadCover: boolean;

  /**
   * 가입. 이메일 확인을 요구하도록 설정돼 있으면 세션이 바로 생기지 않는다.
   * 그때 `needsConfirmation` 이 true 로 오고, 화면은 "메일함을 확인해 주세요"를 보여준다.
   * 이걸 알리지 않으면 가입 버튼을 눌러도 아무 일도 안 일어나는 것처럼 보인다.
   */
  signUp(input: { email: string; password: string; displayName: string }):
    Promise<{ needsConfirmation: boolean }>;
  signIn(input: { email: string; password: string }): Promise<void>;
  /**
   * 계정 없이 열어 보기.
   *
   * 브라우저 안 저장소로만 도는 임시 세션을 만든다. 로그아웃하면 그대로 사라진다 —
   * 이 데이터로 남을 초대할 수 없고, 정식 계정으로 옮기지도 않는다.
   * 서버에 닿지 않는다. guestStore 가 이 호출만 memoryStore 로 돌린다 (D14).
   */
  enterAsGuest(): Promise<void>;
  signOut(): Promise<void>;
  /** 모든 전보함에 공통으로 쓰이는 표시 이름. */
  updateDisplayName(name: string): Promise<void>;

  /* ── 전보함 ──────────────────────────────────────────────────────────── */
  listBoxes(): Promise<readonly BoxSummary[]>;
  getBox(boxId: Uuid): Promise<Box>;
  createBox(input: CreateBoxInput): Promise<{ boxId: Uuid; inviteCode: string }>;
  joinBox(input: JoinBoxInput): Promise<{ boxId: Uuid; name: string }>;
  renameBox(boxId: Uuid, name: string): Promise<void>;
  /** 용지색은 공개, 타자기색은 나만 본다. 둘 다 전보함마다 따로다. */
  setMyColors(boxId: Uuid, colors: { paper?: PaperId; type?: TypeId }): Promise<void>;
  leaveBox(boxId: Uuid): Promise<void>;

  /* ── 전보 ────────────────────────────────────────────────────────────── */
  /** vol 을 주지 않으면 이번 권. 봉인된 것은 body 가 null 로 온다. */
  listEnvelopes(boxId: Uuid, vol?: number): Promise<readonly Envelope[]>;
  sendTelegram(boxId: Uuid, body: string): Promise<void>;
  /** 소프트 삭제. 되돌릴 수 없다. */
  deleteTelegram(id: Uuid): Promise<void>;

  /* ── 만남 마감 ───────────────────────────────────────────────────────── */
  /** 이번 권의 봉인을 푼다. 한 번 열면 다시 봉인되지 않는다. (D2) */
  beginReading(boxId: Uuid): Promise<void>;
  closeVolume(boxId: Uuid, input: CloseVolumeInput): Promise<Uuid>;

  /* ── 서가 ────────────────────────────────────────────────────────────── */
  listVolumes(boxId: Uuid): Promise<readonly Volume[]>;
  getVolumePages(volumeId: Uuid): Promise<readonly VolumePage[]>;
  /**
   * 표지 사진을 올리고 경로를 돌려준다. base64 를 행에 넣지 않는다.
   * 권이 만들어지기 전에 올려야 하므로 권 id 를 받지 않는다 — 이름은 구현이 정한다.
   */
  uploadCover(boxId: Uuid, file: Blob): Promise<string>;
  coverUrl(path: string): string;
}
