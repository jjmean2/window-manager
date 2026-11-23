# Window Manager

브라우저 안에서 데스크톱처럼 창을 옮기고 크기를 바꾸는 **headless 창 관리자**의 프로토타입입니다. React 컴포넌트이고, 동작만 제공하며 창의 모양은 사용처가 입힙니다.

Base UI 와 shadcn 을 바탕으로 한 디자인 시스템에 넣을 컴포넌트를 미리 만들어 보는 것이 목적입니다. 배포하는 패키지가 아닙니다.

## 할 수 있는 것

- 타이틀바를 잡고 창을 옮기고, 네 변과 네 모서리로 크기를 바꿉니다.
- 창을 누르면 맨 앞으로 오고 활성 창이 됩니다.
- 창이 영역 밖으로 나가도 타이틀바의 잡을 수 있는 부분은 남습니다.
- 최소화, 최대화, 좌우 절반 스냅을 지원합니다. 끌어서 가장자리에 놓는 스냅은 옵션입니다.
- 뷰포트 전체 또는 레이아웃의 한 구역을 창이 사는 영역으로 삼습니다.
- 창의 자리, 겹침 순서, 배치를 저장하고 복원합니다.
- 다이얼로그·팝오버·툴팁이 항상 창 위에 옵니다.

아직 안 되는 것과 한계는 [로드맵](./docs/roadmap.md)에 있습니다. 대표적으로 키보드로 창을 옮기거나 크기를 바꿀 수 없습니다.

## 구성

| 경로 | 내용 |
|---|---|
| `packages/window-manager` | `@window-manager/react`. headless 프리미티브. 의존성은 React 뿐입니다 |
| `apps/playground` | 데모 앱. Base UI 의 메뉴·팝오버·모달과 함께 씁니다 |
| `docs` | 문서 |

## 실행

Node.js 와 pnpm 이 필요합니다. pnpm 버전은 `package.json` 의 `packageManager` 에 적혀 있습니다.

```sh
pnpm install
pnpm dev        # 데모 앱
pnpm test       # 단위 테스트
pnpm typecheck  # 타입 검사
pnpm build      # 데모 앱 빌드
```

## 맛보기

```tsx
import { RESIZE_EDGES, Window, WindowManager } from '@window-manager/react'

export function App() {
  return (
    <WindowManager.Root>
      <main>앱 내용</main>

      <WindowManager.Viewport />

      <Window.Root id="inspector" className="window" defaultRect={{ width: 360, height: 260 }}>
        <Window.Titlebar>
          <Window.Title>Inspector</Window.Title>
          <Window.Close aria-label="닫기">✕</Window.Close>
        </Window.Titlebar>
        <Window.Content>내용</Window.Content>
        {RESIZE_EDGES.map((edge) => (
          <Window.ResizeHandle key={edge} edge={edge} />
        ))}
      </Window.Root>
    </WindowManager.Root>
  )
}
```

스타일은 들어 있지 않습니다. 모양을 입히는 방법은 [사용 가이드](./docs/guide.md)에 있습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [사용 가이드](./docs/guide.md) | 창을 띄우고, 모양을 입히고, 배치를 저장하는 방법 |
| [API 레퍼런스](./docs/api.md) | 파트, props, hook, 타입 |
| [동작 원리](./docs/architecture.md) | 상태 모델, 좌표, 레이어 순서, 제약 계산, 제스처의 수명 |
| [결정 기록](./docs/decisions.md) | 무엇을 정했고 왜 그렇게 정했는지 |
| [사전 조사](./docs/research.md) | 기존 라이브러리와 관례 |
| [로드맵](./docs/roadmap.md) | 구현한 것, 남은 일, 알려진 한계 |
| [조사 기록: 스냅 드롭 문제](./docs/investigations/snap-drop.md) | 놓았는데 스냅이 안 되던 문제의 경위 |

## 상태

프로토타입입니다. 파트 이름과 props 는 바뀔 수 있습니다. 단위 테스트는 좌표 계산, 배치 모델, 상태 저장소, 제스처 수명을 다루고, React 파트는 브라우저에서 손으로 확인했습니다.
