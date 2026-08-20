import { ProofSheet } from '../design/ProofSheet';

/**
 * 단계 2 시점의 App. 아직 화면이 없으므로 토큰 확인표를 띄운다.
 * 단계 3(인증 → 온보딩 → 전환 바)에서 실제 셸로 교체된다.
 */
export function App() {
  return <ProofSheet />;
}
