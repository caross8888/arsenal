Read `CLAUDE.md` before working in this repository and follow its instructions.

Start new work from the latest `origin/main` on a `codex/...` branch. Leave `claude/...` branches to Claude; do not force-push another agent's branch.

Deploy by merging into `main` through the normal GitHub workflow. Never deploy directly with the Vercel CLI, including `vercel --prod`.

Use `vercel env pull` only when a task requires local application secrets. Keep downloaded environment files ignored and never print or commit their contents.
