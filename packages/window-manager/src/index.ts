import {
  WindowClose,
  WindowContent,
  WindowResizeHandle,
  WindowRoot,
  WindowTitle,
  WindowTitlebar,
} from './Window.tsx'
import { WindowManagerRoot, WindowManagerViewport } from './WindowManager.tsx'

export const WindowManager = {
  Root: WindowManagerRoot,
  Viewport: WindowManagerViewport,
}

export const Window = {
  Root: WindowRoot,
  Titlebar: WindowTitlebar,
  Title: WindowTitle,
  Content: WindowContent,
  Close: WindowClose,
  ResizeHandle: WindowResizeHandle,
}

export { useWindowManager } from './WindowManager.tsx'
export { RESIZE_EDGES } from './geometry.ts'

export type { WindowManagerApi, WindowManagerRootProps } from './WindowManager.tsx'
export type { WindowResizeHandleProps, WindowRootProps } from './Window.tsx'
export type { Point, Rect, ResizeEdge, Size } from './geometry.ts'
export type {
  PlacementName,
  SnapTarget,
  SnapZone,
  VisiblePlacement,
  WindowPlacement,
} from './placement.ts'
export type { DefaultRect, WindowLayout, WindowListItem, WindowState } from './store.ts'
