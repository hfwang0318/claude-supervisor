import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const validateExperiment = config => {
  if (config?.schemaVersion !== 1) throw Error('experiment schemaVersion must be 1')
  for (const key of ['hostVersion', 'pluginSha', 'environmentImage', 'toolPermissions', 'priceSnapshotId', 'split', 'stopRule']) {
    if (typeof config[key] !== 'string' || !config[key].trim()) throw Error(`experiment requires ${key}`)
  }
  for (const role of ['worker', 'side', ...(config.reference === undefined ? [] : ['reference'])]) {
    const model = role === 'side' ? config.side ?? config.worker : config[role]
    for (const key of ['id', 'version', 'reasoning']) if (typeof model?.[key] !== 'string' || !model[key].trim()) throw Error(`${role} requires ${key}`)
    if (!/^[A-Za-z0-9_.:@/-]+$/.test(model.id)) throw Error(`${role} model ID has invalid characters`)
  }
  if (config.externalContextDisabled !== true || config.otherPluginsDisabled !== true) throw Error('disable external context and other plugins for frozen experiments')
  if (!config.prices || typeof config.prices !== 'object') throw Error('price snapshot required; unknown prices remain unknown')
  if (config.executionMode !== undefined && !['off', 'shadow', 'enabled'].includes(config.executionMode)) throw Error('invalid experimental execution mode')
  if (config.assistanceMode !== undefined && !['existing', 'facts', 'probe', 'recovery'].includes(config.assistanceMode)) throw Error('invalid assistance mode')
  if (config.taskTimeoutMs !== undefined && (!Number.isSafeInteger(config.taskTimeoutMs) || config.taskTimeoutMs < 1)) throw Error('invalid task timeout')
  return config.side ? config : { ...config, side: config.worker }
}

export const corpusHash = () => {
  const hash = createHash('sha256')
  for (const name of ['tasks-engineering.mjs', 'tasks-assist.mjs', 'metrics.mjs']) hash.update(readFileSync(fileURLToPath(new URL(name, import.meta.url))))
  return hash.digest('hex')
}
