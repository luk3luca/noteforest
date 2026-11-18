# Installed skills

Third-party method skills, vendored into `.agents/skills/` so the repository defines its own agent
behavior. They are **method**, not invariants: `AGENTS.md` and `docs/spec.md` still win on any
conflict. One skill per capability; do not add a second one that does the same job.

## What is installed

| Skill | Source | Primary role | Invocation | Why |
|---|---|---|---|---|
| `verification-before-completion` | obra/superpowers | Orchestrator | model | No completion claim without fresh evidence |
| `handoff` | mattpocock/skills | Orchestrator | user | Compact a session into a handoff document |
| `grilling` | mattpocock/skills | Planner | model | Interview the plan until the branches are resolved |
| `grill-with-docs` | mattpocock/skills | Planner | user | Grilling that writes ADRs and the glossary |
| `domain-modeling` | mattpocock/skills | Planner | model | Sharpen terms, glossary and ADRs |
| `writing-for-agents` | mattpocock/skills | Planner | model | Documents agents can follow: AGENTS, plans, skills |
| `research` | mattpocock/skills | Planner / Scout | model | Primary sources, cited note |
| `prototype` | mattpocock/skills | Planner | model | Throwaway prototype for a design question |
| `codebase-design` | mattpocock/skills | Planner | model | Deep modules, seams, testability |
| `improve-codebase-architecture` | mattpocock/skills | Planner | user | Architecture survey with an HTML report |
| `ponytail` | DietrichGebert/ponytail | Builder | model | Smallest complete change, `full` level |
| `tdd` | mattpocock/skills | Builder | model | Seams, anti-patterns, vertical slices |
| `diagnosing-bugs` | mattpocock/skills | Builder | model | Feedback loop that goes red, falsifiable hypotheses |
| `receiving-code-review` | obra/superpowers | Builder | model | Receive findings without performative agreement |
| `code-review` | mattpocock/skills | Sentinel | model | Standards and spec axes, parallel review |
| `retro` | mattpocock/skills | all | user | Improve the agent environment after a session |
| `stop-slop` | hardikpandya/stop-slop | Docs | model | Remove AI tells from prose |

Thirteen skills are model-invoked (their descriptions are advertised). Four are user-invoked and
hidden from the model: `grill-with-docs`, `handoff`, `improve-codebase-architecture`, `retro`.

## What is deliberately not installed

| Skill | Why not |
|---|---|
| `to-tickets`, `to-spec`, `triage` | They assume an issue tracker and the setup wizard; our plan package already does this job. |
| `subagent-driven-development` | Coupled to `writing-plans`, `using-git-worktrees` and `finishing-a-development-branch`; our pipeline and worktree policy replace it. |
| `writing-plans`, `executing-plans`, `brainstorming` | Duplicate the Planner role and `grilling`. |
| `test-driven-development`, `systematic-debugging` (Superpowers) | Duplicate `tdd` and `diagnosing-bugs` with broader triggers. |
| `using-git-worktrees` | The harness owns worktrees and `AGENTS.md` defines the policy. |
| `using-superpowers`, the plugin | The bootstrap forces a global "1% rule" and adds context to every session. |
| `wayfinder`, `ask-matt`, `implement`, `implement-spec`, `pr`, `wizard` | Not part of the current pipeline. |
| `in-progress/*`, `misc/*` | Experimental or repository-specific. |

## Provenance

| Source | Commit | License |
|---|---|---|
| `mattpocock/skills` | `5863806` | MIT |
| `obra/superpowers` | `22f0b46` | MIT |
| `DietrichGebert/ponytail` | `96608e0` | MIT |
| `hardikpandya/stop-slop` | `8da1f03` | MIT |

The files are unmodified copies. `skills-lock.json` records the source, commit, path and content
hash of every skill.

## Updating

```bash
npx skills update            # project scope
git diff .agents/skills      # read the change, do not accept it blindly
```

A skill is a prompt with full agent permissions: review the diff before committing. An update that
changes a trigger or a completion criterion is a behavior change and deserves a line in the batch
report.

## Adding one

1. Decide which capability it fills and which role owns it.
2. Install it into the project, not globally: `npx skills add <repo> -a opencode -s <skill>`.
3. If it calls another skill by name, install that one too.
4. Add a row here and commit the lock with the skill.
