# 사용 가이드

`@window-manager/react` 로 창을 띄우는 방법입니다. props 와 타입의 전체 목록은 [API 레퍼런스](./api.md)에, 안에서 어떻게 동작하는지는 [동작 원리](./architecture.md)에 있습니다.

> 이 패키지는 프로토타입입니다. `private` 이고 npm 에 배포되지 않습니다. 빌드 단계 없이 소스를 그대로 export 하므로, 이 저장소의 워크스페이스 안에서 `workspace:*` 로 참조해 씁니다.

## 구성 요소

| 묶음 | 파트 | 하는 일 |
|---|---|---|
| `WindowManager` | `Root` | 창 목록·순서·활성 창을 갖습니다. DOM 은 그리지 않습니다 |
| | `Viewport` | 뷰포트 전체를 기준 영역으로 삼는 창 레이어 |
| | `Area` | 부모 요소를 기준 영역으로 삼는 창 레이어 |
| | `SnapPreview` | 끌어서 스냅할 때 놓일 자리를 보여 줍니다 |
| `Window` | `Root` | 창 하나 |
| | `Titlebar` | 창을 옮기는 손잡이 |
| | `Title` | 창의 이름. 접근성 이름으로 쓰입니다 |
| | `Content` | 창의 내용 |
| | `Minimize`, `Maximize`, `Close` | 버튼 |
| | `ResizeHandle` | 변 또는 모서리의 리사이즈 손잡이 |

스타일은 하나도 들어 있지 않습니다. 모양은 `className` 과 data 속성으로 입힙니다.

## 시작하기

### 1. 앱 루트를 격리합니다

Base UI 가 안내하는 설정입니다. `body` 로 portal 되는 팝업이 앱 내용과 창 위에 오게 합니다.

```css
#root {
  isolation: isolate;
}
```

### 2. 관리자와 레이어를 놓습니다

`Viewport` 는 앱 내용 **뒤에**, 앱 루트 **안에** 둡니다.

```tsx
import { RESIZE_EDGES, Window, WindowManager } from '@window-manager/react'

export function App() {
  return (
    <WindowManager.Root>
      <main>앱 내용</main>

      <WindowManager.Viewport className="window-layer" />

      <Window.Root id="inspector" className="window" defaultRect={{ width: 360, height: 260 }}>
        <Window.Titlebar className="window-titlebar">
          <Window.Title className="window-title">Inspector</Window.Title>
          <Window.Close aria-label="닫기">✕</Window.Close>
        </Window.Titlebar>
        <Window.Content className="window-content">내용</Window.Content>
        {RESIZE_EDGES.map((edge) => (
          <Window.ResizeHandle key={edge} edge={edge} />
        ))}
      </Window.Root>
    </WindowManager.Root>
  )
}
```

`Window.Root` 는 `WindowManager.Root` 아래 어디에 선언해도 됩니다. React 트리에서는 선언한 자리에 있어 컨텍스트를 그대로 받고, DOM 에서는 레이어로 옮겨집니다.

### 3. 모양을 입힙니다

최소한 이것만 있으면 창처럼 보입니다.

```css
/* 앱 내용에 z-index 를 쓰는 요소가 있으면 레이어에도 값을 줍니다. 팝업(z-50)보다는 낮게. */
.window-layer {
  z-index: 10;
}

.window {
  display: flex;
  flex-direction: column;
  border: 1px solid #d4d4d8;
  border-radius: 10px;
  background: white;
  outline: none;
}

.window[data-active] {
  border-color: #2563eb;
}

.window-titlebar {
  display: flex;
  flex: none;
  align-items: center;
  height: 36px;
  padding: 0 4px 0 12px;
}

.window-title {
  flex: 1;
}

.window-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
```

주의할 점이 둘 있습니다.

- **창 요소에 `overflow: hidden` 을 주지 마세요.** 리사이즈 손잡이가 테두리에 반쯤 걸쳐 있어서 절반이 잘립니다. 스크롤은 `Window.Content` 에 줍니다.
- **위치와 크기는 건드리지 마세요.** `position`, `left`, `top`, `width`, `height`, `z-index` 는 라이브러리가 인라인 스타일로 넣습니다.

## 창을 열고 닫기

창은 기본으로 열려 있습니다. 여닫으려면 `open` 과 `onOpenChange` 로 제어합니다. `Window.Close` 를 누르면 `onOpenChange(false)` 가 불립니다.

```tsx
const [open, setOpen] = useState(true)

<Window.Root id="notes" open={open} onOpenChange={setOpen} defaultRect={{ width: 380, height: 280 }}>
  …
</Window.Root>
```

닫았다가 다시 열면 같은 자리에 맨 앞으로 열립니다.

## 타이틀바

타이틀바에서 버튼이 아닌 곳을 잡고 끌면 창이 움직입니다.

- 버튼, 링크, 입력 요소, `role="button"`, `role="menuitem"` 에서는 이동이 시작되지 않습니다. 그 밖의 요소를 제외하려면 `data-window-no-drag` 를 붙입니다.
- 더블클릭하면 최대화와 일반 상태를 오갑니다. 끄려면 `doubleClickAction="none"` 을 줍니다.
- 최대화되거나 스냅된 창을 끌면 일반 크기로 풀립니다.

