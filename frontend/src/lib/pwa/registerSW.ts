// ─────────────────────────────────────────────────────────────────────────────
// registerSW.ts
//
// Thin wrapper around vite-plugin-pwa's virtual `registerSW` module so the
// rest of the app doesn't import the virtual module directly. Two reasons:
//   1. TypeScript types — vite-plugin-pwa ships its types via a virtual
//      reference (`/// <reference types="vite-plugin-pwa/client" />`),
//      which is annoying to wire across the codebase.
//   2. Update UX — when a new build is ready we want a single-source toast
//      ("Reload to update") that the rest of the UI can subscribe to.
// ─────────────────────────────────────────────────────────────────────────────

/// <reference types="vite-plugin-pwa/client" />

type UpdateListener = () => void;
const updateListeners: Set<UpdateListener> = new Set();

let updateAvailable = false;
let applyUpdate: (() => Promise<void>) | null = null;

export function registerServiceWorker(): void {
  // The virtual module isn't resolvable in tests (no Vite plugin transform)
  // — fall back to a no-op so vitest doesn't crash. Real loads happen via
  // the dynamic import below.
  if (typeof window === 'undefined') return;

  // Dynamic import keeps SW wiring out of the initial render path; the user
  // never sees a delay because of it.
  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh() {
          updateAvailable = true;
          applyUpdate = async () => {
            await updateSW(true);
          };
          updateListeners.forEach((l) => l());
        },
        onOfflineReady() {
          // Offline shell hot — log only; no visible affordance yet.
          // eslint-disable-next-line no-console
          console.info('[pwa] offline ready');
        },
      });
    })
    .catch((err) => {
      // Vite-plugin-pwa virtual module isn't always available (e.g. in
      // vitest). Log at info level — this isn't an error in those contexts.
      // eslint-disable-next-line no-console
      console.info('[pwa] register skipped:', err?.message ?? err);
    });
}

export function isUpdateAvailable(): boolean {
  return updateAvailable;
}

export function applyPendingUpdate(): Promise<void> | void {
  return applyUpdate?.();
}

export function subscribeToUpdates(listener: UpdateListener): () => void {
  updateListeners.add(listener);
  return () => {
    updateListeners.delete(listener);
  };
}
