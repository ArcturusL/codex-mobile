# AGENTS.md

## 本 fork 的项目基调（2026-09-11）

本节记录项目所有者在本轮对话中确定的长期方向；与后文继承自上游的环境假设或工作流程冲突时，以本节为准。后续任务默认延续这些约定，直到项目所有者明确调整。

### 维护目标

- 维护仓库为 `https://github.com/ArcturusL/codex-mobile`。项目所有者反馈原作者约四个月未更新，现有功能对最新 Codex 的支持存在缺口，项目自身也有 bug；本 fork 用于持续适配和修复。
- 优先保证日常使用可靠，再逐步补齐 Codex 新特性；采用范围明确、便于验证和回退的小步变更。
- 适配“最新 Codex”时，应核实当时的官方文档、实际安装版本和接口行为，不把本文件中的日期或旧版本假设当成当前事实。记录验证过的 WebUI 与 Codex CLI / app-server 版本组合。

### 双环境运行目标

- 部署主机是当前这台腾讯云 Ubuntu 服务器，已有正在使用的 Codex 服务。后续开发与部署须保留现有服务的可用性。
- **稳定环境（stable）**：固定入口为 `https://cd.liyuvu.xyz`，承载日常使用，只运行已验证、版本明确且能够回退的发布。
- **最新环境（latest）**：独立运行最新 Codex WebUI，用于验证 Codex 新版本兼容性、本 fork 的新功能及 bug 修复；允许快速迭代，其失败不能影响稳定环境。
- 两个环境须能同时运行，并可分别启动、停止、升级和回退。最新环境使用独立端口和访问入口；具体域名、端口及服务映射在实施时根据现状确定并记录，本轮未指定。
- 代码/发布目录、构建产物、服务进程、运行时依赖与配置、日志应按环境隔离。尤其要固定各环境使用的 Codex 可执行文件及版本，避免一次全局升级同时改变两个环境。
- 默认分别使用独立的 Codex 数据目录（通过各自服务配置指定 `CODEX_HOME`）和可写状态，避免新版迁移、清理或并发写入损坏稳定环境的会话、配置、认证状态及数据库。若需要共享数据或项目工作目录，先明确共享范围、兼容性、写入责任和备份恢复方式。

### 发布与回滚

- 发布顺序为：在独立开发分支/工作树修改 → 在最新环境验证 → 固定候选版本及产物 → 按部署任务范围升级稳定环境。代码合并本身不等于稳定环境发布。
- 稳定发布须记录 Git commit/tag、锁定的依赖、WebUI 与 Codex 版本、启动方式及非敏感配置说明；使用可追溯的发布目录或镜像标识。不得依赖浮动的 `latest` 标签或每次启动重新解析包版本来恢复稳定环境。
- 每次升级稳定环境前，至少保留当前可用版本及其完整运行所需产物、配置恢复依据，并对会被变更的持久化数据制作一致性备份。凭据与备份存放于仓库之外，限制访问，不写入 Git 或任务输出。
- 每次稳定发布应提供可执行的发布和回滚步骤，标明操作对象、检查项、预计中断和成功判据。回退应能恢复到上一个已知可用版本，不依赖故障时重新下载依赖或重新构建旧版本。
- 数据回滚与代码回滚须分别评估。涉及状态格式、数据库或配置迁移时，先验证旧版能否读取新版写入的数据；若不能，须有匹配版本的一致性备份、恢复步骤，并说明恢复备份可能丢失的升级后数据。不得直接覆盖正在写入的生产数据。
- 发布检查覆盖本次改动及登录、会话加载、发送/流式回复、刷新恢复、移动端访问等受影响的核心路径，并检查反向代理和实时连接。首次建立发布机制或修改回滚机制时，在隔离环境验证回滚步骤；失败时停止晋级并按既定方案恢复。

### 本机现状与操作边界

