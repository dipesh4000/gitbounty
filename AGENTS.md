# AGENTS.md

@overview.md
@agent.md
@rules.md

## Codex specifics

The files above are loaded into every session. Read [`overview.md`](overview.md) first — it's the plain-language
explanation of what this project actually is. The short version: GitBounty is a **points/XP** app. The money and
escrow design in `readme.md` is a deferred later phase, not what's being built. Two rules from `rules.md` matter
most and are easy to skip, so here they are again:

1. **First actions of any task: read the git history.** `git log --stat -n 20`, `git log -p -- <path>` for what you
   are touching, and `git status -sb`. Tell the user in a line or two what it showed before you edit anything.
2. **Commit every small step.** Finish one small change, check it, commit it, then start the next. Commits stay local.

Other Codex-specific notes:

- The backend is FastAPI (Python), per the tech stack table in [`plan.md`](plan.md). Anything still open in
  `agent.md`'s "Undecided" list stays open: propose and wait, don't decide by scaffolding.
- Never push unless asked. `origin` is a teammate's repository.
- Nothing moves funds in the points version. Anything handling keys, tokens or secrets still gets flagged in your
  summary, even if it looks trivial.
