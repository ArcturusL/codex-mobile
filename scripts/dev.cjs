const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      CODEXUI_SANDBOX_MODE: process.env.CODEXUI_SANDBOX_MODE || 'danger-full-access',
      CODEXUI_APPROVAL_POLICY: process.env.CODEXUI_APPROVAL_POLICY || 'never',
    },
    ...options,
  })
  if (result.error) {
    throw result.error
  }
  process.exit(result.status ?? 1)
}

const passthroughArgs = process.argv.slice(2)
const viteBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
const vueTscBinPath = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'vue-tsc.cmd' : 'vue-tsc')

if (!existsSync(viteBinPath) || !existsSync(vueTscBinPath)) {
  const install = spawnSync('pnpm', ['install'], { stdio: 'inherit', env: process.env })
  if (install.error) {
    throw install.error
  }
  if (install.status !== 0) {
    process.exit(install.status ?? 1)
  }
}

run(viteBinPath, passthroughArgs)
