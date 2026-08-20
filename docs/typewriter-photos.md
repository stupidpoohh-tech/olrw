# 타자기 사진 8장 규격

D9 결정: 색깔별 사진을 새로 제작한다. CSS 필터로 물들이지 않는다.
배경 근거는 `docs/AUDIT.md` §04-5.

---

## 파일

```
src/assets/typewriter/green.webp
src/assets/typewriter/teal.webp
src/assets/typewriter/blue.webp
src/assets/typewriter/plum.webp
src/assets/typewriter/rose.webp
src/assets/typewriter/terra.webp
src/assets/typewriter/ochre.webp
src/assets/typewriter/stone.webp
```

파일명은 `src/design/colors.ts` 의 `TYPE_COLORS[].id` 와 정확히 같아야 한다.
여덟 장이 다 들어오기 전까지는 기존 `public/assets/typewriter.png` 로 폴백한다.

## 목표 색

각 사진의 **본체 평균색**이 아래 `tint` 에 가까워야 한다. ΔE 5 이내면 충분하다.

| id | 이름 | tint |
|---|---|---|
| `green` | 세이지 | `#8a9d8a` |
| `teal` | 틸 | `#6f9296` |
| `blue` | 블루그레이 | `#7286a0` |
| `plum` | 플럼 | `#8b7793` |
| `rose` | 더스티로즈 | `#a8807f` |
| `terra` | 테라코타 | `#ab7d63` |
| `ochre` | 오커 | `#a9925f` |
| `stone` | 스톤 | `#8d8a83` |

**채도를 올리지 말 것.** 흰 종이 위에 은은히 놓인 정도가 의도된 톤이다. (§4-1·§4-2)

## 반드시 지킬 것

1. **여덟 장의 프레이밍이 픽셀 단위로 같아야 한다.**
   타전실은 사진 위에 키 하이라이트 오버레이를 **좌표로 고정해서** 얹는다
   (`reference/transmit.jsx` 의 `KeysOverlay`). 사진마다 각도·거리·크롭이 다르면
   글자를 칠 때 엉뚱한 자리가 반짝인다. 같은 촬영본을 색만 바꿔 내보내는 것이 가장 안전하다.
2. **정사각 1200 × 1200.** 현재 에셋과 같다.
3. **배경 투명(권장) 또는 순백 `#ffffff`.**
   투명이면 용지·그림자와 자연스럽게 겹친다. 현재 에셋은 흰 배경이 불투명하게 구워져 있어
   본체만 골라낼 수 없었다 — 그 문제를 반복하지 않는다.
4. **본체 색만 다르게.** 키캡·은색 부품·그림자는 여덟 장이 동일해야 한다.
   이 색은 "지금 어느 전보함에 있는가"만 알려주는 신호다. 다른 것이 같이 변하면 신호가 흐려진다.
5. **WebP, 장당 200KB 이하.** 현재 PNG 는 836KB 다.

## 검사

여덟 장을 넣고 나서:

```bash
pnpm build && pnpm preview &
pnpm tint:check
```

- 각 사진의 본체 평균색과 목표 `tint` 의 거리
- 여덟 색이 서로 **ΔE 8 이상** 벌어지는지

둘 다 통과해야 §4-2 가 제 역할을 한다. 지금 단일 사진 + 필터 방식은 색 간 거리가 **ΔE 1.0** 이라
여덟 전보함이 전부 같은 회색으로 보인다.
