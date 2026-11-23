import {
  WindowClose,
  WindowContent,
  WindowMaximize,
  WindowMinimize,
  WindowResizeHandle,
  WindowRoot,
  WindowTitle,
  WindowTitlebar,
} from './Window.tsx'
import {
  WindowManagerRoot,
  WindowManagerSnapPreview,
  WindowManagerViewport,
} from './WindowManager.tsx'

export const WindowManager = {
  Root: WindowManagerRoot,
  Viewport: WindowManagerViewport,
  SnapPreview: WindowManagerSnapPreview,
}

export const Window = {
  Root: WindowRoot,
  Titlebar: WindowTitlebar,
  Title: WindowTitle,
  Content: WindowContent,
  Minimize: WindowMinimize,
  Maximize: WindowMaximize,
  Close: WindowClose,
  ResizeHandle: WindowResizeHandle,
}

export { useWindow } from './Window.tsx'
export { useWindowList, useWindowManager } from './WindowManager.tsx'
export { RESIZE_EDGES } from './geometry.ts'

export type { WindowManagerApi, WindowManagerRootProps } from './WindowManager.tsx'
export type {
  WindowApi,
  WindowResizeHandleProps,
  WindowRootProps,
  WindowTitlebarProps,
} from './Window.tsx'
export type { Point, Rect, ResizeEdge, Size } from './geometry.ts'
export type {
  PlacementName,
  SnapOptions,
  SnapTarget,
  SnapZone,
  VisiblePlacement,
  WindowPlacement,
} from './placement.ts'
export type { DefaultRect, WindowLayout, WindowListItem, WindowState } from './store.ts'
