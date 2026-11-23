import { Dialog } from '@base-ui/react/dialog'
import { Menu } from '@base-ui/react/menu'
import { Popover } from '@base-ui/react/popover'
import {
  RESIZE_EDGES,
  useWindow,
  useWindowList,
  useWindowManager,
  Window,
  WindowManager,
  type DefaultRect,
  type WindowLayout,
} from '@window-manager/react'
import { useState, type ReactNode } from 'react'

const STORAGE_KEY = 'window-manager-playground:layout'
const AREA_STORAGE_KEY = 'window-manager-playground:area-layout'
const DOCK_HEIGHT = 44

const WINDOWS = [
  { id: 'inspector', title: 'Inspector', rect: { x: 340, y: 110, width: 360, height: 260 } },
  { id: 'notes', title: 'Notes', rect: { x: 520, y: 220, width: 380, height: 280 } },
  { id: 'settings', title: 'Settings', rect: { x: 760, y: 150, width: 340, height: 240 } },
] as const

type WindowId = (typeof WINDOWS)[number]['id']

const DEFAULT_LAYOUT: WindowLayout = {
  windows: Object.fromEntries(
    WINDOWS.map((w) => [w.id, { rect: { ...w.rect }, placement: 'normal' as const }]),
  ),
  order: WINDOWS.map((w) => w.id),
}

function loadLayout(key: string = STORAGE_KEY): WindowLayout | undefined {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as WindowLayout) : undefined
  } catch {
    return undefined
  }
}

