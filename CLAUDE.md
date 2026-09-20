# CLAUDE.md

@agent.md
@rules.md

## Claude Code specifics

The two files above are loaded into every session. Two rules matter most and are easy to skip, so here they are again:

1. **First actions of any task: read the git history.** `git log --stat -n 20`, `git log -p -- <path>` for what you
   are touching, and `git status -sb`. Tell the user in a line or two what it showed before you edit anything.
2. **Commit every small step.** Finish one small change, check it, commit it, then start the next. Commits stay local.

Other Claude-specific notes:

- The backend stack is undecided. Propose options and wait; don't scaffold one.
- Never push unless asked. `origin` is a teammate's repository.
- Anything that moves funds or handles keys and secrets gets flagged in your summary, even if it looks trivial.
