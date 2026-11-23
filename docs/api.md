# API 레퍼런스

`@window-manager/react` 가 내보내는 것의 전체 목록입니다. 쓰는 방법은 [사용 가이드](./guide.md)에 있습니다.

파트 이름과 상태 props 의 관례는 **임시**입니다. 대상 디자인 시스템의 기존 컴포넌트에 맞춰 바뀔 수 있습니다. 특히 `Window` 라는 이름은 import 한 모듈에서 전역 `Window` 를 가립니다.

## WindowManager.Root

창 목록, 겹침 순서, 활성 창을 갖습니다. DOM 은 그리지 않습니다.

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `defaultLayout` | `WindowLayout` | 없음 | 처음에 적용할 배치. 저장해 둔 값을 넣으면 복원됩니다 |
| `onLayoutChange` | `(layout: WindowLayout) => void` | 없음 | 배치가 바뀌면 불립니다. 이동·리사이즈는 끝났을 때 한 번 |
| `minVisibleWidth` | `number` | `64` | 창이 영역 밖으로 나가도 남겨 둘 타이틀바의 가로 폭 |
| `moveConstraint` | `'reachable' \| 'contain'` | `'reachable'` | 창이 기준 영역을 얼마나 벗어날 수 있는지 |
| `snap` | `boolean \| Partial<SnapOptions>` | `false` | 끌어서 스냅 |

`defaultLayout`, `minVisibleWidth`, `moveConstraint`, `snap` 은 관리자를 만들 때만 읽습니다. 나중에 바꿔도 반영되지 않습니다.

## WindowManager.Viewport

뷰포트 전체를 기준 영역으로 삼는 창 레이어입니다. `div` 의 props 를 받습니다.

- 앱 루트(`isolation: isolate`) 안에, 앱 내용 뒤에 둡니다.
- `style` 의 `top`·`right`·`bottom`·`left` 로 기준 영역을 줄일 수 있습니다. `inset` 축약형은 쓰지 않습니다.
- `position`, `pointer-events`, `isolation` 은 덮어쓸 수 없습니다.

## WindowManager.Area

부모 요소를 기준 영역으로 삼는 창 레이어입니다. `div` 의 props 를 받습니다.

- 부모 요소는 positioned 여야 하고, 스크롤 컨테이너이면 안 됩니다.
- 영역 밖은 `overflow: clip` 으로 잘라냅니다. `style` 로 덮어쓸 수 있습니다.
- 영역마다 `WindowManager.Root` 를 따로 둡니다.

## WindowManager.SnapPreview

끌고 있는 창을 지금 놓으면 차지할 자리를 보여 줍니다. `div` 의 props 를 받습니다.

- 스냅 대상이 있을 때만 그려집니다.
- 끌고 있는 창 바로 아래에 놓입니다.
- 위치와 크기는 라이브러리가 넣고, 모양은 사용처가 입힙니다.

## Window.Root

창 하나입니다. `id` 를 뺀 `div` 의 props 를 받습니다.

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `id` | `string` | 필수 | 관리자 안에서 창을 구분하는 키. 배치 저장에도 쓰입니다 |
| `defaultRect` | `DefaultRect` | 필수 | 저장된 자리가 없을 때 쓰는 크기와 위치. 위치를 빼면 계단식으로 놓입니다 |
| `minSize` | `Size` | `200 × 120` | 최소 크기 |
| `maxSize` | `Size` | 없음 | 최대 크기. 최대화와 스냅에는 적용되지 않습니다 |
| `dragInset` | `{ left?: number; right?: number }` | `0` | 타이틀바 양 끝에서 버튼이 차지하는 폭 |
| `open` | `boolean` | 없음 | 제어형 열림 상태 |
| `defaultOpen` | `boolean` | `true` | 비제어형일 때의 처음 상태 |
| `onOpenChange` | `(open: boolean) => void` | 없음 | `Window.Close` 를 누르면 `false` 로 불립니다 |

- `role="dialog"`, `aria-labelledby`, `tabIndex={-1}` 이 붙습니다.
- 바깥을 누르거나 Escape 를 눌러도 닫히지 않습니다.
- `style` 의 `position`, `left`, `top`, `width`, `height`, `zIndex`, `pointerEvents` 는 덮어쓸 수 없습니다.

## Window.Titlebar

창을 옮기는 손잡이입니다. `div` 의 props 를 받습니다.

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `doubleClickAction` | `'maximize' \| 'none'` | `'maximize'` | 더블클릭했을 때의 동작 |

- 안의 버튼, 링크, 입력 요소, `role="button"`, `role="menuitem"`, `contenteditable`, `data-window-no-drag` 요소에서는 이동과 더블클릭이 동작하지 않습니다.
- `onPointerDown` 을 넘기면 라이브러리보다 먼저 실행됩니다. 거기서 `preventDefault()` 하면 이동을 시작하지 않습니다.

## Window.Title

창의 이름입니다. `div` 의 props 를 받습니다. 창의 접근성 이름으로 쓰이므로 `id` 는 덮어쓸 수 없습니다.

## Window.Content

창의 내용입니다. `div` 의 props 를 받습니다. 동작은 없고 `data-window-content` 만 붙습니다.

## Window.Minimize, Window.Maximize, Window.Close

