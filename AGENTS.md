# AGENTS.md

@overview.md
@agent.md
@rules.md

## Codex specifics

The files above are loaded into every session. Read [`overview.md`](overview.md) first — it's the plain-language
explanation of what this project actually is, including a still-unresolved disagreement about the product that the
other docs haven't caught up to. Two rules from `rules.md` matter most and are easy to skip, so here they are again:

1. **First actions of any task: read the git history.** `git log --stat -n 20`, `git log -p -- <path>` for what you
   are touching, and `git status -sb`. Tell the user in a line or two what it showed before you edit anything.
2. **Commit every small step.** Finish one small change, check it, commit it, then start the next. Commits stay local.

Other Codex-specific notes:

- The backend stack is undecided. Propose options and wait; don't scaffold one.
- Never push unless asked. `origin` is a teammate's repository.
- Anything that moves funds or handles keys and secrets gets flagged in your summary, even if it looks trivial.