타이틀바에 버튼이 있으면 **그 폭을 `dragInset` 으로 알려 주세요.** 창이 화면 밖으로 나갈 때 "다시 잡을 수 있는 부분"을 계산하는 데 씁니다. 알려 주지 않으면 버튼만 보이고 잡을 곳이 없는 위치까지 나갈 수 있습니다.

```tsx
<Window.Root id="inspector" dragInset={{ right: 100 }} defaultRect={{ width: 360, height: 260 }}>
  <Window.Titlebar>
    <Window.Title>Inspector</Window.Title>
    <Window.Minimize aria-label="최소화">–</Window.Minimize>
    <Window.Maximize aria-label="최대화">□</Window.Maximize>
    <Window.Close aria-label="닫기">✕</Window.Close>
  </Window.Titlebar>
  …
</Window.Root>
```

## 최소화와 최대화

`Window.Minimize` 와 `Window.Maximize` 를 타이틀바에 넣습니다. 버튼의 라벨을 상태에 따라 바꾸려면 창 안에서 `useWindow()` 로 상태를 읽습니다.

```tsx
function MaximizeButton() {
  const { placement } = useWindow()
  const maximized = placement === 'maximized'
  return (
    <Window.Maximize aria-label={maximized ? '이전 크기로' : '최대화'}>
      {maximized ? '❐' : '□'}
    </Window.Maximize>
  )
}
```

최소화된 창은 숨겨질 뿐 내용은 마운트된 채 남습니다. 입력하던 값이 유지됩니다.

### 독 만들기

최소화된 창을 다시 여는 곳은 라이브러리에 없습니다. `useWindowList()` 로 직접 만듭니다. 목록은 창을 연 순서대로이고, 활성화해도 순서가 바뀌지 않습니다.

```tsx
function Dock() {
  const windows = useWindowList()
  const manager = useWindowManager()
  return (
    <nav aria-label="열린 창">
      {windows.map((item) => (
        <button
          key={item.id}
          type="button"
          data-active={item.active ? '' : undefined}
          data-minimized={item.placement === 'minimized' ? '' : undefined}
          onClick={() => manager.activate(item.id)}
        >
          {item.id}
        </button>
      ))}
    </nav>
  )
}
```

`activate` 는 창을 맨 앞으로 가져오고, 최소화된 창이면 원래 배치로 되돌립니다.

### 독 자리 비우기

최대화된 창은 기준 영역을 채웁니다. 독이나 상단 바를 덮지 않게 하려면 `Viewport` 의 `style` 로 영역을 줄입니다.

```tsx
<WindowManager.Viewport style={{ bottom: 44 }} />
```

`top`, `right`, `bottom`, `left` 를 쓰세요. `inset` 축약형은 쓰면 안 됩니다. 독은 창 레이어보다 높은 z-index 로 따로 그립니다.

## 끌어서 스냅

기본은 꺼져 있습니다. 켜려면 `snap` 을 주고, 미리보기를 놓습니다.

```tsx
<WindowManager.Root snap>
  …
  <WindowManager.Viewport />
  <WindowManager.SnapPreview className="snap-preview" />
</WindowManager.Root>
```

- 끌다가 **포인터가** 왼쪽·오른쪽 가장자리에 닿으면 절반, 위쪽에 닿으면 최대화 대상이 됩니다. 창의 변이 아니라 포인터가 기준입니다.
- 놓을 때 적용됩니다. 미리보기가 보이면 놓았을 때 반드시 적용됩니다.
- 미리보기가 뜬 뒤 취소하려면 가장자리에서 32px 넘게 되돌아갑니다.

옵션으로 조절할 수 있습니다.

```tsx
<WindowManager.Root snap={{ threshold: 12, release: 24, top: false }}>
```

| 옵션 | 기본 | 뜻 |
|---|---|---|
| `threshold` | 8 | 포인터가 가장자리에서 이 거리 안에 들어오면 대상이 됩니다 |
| `release` | 24 | 잡힌 대상을 놓아주기까지의 여유 거리 |
| `top` | `true` | 위쪽 가장자리를 최대화 대상으로 쓸지 |

**알아 둘 것.** 스냅을 켜면 포인터가 좌우 가장자리에 닿은 채로는 창을 그쪽 화면 밖에 걸쳐 둘 수 없습니다. 걸쳐 두려면 타이틀바의 반대쪽 끝을 잡아야 합니다.

## 배치 저장과 복원

`onLayoutChange` 로 받아서 저장하고, 다음에 `defaultLayout` 으로 넣습니다. 창의 자리, 겹침 순서, 최대화·스냅·최소화 상태가 복원됩니다.

```tsx
function loadLayout(): WindowLayout | undefined {
  const raw = localStorage.getItem('layout')
  return raw ? (JSON.parse(raw) as WindowLayout) : undefined
}

<WindowManager.Root
  defaultLayout={loadLayout()}
  onLayoutChange={(layout) => localStorage.setItem('layout', JSON.stringify(layout))}
>
```