- 本 fork 的开发仓库位于 `/home/ubuntu/codex-mobile/data/codex-mobile`。此前使用 `git clone --depth 1` 拉取，属于浅克隆；需要更早历史、标签或合并依据时，先补齐相关 Git 历史，不假设旧提交已在本地。
- 2026-09-11 只读检查发现 `codex-mobile.service` 与 `codex-web.service` 均处于运行状态，其工作目录分别为 `/workspace` 与 `/opt/codex-web-host/current/app`。这些是检查时的快照；执行操作前须重新核实实际进程、运行版本、端口、数据目录和域名路由，不仅凭服务名认定 stable/latest 的映射。
- `/home/ubuntu/codex-mobile` 下还存在 Compose 文件及备份，不能据此假设现役服务由 Docker 管理。以实际进程、服务管理器及反向代理配置为准。
- 不直接在正在提供稳定服务的发布目录进行开发、构建或覆盖安装。启动测试服务前先核实端口归属；上游文档中的 `4173`、`5173`、tmux、Oracle、OrbStack 等仅为历史环境约定，不能替代本机检查。
- 本项目用于通过域名远程访问，不适用“仅本地用户访问、可忽略远程调用风险”的上游假设。部署和相关修改须考虑实际反向代理、HTTPS、鉴权及 WebSocket/流式连接行为；不得将上游无密码测试命令直接用于远程服务。
- 本轮授权的是记录项目基调，不包含切换域名、重启现役服务或实施双环境部署。后续明确请求开发或部署时，按该任务授权完成必要工作；上游的提交、推送、PR、包发布和远程测试流程不自动构成对外发布或生产变更的授权。

## Git Workflow

- Before any merge, rebase, sync, or continuation after interruption, re-check live state:
  - feature worktree: `git status --short`, `git branch --show-current`
  - main worktree: `git status --short`
  - in-progress state: `git status`, `.git/MERGE_HEAD`, `.git/rebase-merge`, `.git/rebase-apply`
  - remote/PR state: `git fetch origin`; when a PR may exist, `gh pr view --json number,state,mergeStateStatus,isDraft,headRefName,baseRefName,url`
  - branch delta: `git diff --stat main...HEAD` and `git log --oneline main..HEAD`
- Keep both worktrees clean before merge/rebase. Checkpoint local changes in main with `git add -A && git commit -m "temp-before-merge-<branch>"`; skip only if main is clean.
- Prefer GitHub PR update/rebase/merge when a PR or GitHub merge path exists. Use local `main` merge only when no PR/GitHub path exists or the user explicitly asks for a local merge.
- Standard path: commit task, create/switch feature branch, rebase on `main`, then use the chosen PR/local merge path.
- Never use automatic conflict-bias strategies blindly (`-X theirs`, `-X ours`, `git checkout --theirs .`, `git checkout --ours .`). Inspect conflicts intentionally.
- Avoid rebasing long-lived mixed-history branches if it pulls broad unrelated conflicts. Abort and use a fresh branch from `main` plus task-relevant cherry-picks.
- If `package.json`, `tests.md`, or files under `tests/` conflict during merge/rebase, start from the local/checkpoint version, then explicitly compare incoming changes and reconcile required updates before continuing.
- Before local `main` merge, diff-compare all branch changes against `main`.
- After merge/sync, verify the target really contains the commit with `git branch --contains <commit>`, `git log --oneline origin/main -10`, or a file-level diff against `origin/main`.

## Commits

- Commit after each discrete task or sub-task.
- Do not batch unrelated tasks into one commit.
- Use a specific commit message describing the change.

## PR Review Bots

- Treat Qodo/CodeRabbit comments as advisory, not authoritative.
- For PR update + review requests: push branch, update PR summary/verification notes when changed, then post a plain PR comment containing exactly `/review`.
- Do not use draft reviews or batch review APIs to trigger Qodo.
- Before applying a bot fix, inspect the current code path and classify the comment as real, stale/resolved, rejected, or docs-only.
- This fork is accessed remotely through a domain and reverse proxy. Evaluate Qodo/CodeRabbit security comments against the actual deployment and authentication boundaries; do not reject a concrete remote-access issue based on the upstream local-only assumption. Keep fixes scoped to verified behavior and risk.
- Prefer a focused regression test for accepted bugs. After fixing, run the narrow test plus relevant build/typecheck, push, and re-check PR comments/status.
- Completion reports must distinguish confirmed fixes from stale or rejected bot comments.

