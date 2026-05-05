import * as migration_20260425_205143 from './20260425_205143'
import * as migration_20260426_commands_runs from './20260426_commands_runs'
import * as migration_20260427_fix_attempts from './20260427_fix_attempts'
import * as migration_20260505_project_memory from './20260505_project_memory'

export const migrations = [
  {
    up: migration_20260425_205143.up,
    down: migration_20260425_205143.down,
    name: '20260425_205143',
  },
  {
    up: migration_20260426_commands_runs.up,
    down: migration_20260426_commands_runs.down,
    name: '20260426_commands_runs',
  },
  {
    up: migration_20260427_fix_attempts.up,
    down: migration_20260427_fix_attempts.down,
    name: '20260427_fix_attempts',
  },
  {
    up: migration_20260505_project_memory.up,
    down: migration_20260505_project_memory.down,
    name: '20260505_project_memory',
  },
]
