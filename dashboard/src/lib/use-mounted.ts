import { useSyncExternalStore } from 'react'

const subscribe = () => () => {}

/**
 * false during SSR and the hydration render, true on the client after that.
 * Gate browser-only state (localStorage, matchMedia) behind it to avoid
 * hydration mismatches without a setState-in-effect.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false)
}