## Performance

- Every feature/behavior change needs a performance audit before completion.
- Ground the audit in measurements, profiler output, traces, request counts, bundle/build output, or concrete code-path analysis. If live measurement is infeasible, say what was not measured.
- Documentation-only changes do not require a performance audit.
- For startup, thread loading, realtime rendering, routing, API, filesystem, git, or module-loading changes, explicitly check duplicate requests, blocking work, unbounded fanout, large payloads, and cache invalidation risk.
- Prefer profiler helpers for browser/startup/thread work: `pnpm run profile:browser` and `pnpm run profile:thread`; reports land under `output/playwright/`.
- Profiler server setup:
  1. Ensure `node_modules` exists. In side worktrees, reuse a compatible shared dependency tree instead of installing from scratch.
  2. Before reusing `127.0.0.1:4173`, inspect the listener with `lsof -nP -iTCP:4173 -sTCP:LISTEN` and `lsof -a -p <PID> -d cwd`.
  3. If `4173` belongs to another worktree, old main checkout, or stale Vite state, stop only that `4173` process and restart from the current cwd.
  4. Never stop the persistent tmux server on `5173`.
  5. Start/current server command: `pnpm run dev --host 127.0.0.1 --port 4173`.
  6. Reject profiler output from an error page, stale worktree, indefinite `Loading threads...`, or zero API traffic caused by failed app boot. Fix readiness and rerun.
- General profile command: `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_WAIT_MS=7000 pnpm run profile:browser`.
- Thread route profile command: `PROFILE_BASE_URL=http://127.0.0.1:4173 PROFILE_ROUTE='#/thread/<thread-id>' PROFILE_WAIT_MS=7000 pnpm run profile:browser`; use `pnpm run profile:thread` when appropriate.
- Inspect `duplicateCounts`, `warnings`, `totalApiKB`, `topApiSummary`, and `slowestApiRows`; open the matching trace zip with `npx playwright show-trace` when deeper request/render timing is needed.

## Tests And Verification

- Test changes before reporting completion when feasible.
- Update the relevant manual test doc under `tests/<domain>/` after feature work. Keep `tests.md` as the root index only. Add/adjust only the relevant section and preserve existing cases.
- Manual test entries must include feature/change name, prerequisites/setup, exact actions, expected results, and rollback/cleanup notes when applicable.
- For new/changed UI, verify light and dark themes. If dark screenshots show light surfaces on a dark page, fix CSS/theme wiring.
- Run Browser Use or Playwright only when the user explicitly asks for browser automation testing, or when a repo-specific rule below requires it.
- CJS smoke test is required for package/runtime/module-loading changes: build first, run `node -e "require(...)"` or the closest public CJS entry, confirm expected exports, and report the exact command/result.

## Browser And Playwright

- Prefer Browser Use for navigation, clicking, typing, screenshots, snapshots, and visible local UI checks.
- Use Playwright CLI directly when verification needs request interception/route stubbing, synthetic network failures, modifying `localStorage`/session storage, or other page-context mutation that the in-app Browser bridge cannot perform reliably.
- If falling back from Browser Use, state the exact limitation, keep the same target/viewport, and save screenshots under `output/playwright/`.
- Playwright scripts should default to CJS: `const { chromium } = require('playwright')`.
- Playwright sequence: use `127.0.0.1:4173`, verify the server is current, exercise the changed flow, capture light/dark screenshots for UI work, include 375x812 and 768x1024 for responsive/mobile changes, wait 2-3 seconds before final screenshots, and leave `4173` running unless asked to stop.
- Screenshot reports must include tested URL, viewport, assertion/result summary, absolute screenshot path(s), and inline Markdown image(s).
- If Playwright assertions fail, fix and rerun before reporting completion.
- For chat parsing/file-link/browse-link changes, TestChat validation is mandatory: send a unique marker with representative markdown/link content, inspect the rendered row, assert `hrefOk`, `titleOk`, and `textOk`, and save `output/playwright/testchat-<feature>-cjs.png`.

