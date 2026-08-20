import type { CoverId, CoverKind, PaperId, TypeId } from '../design/colors';

export type Uuid = string;
/** ISO 8601 문자열. Date 객체를 도메인 경계 밖으로 내보내지 않는다. */
export type Timestamp = string;

export interface Session {
  readonly userId: Uuid;
  readonly email: string;
  readonly displayName: string;
}

export interface Member {
  readonly userId: Uuid;
  readonly displayName: string;
  /** 공개. 이 사람이 보낸 전보의 색이다. */
  readonly paper: PaperId;
  readonly joinedAt: Timestamp;
  readonly isOwner: boolean;
  readonly isMe: boolean;
  // 타자기색은 개인 설정이라 여기 담지 않는다. 내 것은 Box.myType 으로 온다.
}

export interface BoxSummary {
  readonly id: Uuid;
  readonly name: string;
  readonly inviteCode: string;
  readonly currentVol: number;
  readonly memberCount: number;
  readonly myType: TypeId;
  readonly sealed: boolean;
}

export interface Box extends BoxSummary {
  readonly ownerId: Uuid;
  readonly myPaper: PaperId;
  /** 이번 권의 봉인이 풀린 시각. null 이면 아직 봉인 중이다. (D1) */
  readonly readingStartedAt: Timestamp | null;
  readonly members: readonly Member[];
}

/** 분량. 봉인된 전보도 이건 알려준다. */
export type LengthBucket = 'short' | 'medium' | 'long';

/**
 * 수신함이 읽는 단위. 봉인된 전보는 body 가 null 이고 분량만 온다. (D1)
 * 내가 쓴 전보는 언제나 unsealed 다.
 */
export interface Envelope {
  readonly id: Uuid;
  readonly boxId: Uuid;
  readonly authorId: Uuid;
  readonly vol: number;
  readonly createdAt: Timestamp;
  readonly unsealed: boolean;
  readonly body: string | null;
  readonly lengthBucket: LengthBucket;
}

export interface Volume {
  readonly id: Uuid;
  readonly boxId: Uuid;
  readonly vol: number;
  readonly title: string;
  readonly coverKind: CoverKind;
  readonly coverValue: string;
  readonly periodStart: Timestamp;
  readonly periodEnd: Timestamp;
  readonly pageCount: number;
  /** 함께 읽기를 건너뛰지 않았는가. (D2) */
  readonly readTogether: boolean;
  readonly closedAt: Timestamp;
}

/** 제본 시점 스냅샷. 이후 이름·색이 바뀌어도 변하지 않는다. */
export interface VolumePage {
  readonly ord: number;
  readonly authorId: Uuid | null;
  readonly authorName: string;
  readonly paperColor: PaperId;
  readonly body: string;
  readonly sentAt: Timestamp;
}

export interface CreateBoxInput {
  readonly name: string;
  readonly paper: PaperId;
  readonly type: TypeId;
  /** 기본값 봉인. (D1) */
  readonly sealed: boolean;
}

export interface JoinBoxInput {
  readonly code: string;
  readonly paper: PaperId;
  readonly type: TypeId;
}

export interface CloseVolumeInput {
  readonly title: string;
  readonly coverKind: CoverKind;
  readonly coverValue: CoverId | string;
  readonly readTogether: boolean;
}