export function App() {
  const [open, setOpen] = useState<Record<WindowId, boolean>>({
    inspector: true,
    notes: true,
    settings: true,
  })
  const [saved, setSaved] = useState<{ count: number; layout: WindowLayout | null }>({
    count: 0,
    layout: null,
  })
  const setWindowOpen = (id: WindowId) => (next: boolean) =>
    setOpen((current) => ({ ...current, [id]: next }))

  return (
    <WindowManager.Root
      defaultLayout={loadLayout()}
      snap
      onLayoutChange={(layout) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(layout))
        setSaved((current) => ({ count: current.count + 1, layout }))
      }}
    >
      <div className="shell">
        <aside className="sidebar">
          <strong>SidePanel</strong>
          <p>PanelLayout 의 옆 패널 자리. 창은 이 위를 지나다닐 수 있습니다.</p>
        </aside>
        <main className="main">
          <h1>Window Manager Playground</h1>
          <div className="toolbar">
            {WINDOWS.map((w) => (
              <button
                key={w.id}
                type="button"
                className="button"
                aria-pressed={open[w.id]}
                onClick={() => setWindowOpen(w.id)(!open[w.id])}
              >
                {w.title} {open[w.id] ? '닫기' : '열기'}
              </button>
            ))}
            <ResetButton />
            <Popover.Root>
              <Popover.Trigger className="button">앱 영역의 팝오버</Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className="positioner" sideOffset={8}>
                  <Popover.Popup className="popup">
                    <Popover.Title className="popup-title">앱 영역에서 연 팝오버</Popover.Title>
                    <p>창 레이어보다 위에 떠야 합니다.</p>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </div>
          <dl className="status" data-testid="status">
            <dt>onLayoutChange 호출</dt>
            <dd data-testid="change-count">{saved.count}</dd>
            <dt>순서 (끝이 맨 앞)</dt>
            <dd data-testid="order">{saved.layout?.order.join(' → ') ?? '-'}</dd>
          </dl>
          <p className="filler">
            창 밖의 이 영역을 누르면 활성 창이 풀립니다. 타이틀바의 버튼이 아닌 곳을 잡고 창을
            옮기고, 네 변과 네 모서리를 잡아 크기를 바꿔 보세요. 창을 화면 밖으로 끌어내도
            타이틀바 일부는 남습니다. 끌다가 포인터가 왼쪽·오른쪽 가장자리에 닿으면 절반으로,
            위쪽에 닿으면 최대화로 스냅됩니다. 타이틀바를 더블클릭해도 최대화됩니다.
          </p>
          <ScopedArea />
        </main>
      </div>

      {/* 기준 영역에서 독의 자리를 뺀다. 최대화와 스냅은 독 위까지만 채운다. */}
      <WindowManager.Viewport className="window-layer" style={{ bottom: DOCK_HEIGHT }} />
      <WindowManager.SnapPreview className="snap-preview" />
      <Dock />

      <AppWindow
        id="inspector"
        title="Inspector"
        open={open.inspector}
        onOpenChange={setWindowOpen('inspector')}
        controlsWidth={132}
        actions={
          <Menu.Root>
            <Menu.Trigger className="icon-button" aria-label="창 메뉴">
              ⋯
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="positioner" sideOffset={6} align="end">
                <Menu.Popup className="popup menu">
                  <Menu.Item className="menu-item">항목 하나</Menu.Item>
                  <Menu.Item className="menu-item">항목 둘</Menu.Item>
                  <Menu.Item className="menu-item">항목 셋</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        }
      >
        <p>타이틀바의 ⋯ 버튼이 메뉴를 엽니다. 메뉴 항목을 눌러도 창은 움직이지 않아야 합니다.</p>
      </AppWindow>

      <AppWindow id="notes" title="Notes" open={open.notes} onOpenChange={setWindowOpen('notes')}>
        <Popover.Root>
          <Popover.Trigger className="button">창 안의 팝오버</Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner className="positioner" sideOffset={8}>
              <Popover.Popup className="popup">
                <Popover.Title className="popup-title">창 안에서 연 팝오버</Popover.Title>
                <p>이 창이 뒤에 있어도 다른 창 위에 떠야 합니다.</p>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
        <textarea className="textarea" placeholder="여기에 포커스를 주면 창이 활성화됩니다." />
      </AppWindow>

      <AppWindow
        id="settings"
        title="Settings"
        open={open.settings}
        onOpenChange={setWindowOpen('settings')}
      >
        <Dialog.Root>
          <Dialog.Trigger className="button">모달 다이얼로그 열기</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop className="backdrop" />
            <Dialog.Popup className="dialog">
              <Dialog.Title className="popup-title">창에서 연 모달</Dialog.Title>
              <Dialog.Description>
                열려 있는 동안 모든 창을 덮고, 창을 조작할 수 없어야 합니다.
              </Dialog.Description>
              <Dialog.Close className="button">닫기</Dialog.Close>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </AppWindow>
    </WindowManager.Root>
  )
}

function ResetButton() {
  const manager = useWindowManager()
  return (
    <button type="button" className="button" onClick={() => manager.setLayout(DEFAULT_LAYOUT)}>
      배치 초기화
    </button>
  )
}

/** 창 상태에 따라 라벨과 모양이 바뀌는 버튼. `useWindow` 로 상태를 읽는다. */
function MaximizeButton() {
  const { placement } = useWindow()
  const maximized = placement === 'maximized'
  return (
    <Window.Maximize className="icon-button" aria-label={maximized ? '이전 크기로' : '최대화'}>
      {maximized ? '❐' : '□'}
    </Window.Maximize>
  )
}

/** 열려 있는 창의 목록. 최소화된 창을 되돌리는 곳이다. 창 레이어 위에 놓인다. */
function Dock() {
  const windows = useWindowList()
  const manager = useWindowManager()
  return (
    <nav className="dock" aria-label="열린 창" style={{ height: DOCK_HEIGHT }}>
      {windows.map((item) => (
        <button
          key={item.id}
          type="button"
          className="dock-item"
          data-active={item.active ? '' : undefined}
          data-minimized={item.placement === 'minimized' ? '' : undefined}
          onClick={() => manager.activate(item.id)}
        >
          {WINDOWS.find((w) => w.id === item.id)?.title ?? item.id}
        </button>
      ))}
    </nav>
  )
}

