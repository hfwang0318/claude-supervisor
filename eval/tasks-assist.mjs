// Reuse the engineering fixtures and their hidden evaluators unchanged.
import { TASKS as ENGINEERING } from './tasks-engineering.mjs'
const names = ['entrypoint', 'multi-file', 'api-contract', 'simple-change']
export const TASKS = names.map(name => ENGINEERING.find(task => task.name === name))
