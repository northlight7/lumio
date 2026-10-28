'use client'

import { useEffect } from 'react'

export function MobileViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    const update = () => {
      if (viewport && viewport.scale !== 1) return
      const height = Math.min(window.innerHeight, viewport?.height ?? window.innerHeight)
      document.documentElement.style.setProperty('--app-height', `${height}px`)
      const editing = document.activeElement?.matches('input:not([type="checkbox"]),textarea,select')
      document.documentElement.dataset.keyboardOpen = String(!!editing && window.innerHeight - height > 100)
    }
    update()
    window.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    viewport?.addEventListener('resize', update)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      viewport?.removeEventListener('resize', update)
      document.documentElement.style.removeProperty('--app-height')
      delete document.documentElement.dataset.keyboardOpen
    }
  }, [])
  return null
}
