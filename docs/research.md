# 사전 조사

구현을 시작하기 전에 조사한 내용입니다. 기존 라이브러리가 무엇을 제공하는지, Base UI 와 shadcn 의 레이어가 어떻게 동작하는지, 운영체제의 창 스냅이 무엇을 기준으로 판정하는지를 다룹니다.

각 사실에 확인 수준을 적었습니다.

- **문서**: 공식 문서나 소스에서 확인했습니다.
- **검색**: 검색 결과로만 확인했습니다. 공식 문서를 직접 보지는 않았습니다.
- **미확인**: 확인하지 못했습니다.

조사 시점은 2026년 11월입니다.

## 창을 다루는 기존 라이브러리

창 하나를 드래그하고 리사이즈하는 것은 흔합니다. 후보가 갈리는 곳은 **여러 창을 관리하는 층**입니다. 겹침 순서, 포커스, 최소화된 창의 자리, 배치 저장이 여기에 속합니다.

| 층 | 후보 | 직접 만들어야 하는 것 |
|---|---|---|
| 드래그·리사이즈 프리미티브 | react-rnd, react-draggable, re-resizable, interact.js | 창 관리 전부 |
| 창 컴포넌트 | Ark UI `FloatingPanel`, KendoReact `Window`, WinBox, jsPanel4 | 독, 스냅, 배치 저장 |
| 도킹 매니저 | Dockview | 자유 배치가 아니라 도킹 그리드가 주인 구조 |

### 주요 후보

| | Ark UI `FloatingPanel` | KendoReact `Window` | Dockview floating group |
|---|---|---|---|
| 드래그, 리사이즈 | 있음, 8방향 (문서) | 있음 (문서) | 드래그 있음 (문서). 리사이즈는 미확인 |
| 최소화·최대화 | 둘 다 (문서) | `MINIMIZED`, `FULLSCREEN` (문서) | 최대화 불가 (문서) |
| 여러 창의 순서 | 전역 스택. 열리거나 포커스를 받으면 맨 앞 (소스) | Kendo 컴포넌트끼리 자동 z-index (문서). 형제 창을 눌렀을 때는 미확인 | 미확인 |
| 경계 제한 | `getBoundaryEl`, `allowOverflow` (문서) | 미확인 | `floatingGroupBounds` (문서) |
| 배치 저장 | 제어 props 로 직접 (문서) | 제어 props 로 직접 | `toJSON` / `fromJSON` (문서) |
| 프레임워크 | React, Vue, Solid, Svelte | React | React, Vue, Angular, vanilla |
| 라이선스 | MIT (저장소의 LICENSE) | 미확인 | 미확인 |

그 밖에 확인한 것과 못 한 것입니다.

- **Radix, shadcn/ui, MUI** 에서는 창 컴포넌트를 찾지 못했습니다(검색). shadcn 의 `Resizable` 은 분할 패널입니다.
- **WinBox, jsPanel4** 는 vanilla 창 라이브러리입니다(검색). 유지보수 상태는 보지 않았습니다.
- **소규모 React 창 관리자**(react-window-system, react-kitten, Mantine Window 등)는 이름과 소개만 확인했습니다(검색).

### Ark UI `FloatingPanel` 을 그대로 쓰지 않은 이유

상태 머신은 Zag.js 의 `floating-panel` 입니다. 소스를 읽어 확인한 내용입니다.

| 기준 | 확인한 내용 |
|---|---|
| headless | 맞습니다. 스타일 없이 props 와 CSS 변수만 제공합니다 |
| 창의 집합 관리 | 없습니다. `Root` 하나가 상태 머신 하나이고, 목록이나 공유 레이아웃 상태를 가진 부모가 없습니다 |
| 영역 한정 | 옵션으로 일부만 됩니다. 기본은 `strategy: "fixed"` 이고 화면 밖 넘침을 허용합니다. `strategy="absolute"` 와 `getBoundaryEl` 로 창 하나를 영역에 가둘 수 있습니다 |
| 영역별 순서 | 없습니다. 스택이 모듈 전역 저장소라 페이지 전체가 한 스택입니다 |
| 좌표 기준 | 뷰포트입니다. `absolute` 에서도 `position` 은 뷰포트 좌표입니다 |
| 성격 | 대화상자입니다. `role="dialog"`, Trigger 로 열고 닫음, Escape 로 닫힘, 닫히면 포커스 복귀 |

순서 계산은 Zag 가 하고 `--z-index` 변수로 내려 줍니다. 실제 적용은 사용하는 쪽 CSS 가 합니다.

정리하면 Ark/Zag 는 "창 하나"의 동작에 해당하고, 영역 안에서 창의 집합을 관리하는 층은 없습니다. 그래서 참고 구현으로만 삼았습니다.

## Base UI 와 shadcn 의 레이어

창 레이어의 위치를 정하는 근거가 된 사실입니다.