## Dev Servers

- In worktrees, reuse an existing compatible `node_modules` tree when available. Do not prompt to remove/recreate a shared dependency directory just to run dev commands.
- Pass Vite flags directly to this repo's wrapper: `pnpm run dev --host 127.0.0.1 --port 5173`; do not insert an extra `--`.
- For dev-server fixes, verify the exact user-requested command afterward.
- Never kill or restart the tmux-managed `5173` server unless the user explicitly asks.
- Treat `4173` as reusable/disposable verification infrastructure. Verify its cwd before using it; restart only stale `4173` processes.

## UI Rules

- For shared route surfaces and large feature UIs, put decisive dark-theme overrides in `src/style.css` instead of relying only on component-scoped `:global(:root.dark)` blocks.
- Do not introduce native browser dropdowns (`<select>`) for app controls such as provider, model, branch, runtime, folder, language, or settings pickers. Use the app's custom dropdown/menu components so styling, search, dark theme, and option layout stay consistent.
- Browser assertions must inspect the real changed UI, not sidebar previews or base page load.
- For refresh-persistence fixes, include post-refresh evidence that the state persisted.

## Provider/Auth Docker Workflow

- Use this only when changes touch Docker startup, Codex auth detection, OpenCode Zen/OpenRouter/custom providers, provider model loading, app-server config, chat send/reply handling, or failed-turn error rendering.
- Build/package first: `pnpm run build`, `pnpm pack --pack-destination /tmp`, then build an OrbStack/Docker image installing the packed `codexapp` tarball plus `@openai/codex`, using `CODEX_HOME=/codex-home` and command `codexapp --port ${PORT:-4190} --no-password --no-open --no-tunnel --no-login`.
- Test isolated containers on unique localhost ports for: no auth Zen fallback, invalid/expired auth Codex error persistence after reload, malformed auth fallback, and provider switch from Zen to OpenRouter.
- Before success, report tested ports, provider/config summary, exact commands, screenshot paths, whether invalid auth persisted after reload, and whether duplicate live overlay count was zero.

## Fast Docker Feature Tests

- Use this for local-only feature checks that do not need packaged install behavior, for example project import/export HTTP endpoints.
- Build the reusable base image once with `docker build -t codexapp-fast-test-base:latest -f scripts/docker-fast-test-base.Dockerfile .`.
- For each test run, prefer `scripts/run-docker-fast-test.sh`; it runs `pnpm run build`, mounts the current repo read-only, reuses a Docker `CODEX_HOME` volume, and starts `node /repo/dist-cli/index.js` on `127.0.0.1:${PORT:-4191}`.
- Do not rebuild a packed-image Docker artifact for these checks unless the task specifically needs package install, npm tarball contents, postinstall behavior, auth/provider startup, or published `npx` behavior.
- To reset state, remove the named volume printed by the script or pass a new `CODEXAPP_DOCKER_FAST_HOME=<volume>` value.

## NPX / A1 Validation

- For `npx` package behavior tests, publish first and test the published `@latest`.
- Run `npx` validation on the Oracle host unless the user explicitly asks otherwise.
- For Oracle A1 UI validation from Mac, start the A1 server with Codex CLI in `PATH` using `pnpm run dev --host 0.0.0.0 --port 4173`, use the Tailscale URL such as `http://100.127.77.25:4173`, verify both UI and filesystem effects, and save screenshot evidence.

## LLM Wiki

- `llm-wiki/raw/` is immutable source material; never edit raw files after creation.
- Prefer updating existing pages under `llm-wiki/wiki/` over creating duplicates.
- Keep factual wiki claims tied to one or more raw source files.
- For ingest: add raw source, update/create topic pages, and update `llm-wiki/wiki/index.md`.
- Never create or maintain separate wiki logging/changelog files or logging sections anywhere in the repo. Git commit messages are the main and only chronological log for wiki work and related documentation changes.
- For query: read `llm-wiki/wiki/index.md` first, then relevant pages.
- For lint: check orphans and stale/contradictory claims; put follow-up questions in the relevant wiki topic page or a tracked issue, not any log/changelog file.