/**
 * 레이아웃의 한 구역만 기준 영역으로 쓰는 창 관리자. 뷰포트 쪽과는 별개의 Root 라서
 * 겹침 순서와 활성 창, 저장되는 배치가 따로다.
 */
function ScopedArea() {
  const [contain, setContain] = useState(false)
  return (
    <section className="area-section">
      <h2>영역 한정</h2>
      <label className="check">
        <input
          type="checkbox"
          checked={contain}
          onChange={(event) => setContain(event.target.checked)}
        />
        창 전체를 영역 안에 두기
      </label>
      {/* Area 의 부모는 positioned 여야 하고, 스크롤 컨테이너이면 안 된다. */}
      <div className="area-box" data-testid="area-box">
        <WindowManager.Root
          // 이동 제약은 관리자를 만들 때 정해진다. 바꾸려면 관리자를 새로 만든다.
          key={contain ? 'contain' : 'reachable'}
          defaultLayout={loadLayout(AREA_STORAGE_KEY)}
          moveConstraint={contain ? 'contain' : 'reachable'}
          snap
          onLayoutChange={(layout) =>
            localStorage.setItem(AREA_STORAGE_KEY, JSON.stringify(layout))
          }
        >
          <WindowManager.Area />
          <WindowManager.SnapPreview className="snap-preview" />
          <AppWindow
            id="area-a"
            title="Area A"
            defaultRect={{ x: 24, y: 24, width: 260, height: 180 }}
          >
            <Popover.Root>
              <Popover.Trigger className="button">영역 창의 팝오버</Popover.Trigger>
              <Popover.Portal>
                <Popover.Positioner className="positioner" sideOffset={8}>
                  <Popover.Popup className="popup">
                    <Popover.Title className="popup-title">영역 창에서 연 팝오버</Popover.Title>
                    <p>영역에 잘리지 않고 뷰포트 창 위에 떠야 합니다.</p>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
            <input className="input" placeholder="포커스 확인용" />
          </AppWindow>
          <AppWindow
            id="area-b"
            title="Area B"
            defaultRect={{ x: 200, y: 120, width: 260, height: 180 }}
          >
            <p>테두리 밖으로 나간 부분은 잘립니다.</p>
          </AppWindow>
        </WindowManager.Root>
      </div>
    </section>
  )
}

interface AppWindowProps {
  id: string
  title: string
  /** 생략하면 WINDOWS 에 적힌 자리를 쓴다 */
  defaultRect?: DefaultRect
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** 타이틀바 오른쪽 버튼들이 차지하는 폭 */
  controlsWidth?: number
  actions?: ReactNode
  children?: ReactNode
}

/** headless 파트에 이 앱의 모양을 입힌 창. 디자인 시스템이라면 이 자리가 기본 스타일 래퍼다. */
function AppWindow(props: AppWindowProps) {
  const { id, title, open, onOpenChange, controlsWidth = 100, actions, children } = props
  const defaultRect: DefaultRect = props.defaultRect ??
    WINDOWS.find((w) => w.id === id)?.rect ?? { width: 300, height: 200 }
  return (
    <Window.Root
      id={id}
      className="window"
      defaultRect={defaultRect}
      open={open}
      onOpenChange={onOpenChange}
      dragInset={{ right: controlsWidth }}
    >
      <Window.Titlebar className="window-titlebar">
        <Window.Title className="window-title">{title}</Window.Title>
        {actions}
        <Window.Minimize className="icon-button" aria-label="최소화">
          –
        </Window.Minimize>
        <MaximizeButton />
        <Window.Close className="icon-button" aria-label="닫기">
          ✕
        </Window.Close>
      </Window.Titlebar>
      <Window.Content className="window-content">{children}</Window.Content>
      {RESIZE_EDGES.map((edge) => (
        <Window.ResizeHandle key={edge} edge={edge} />
      ))}
    </Window.Root>
  )
}
