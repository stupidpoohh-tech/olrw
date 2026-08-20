import { lazy, Suspense } from 'react';
import { StoreProvider } from '../lib/storeContext';
import { Shell } from './Shell';

// 토큰 확인표는 ?proof 로만 연다. 본 번들에 싣지 않는다.
const ProofSheet = lazy(() =>
  import('../design/ProofSheet').then((m) => ({ default: m.ProofSheet })));

export function App() {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('proof')) {
    return <Suspense fallback={null}><ProofSheet /></Suspense>;
  }
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
