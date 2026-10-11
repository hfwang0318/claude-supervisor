import type { Binding, Snapshot } from './contracts'
import type { Host } from './ports'

export const captureSnapshot = async (host: Host, binding: Binding, deadlineMs: number): Promise<Snapshot | null> => {
  if (!binding.sessionId || !binding.generationId || !binding.turnId || await host.now() >= deadlineMs) return null
  try {
    const snapshot = await host.capture(binding, deadlineMs)
    if (!snapshot || snapshot.isolation !== 'boxed-copy' || !snapshot.sourceManifestHash || snapshot.binding.workspaceRevision !== snapshot.sourceManifestHash || snapshot.binding.snapshotId !== snapshot.id) {
      if (snapshot) await host.cleanup(snapshot)
      return null
    }
    return snapshot
  } catch { return null }
}