`button` 의 props 를 받습니다. `type="button"` 입니다.

- `Minimize`: 창을 최소화합니다.
- `Maximize`: 최대화와 일반 상태를 오갑니다. `aria-pressed` 와 `data-maximized` 가 상태를 나타냅니다.
- `Close`: `onOpenChange(false)` 를 부릅니다.

`onClick` 을 넘기면 라이브러리보다 먼저 실행됩니다. 거기서 `preventDefault()` 하면 동작하지 않습니다.

접근성 이름(`aria-label`)은 사용처가 넣습니다.

## Window.ResizeHandle

변 또는 모서리의 리사이즈 손잡이입니다. `div` 의 props 를 받습니다.

| prop | 타입 | 설명 |
|---|---|---|
| `edge` | `ResizeEdge` | `'n'`, `'e'`, `'s'`, `'w'`, `'ne'`, `'nw'`, `'se'`, `'sw'` |

- 8개를 모두 넣으려면 `RESIZE_EDGES` 를 순회합니다.
- 굵기는 `--window-resize-handle-size`(기본 8px)입니다.
- 최대화된 창에서는 숨겨집니다.
- 스냅된 창을 리사이즈하면 그 자리에서 일반 상태가 됩니다.

## Hooks

### useWindowManager()

배치를 읽고 쓰는 명령형 API 입니다. `WindowManager.Root` 아래에서 씁니다. 값이 바뀌어도 다시 렌더링되지 않습니다.

| 메서드 | 설명 |
|---|---|
| `getLayout()` | 현재 배치 |
| `setLayout(layout)` | 배치를 통째로 적용합니다. 순서에는 지금 열려 있는 창만 남고, 새 배치에 없는 열린 창은 자리를 유지합니다 |
| `activate(id)` | 맨 앞으로 가져오고 활성화합니다. 최소화된 창은 원래 배치로 되돌립니다 |
| `minimize(id)` | 최소화 |
| `maximize(id)` | 최대화 |
| `toggleMaximize(id)` | 최대화면 일반 상태로, 아니면 최대화로 |
| `snap(id, zone)` | `'left'` 또는 `'right'` 절반에 스냅 |
| `restore(id)` | 최소화된 창은 되돌리며 활성화하고, 최대화·스냅된 창은 일반 상태로 돌립니다 |

### useWindowList()

열려 있는 창의 목록을 구독합니다. `WindowListItem[]` 을 돌려줍니다.

- 창을 연 순서대로입니다. 활성화해도 순서가 바뀌지 않습니다.
- 배치나 활성 창이 바뀔 때만 다시 렌더링됩니다. 창을 옮기는 동안에는 다시 렌더링되지 않습니다.

### useWindow()

창 안에서 그 창의 상태와 명령을 얻습니다. `Window.Root` 아래에서 씁니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | `string` | 창의 `id` |
| `placement` | `PlacementName` | 현재 배치 |
| `active` | `boolean` | 활성 창인지 |
| `minimize()`, `maximize()`, `toggleMaximize()` | | 배치 전환 |
| `restore()` | | 최대화·스냅된 창을 일반 상태로 |
| `close()` | | `onOpenChange(false)` 를 부릅니다 |

## 값

| 이름 | 설명 |
|---|---|
| `RESIZE_EDGES` | `ResizeEdge` 8개의 배열 |

## 타입

```ts
interface Point { x: number; y: number }
interface Size { width: number; height: number }
interface Rect extends Point, Size {}

type ResizeEdge = 'n' | 'e' | 's' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

/** 위치를 빼면 계단식으로 놓인다 */
interface DefaultRect extends Size { x?: number; y?: number }

type SnapZone = 'left' | 'right'
type SnapTarget = SnapZone | 'maximize'

type WindowPlacement = 'normal' | 'minimized' | 'maximized' | { snap: SnapZone }
type VisiblePlacement = Exclude<WindowPlacement, 'minimized'>
type PlacementName = 'normal' | 'minimized' | 'maximized' | 'snap-left' | 'snap-right'

interface WindowState {
  /** 일반 상태일 때의 자리. 기준 영역의 왼쪽 위가 원점 */
  rect: Rect
  placement: WindowPlacement
  /** 최소화되기 전의 배치 */
  restorePlacement?: VisiblePlacement
}

interface WindowLayout {
  /** 닫힌 창의 자리도 남는다 */
  windows: Record<string, WindowState>
  /** 열려 있는 창의 겹침 순서. 끝이 맨 앞 */
  order: string[]
}

interface WindowListItem {
  id: string
  placement: PlacementName
  active: boolean
}

interface SnapOptions {
  /** 기본 8 */
  threshold: number
  /** 기본 24 */
  release: number
  /** 기본 true */
  top: boolean
}
```

`WindowLayout` 은 JSON 으로 직렬화할 수 있습니다.

그 밖에 `WindowManagerRootProps`, `WindowManagerApi`, `WindowRootProps`, `WindowTitlebarProps`, `WindowResizeHandleProps`, `WindowApi` 가 타입으로 export 됩니다.

## 내보내지 않는 것

`createWindowManagerStore`, `createPointerSession`, 좌표 계산 함수는 패키지 밖으로 내보내지 않습니다. React 없이 쓸 수 있는 구조이지만 공개 API 로 정리하지 않았습니다.