- `onLayoutChange` 는 이동·리사이즈 **도중이 아니라 끝났을 때** 한 번 불립니다.
- 처음 mount 될 때의 창 등록은 알리지 않습니다.
- 도중에 배치를 통째로 바꾸려면 `useWindowManager().setLayout(layout)` 을 씁니다. "배치 초기화" 같은 기능에 씁니다.
- 제어형 `layout` prop 은 없습니다.

## 영역 한정

창을 레이아웃의 한 구역 안에만 두려면 `Area` 를 씁니다. 구역마다 `WindowManager.Root` 를 따로 둡니다.

```tsx
<div style={{ position: 'relative', height: 360 }}>
  <WindowManager.Root moveConstraint="contain">
    <WindowManager.Area />
    <Window.Root id="area-a" defaultRect={{ x: 24, y: 24, width: 260, height: 180 }}>
      …
    </Window.Root>
  </WindowManager.Root>
</div>
```

지켜야 할 조건이 둘 있습니다.

- **부모 요소는 positioned 여야 합니다**(`position: relative` 등). 아니면 `Area` 가 더 먼 조상을 채우는데 오류가 나지 않습니다.
- **부모 요소가 스크롤 컨테이너이면 안 됩니다.** 레이어가 내용과 함께 스크롤됩니다.

동작은 이렇습니다.

- 영역 밖으로 나간 부분은 잘립니다. 창에서 연 팝업은 `body` 로 portal 되므로 잘리지 않습니다.
- 최대화와 스냅은 그 영역만 채웁니다.
- 겹침 순서와 활성 창은 영역별로 독립입니다. 한 영역의 창을 누르면 다른 영역의 활성 창이 풀립니다.
- 스냅을 켜면 포인터가 영역 밖으로 나가기만 해도 스냅 대상이 됩니다. 뷰포트에서는 생기지 않는 차이입니다.

### 이동 제약

| `moveConstraint` | 동작 |
|---|---|
| `'reachable'` (기본) | 영역 밖으로 나갈 수 있지만 타이틀바의 잡을 수 있는 부분은 남습니다 |
| `'contain'` | 창 전체가 영역 안에 머뭅니다. 영역보다 큰 창은 왼쪽 위에 맞춥니다 |

관리자를 만들 때 정해지고 도중에 바꿀 수 없습니다. 바꾸려면 `key` 를 바꿔 관리자를 새로 만듭니다.

## 스타일 훅

### data 속성

| 요소 | 속성 | 붙는 때 |
|---|---|---|
| 창 | `data-window` | 항상 |
| | `data-window-id` | 항상. 값은 창의 `id` |
| | `data-placement` | 항상. `normal`, `minimized`, `maximized`, `snap-left`, `snap-right` |
| | `data-active` | 활성 창일 때 |
| | `data-dragging` | 옮기는 동안 |
| | `data-resizing` | 리사이즈하는 동안 |
| 타이틀바 | `data-window-titlebar` | 항상 |
| 제목 | `data-window-title` | 항상 |
| 내용 | `data-window-content` | 항상 |
| 버튼 | `data-window-minimize`, `data-window-maximize`, `data-window-close` | 항상 |
| 최대화 버튼 | `data-maximized` | 최대화 상태일 때 |
| 리사이즈 손잡이 | `data-window-resize-handle` | 항상. 값은 `n`, `e`, `s`, `w`, `ne`, `nw`, `se`, `sw` |
| 레이어 | `data-window-layer` | 항상. 값은 `viewport` 또는 `area` |
| 스냅 미리보기 | `data-window-snap-preview` | 항상. 값은 `left`, `right`, `maximize` |

```css
.window[data-placement='maximized'] {
  border-radius: 0;
}
```

### CSS 변수

| 변수 | 기본 | 뜻 |
|---|---|---|
| `--window-resize-handle-size` | `8px` | 리사이즈 손잡이의 굵기. 모서리는 이 값의 2배 |

## Base UI 팝업과 함께 쓰기

창 안에서 Base UI 의 메뉴, 팝오버, 다이얼로그를 그대로 쓸 수 있습니다.

- 팝업은 `body` 로 portal 되어 모든 창 위에 뜹니다. `Area` 에서도 잘리지 않습니다.
- 창에서 연 팝업을 눌러도 그 창이 활성화됩니다.
- 타이틀바 버튼에서 연 메뉴 항목을 눌러도 창이 움직이지 않습니다.
- 모달 다이얼로그는 모든 창을 덮고, 열린 동안 창을 조작할 수 없습니다.

제약이 하나 있습니다. **모달 안에서 연 창은 그 모달이 닫힐 때까지 쓸 수 없습니다.** 창 레이어가 모달보다 아래에 있기 때문입니다.

## 아직 안 되는 것

- 키보드로 창을 옮기거나 크기를 바꿀 수 없습니다.
- 창을 열어도 포커스가 창으로 가지 않습니다.
- `dragInset` 을 자동으로 재지 않습니다.
- Base UI 의 `render` prop 관례를 지원하지 않습니다.
- 터치·펜 입력은 확인하지 않았습니다.

전체 목록은 [로드맵](./roadmap.md)에 있습니다.