- **Base UI 는 앱 루트에 `isolation: isolate` 를 주라고 안내합니다**(문서). 루트가 별도의 stacking context 가 되어, portal 로 렌더되는 팝업이 페이지 내용 위에 오고 앱 안의 z-index 가 끼어들지 않습니다.
- **Base UI 의 portal 은 `container` prop → 가장 가까운 부모 portal 노드 → `document.body` 순으로 렌더할 곳을 정합니다**(소스). z-index 는 자동으로 주지 않고 사용처 CSS 에 맡깁니다.
- **shadcn 의 Base UI 래퍼는 positioner, backdrop, popup 에 `z-50` 을 줍니다**(소스). 팝업끼리는 DOM 순서로 위아래가 정해집니다.
- **Base UI `Dialog` 의 `modal`**(문서):
  - `true`: 포커스를 가두고, 페이지 스크롤을 잠그고, 바깥의 포인터 조작을 막습니다.
  - `false`: 나머지 문서와의 상호작용을 허용합니다.
  - `'trap-focus'`: 포커스만 가둡니다.
- **`disablePointerDismissal`**(문서): 바깥 누름으로 닫히는 것을 막습니다. 비모달이면 포커스가 밖으로 나갈 때 닫히는 것도 막습니다. 기본값은 `false` 라서, 비모달 Dialog 도 기본으로는 바깥 누름과 포커스 이탈로 닫힙니다.

## 운영체제의 창 스냅

끌어서 스냅의 판정 방식을 정할 때 참고했습니다.

- **Windows (Aero Snap)**: 창의 변이 아니라 마우스 포인터가 화면 가장자리에 닿을 때 스냅됩니다. 위쪽에 닿으면 최대화입니다. 캡션의 반대쪽 끝을 잡으면 스냅 없이 창을 가장자리에 둘 수 있습니다(검색). 찾은 자료는 Windows 7 시절 것입니다.
- **macOS Sequoia**: 커서가 화면 가장자리에 닿으면 미리보기가 뜨고, 놓으면 적용됩니다. 위쪽은 화면 채우기입니다(검색). 원치 않는 최대화에 대한 사용자 불만이 있습니다.
- **KDE (KWin)**: 포인터가 가장자리에서 약 10~15px 안에 들어오면 걸립니다. 이 수치는 버그 리포트에서 나온 것이고 공식 문서가 아닙니다(검색).
- **GNOME**: 결과를 찾지 못했습니다(미확인).

공통점은 **포인터 위치로 판정한다**는 것입니다. 이 프로토타입도 같은 방식을 씁니다.

운영체제와 다른 점이 하나 있습니다. 운영체제에서는 화면 끝이 포인터를 물리적으로 멈춰 주기 때문에 판정이 안정적입니다. 브라우저 뷰포트의 가장자리는 그렇지 않습니다. 그래서 가장자리 바깥의 좌표도 띠 안으로 치고, 한번 잡힌 대상을 더 넓은 띠에서 유지합니다.

## 출처

라이브러리:

- [Ark UI Floating Panel](https://ark-ui.com/docs/components/floating-panel)
- [Zag.js Floating Panel](https://zagjs.com/components/floating-panel)
- [Zag floating-panel 소스](https://github.com/chakra-ui/zag/tree/main/packages/machines/floating-panel/src)
- [KendoReact Window 블로그](https://www.telerik.com/blogs/working-kendoreact-window-component)
- [Dockview floating groups](https://dockview.dev/docs/core/groups/floatingGroups/)
- [WinBox 소개 (CSS Script)](https://www.cssscript.com/drag-resize-max-min-winbox/)
- [jsPanel4 (npm)](https://npmjs.com/package/jspanel4)
- [react-rnd 등 비교 (npm-compare)](https://npm-compare.com/re-resizable,react-draggable,react-grid-layout,react-resizable,react-rnd,react-sizeme)
- [react-window-system (npm)](https://www.npmjs.com/package/react-window-system)
- [react-kitten](https://github.com/rohanrhu/react-kitten)
- [Mantine Window](https://gfazioli.github.io/mantine-window)
- [shadcn Resizable](https://www.shadcn.io/ui/radix/resizable)

Base UI 와 shadcn:

- [Base UI Quick start](https://github.com/mui/base-ui/blob/master/docs/src/app/(docs)/react/overview/quick-start/page.mdx)
- [Base UI Dialog](https://github.com/mui/base-ui/blob/master/docs/src/app/(docs)/react/components/dialog/page.mdx)
- [Base UI FloatingPortal 소스](https://github.com/mui/base-ui/blob/master/packages/react/src/utils/popups/portal/FloatingPortal.tsx)
- [shadcn Base UI 래퍼: dialog](https://github.com/shadcn-ui/ui/blob/main/apps/v4/registry/bases/base/ui/dialog.tsx)

운영체제의 스냅:

- [How do I put a window at the edge of the screen without triggering the automatic positioning behavior? (The Old New Thing)](https://devblogs.microsoft.com/oldnewthing/20090729-00/?p=17313)
- [Designing Aero Snap (Microsoft)](https://learn.microsoft.com/en-us/archive/blogs/e7/designing-aero-snap)
- [macOS Sequoia: How Window Tiling and Snapping Currently Works (MacRumors)](https://www.macrumors.com/2024/06/12/macos-sequoia-window-tiling/)
- [Sequoia maximizes window when dragged near the top of the screen (Apple Community)](https://origin-discussions2-us-dr-prz.apple.com/thread/255762463)
- [KDE Bug 509936: Configurable distance from screen edge for triggering quick tiling](https://bugs.kde.org/show_bug.cgi?id=509936)
- [KWin Screen Edges 문서](https://docs.kde.org/stable_kf6/en/kwin/kcontrol/kwinscreenedges/)

Claude Code:

- [Claude Code worktrees](https://code.claude.com/docs/en/worktrees)
