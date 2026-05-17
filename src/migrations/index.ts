import * as migration_20250929_111647 from './20250929_111647'
import * as migration_20260425_205143 from './20260425_205143'
import * as migration_20260426_commands_runs from './20260426_commands_runs'
import * as migration_20260427_fix_attempts from './20260427_fix_attempts'
import * as migration_20260505_project_memory from './20260505_project_memory'
import * as migration_20260505_lessons_learned from './20260505_lessons_learned'
import * as migration_20260515_m1 from './20260515_m1'
import * as migration_20260516_m2 from './20260516_m2'
import * as migration_20260517_m3 from './20260517_m3'
import * as migration_20260518_m4 from './20260518_m4'
import * as migration_20260517_m5 from './20260517_m5'
import * as migration_20260519_m6 from './20260519_m6'

export const migrations = [
  {
    up: migration_20250929_111647.up,
    down: migration_20250929_111647.down,
    name: '20250929_111647',
  },
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
  {
    up: migration_20260505_lessons_learned.up,
    down: migration_20260505_lessons_learned.down,
    name: '20260505_lessons_learned',
  },
  {
    up: migration_20260515_m1.up,
    down: migration_20260515_m1.down,
    name: '20260515_m1',
  },
  {
    up: migration_20260516_m2.up,
    down: migration_20260516_m2.down,
    name: '20260516_m2',
  },
  {
    up: migration_20260517_m3.up,
    down: migration_20260517_m3.down,
    name: '20260517_m3',
  },
  {
    up: migration_20260518_m4.up,
    down: migration_20260518_m4.down,
    name: '20260518_m4',
  },
  {
    up: migration_20260517_m5.up,
    down: migration_20260517_m5.down,
    name: '20260517_m5',
  },
  {
    up: migration_20260519_m6.up,
    down: migration_20260519_m6.down,
    name: '20260519_m6',
  },
]
