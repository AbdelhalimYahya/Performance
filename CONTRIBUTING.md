# Contributing to frontend-backend-performance-mastery

Thank you for taking the time to contribute. This repository exists because engineers like you believe that performance is not optional — it is a core engineering discipline. Every contribution you make helps the next engineer ship faster, more reliable software. We take quality seriously because the people reading this code take their work seriously. They will use your examples in production systems, in architecture reviews, and in conversations with their teams. That is a responsibility worth taking seriously.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Types of Contributions We Welcome](#types-of-contributions-we-welcome)
- [Quality Bar — Read This Carefully](#quality-bar--read-this-carefully)
- [How to Contribute — Step by Step](#how-to-contribute--step-by-step)
- [Branch Naming Convention](#branch-naming-convention)
- [Commit Message Format](#commit-message-format)
- [Pull Request Template](#pull-request-template)
- [Adding a New Level Entry](#adding-a-new-level-entry)
- [Adding a New Level (Level 07+)](#adding-a-new-level-level-07)
- [Performance Budget Rules for Contributions](#performance-budget-rules-for-contributions)
- [Getting Help](#getting-help)
- [Recognition](#recognition)

---

## Code of Conduct

Be professional. Be kind. Focus on the code, not the person. When reviewing or discussing contributions, critique the implementation — never the implementer. A bad idea is not a bad person. We are all here to build something useful together.

If you want the full text, we follow the [Contributor Covenant](https://www.contributor-covenant.org/). The short version: treat people with respect, focus on technical merit, and do not be a jerk.

---

## Types of Contributions We Welcome

### New Performance Patterns

A technique not yet covered in the repo. Must follow the detect → fix → project structure. Open an issue first to discuss whether it fits the repo's scope. If you are not sure, open the issue anyway — we would rather discuss it than have you build something that does not fit.

### Improved Code Examples

Making existing examples more realistic, more complete, or better annotated. Maybe an existing example uses a mock where a real implementation would be better. Maybe the comments are unclear. Maybe the error handling is missing. These improvements are just as valuable as new content.

### Bug Fixes

Broken code, incorrect benchmarks, or misleading explanations. If you followed a guide and something did not work as described, that is a bug. Fix it or open an issue describing what happened.

### Documentation Improvements

Fixing typos, adding clarity, improving the detect.md and fix.md files. Documentation is code in this repo. Treat it with the same care.

### New Level Content

Adding a new route, controller, or component to an existing project example. Follow the existing code style in that project. Update the project's local README.md if one exists.

### Translations

Translating detect.md and fix.md files to other languages. Code stays in English — only the prose is translated. Put translated files in a `translations/` subdirectory with the language code in the filename (e.g., `detect.ja.md` for Japanese).

### What We Do Not Want

- Tutorial-style code that over-simplifies real-world usage
- Placeholder TODO comments ("implement this here")
- Pseudo-code presented as real code
- Examples that cannot be run as-is without manual setup
- Code that uses `any` types to avoid proper TypeScript typing
- Comments that explain what the code does instead of why it does it

---

## Quality Bar — Read This Carefully

This section is non-negotiable. It exists because professional engineers trust this code, and that trust must be earned with every contribution.

### The No Pseudo-code Rule

Every code example in this repo must be runnable. If you write a TypeScript snippet it must compile. If you write a bash command it must work. If you write a SQL query it must execute against the schema provided. If you write a YAML config it must be valid.

"Pseudo-code for illustration" has no place in a repository for professional engineers. If you cannot write the real code — because you do not have time, because the API is complex, because you are not sure about the implementation — open an issue describing the concept instead. That is a valid contribution. Pseudo-code that looks real is worse than no code at all, because someone will copy it into a production system and it will break.

### The Measurement Rule

Every fix you contribute must include a before/after measurement. This is non-negotiable. You cannot say "this is faster" without numbers. You cannot say "this reduces bundle size" without showing the size before and after. You cannot say "this improves latency" without showing the latency numbers.

Acceptable forms of measurement:

- `autocannon` output showing p50/p99 before and after
- Lighthouse score before and after
- Bundle size before and after (in KB)
- A benchmark script output with statistically significant results
- A flame graph comparison (screenshot or description)
- PostgreSQL `EXPLAIN ANALYZE` output before and after an index change

The format is flexible. The measurement is not. If your contribution claims an improvement without evidence, it will not be merged.

### The Minimum File Size Rule

This repo is for engineers who want to see production-quality code. A file with 30 lines of code that could realistically be 200 lines in production is not a useful contribution. Each project file should reflect the complexity of real-world usage:

- Proper error handling (not just `try/catch` with an empty catch block)
- TypeScript types (no `any`, no `as any`, no type assertions unless unavoidable)
- Logging (structured, with context)
- Edge case handling (empty arrays, null values, network failures)
- Comments explaining non-obvious decisions (not what the code does — why it does it)

If you are contributing a caching interceptor, include cache invalidation logic, TTL handling, and error fallback — not just `cache.set(key, value)`.

### The Runnable Project Rule

Every `/project` folder must be runnable with `npm install` and `npm run dev` (frontend) or `npm run start:dev` (backend). If your contribution requires manual setup steps not already in the README, you must update the project's README.md inside that folder to document them.

Test your contribution before submitting. Clone a fresh copy, follow your own instructions, and verify everything works. If you cannot do this in 5 minutes, neither can the next person.

---

## How to Contribute — Step by Step

1. **Fork** the repository on GitHub

2. **Clone** your fork:

```bash
git clone https://github.com/YOUR_USERNAME/frontend-backend-performance-mastery.git
cd frontend-backend-performance-mastery
```

3. **Create a branch** with the correct naming convention (see [Branch Naming Convention](#branch-naming-convention)):

```bash
git checkout -b feat/level-03-redis-pub-sub-invalidation
```

4. **Make your changes** following the [Quality Bar](#quality-bar--read-this-carefully) above

5. **Run the existing linters** in the relevant project folder:

```bash
cd level-03-caching/backend/project
npm run lint
```

6. **Test that the project still runs**:

```bash
npm run start:dev   # backend
npm run dev          # frontend
```

7. **If you added a new project example**, run the build to ensure it compiles cleanly:

```bash
npm run build
```

8. **Commit** with a meaningful message (see [Commit Message Format](#commit-message-format))

9. **Push** your branch and open a Pull Request using the [PR template](#pull-request-template)

10. **Wait for review**. Be responsive to feedback. Update your PR within 7 days of review comments or it may be closed. We respect your time — please respect ours.

---

## Branch Naming Convention

Format: `type/level-XX-short-description`

| Type | When to Use |
|------|------------|
| `feat` | New content — a new pattern, route, controller, or feature |
| `fix` | Bug fix — broken code, incorrect output, wrong behavior |
| `docs` | Documentation only — no code changes |
| `refactor` | Restructuring code without changing behavior |
| `perf` | Improving an existing example's performance |

Examples:

```bash
feat/level-03-redis-pub-sub-invalidation
fix/level-01-lighthouse-ci-broken-assertion
docs/level-04-cursor-pagination-explain-output
feat/level-05-wasm-image-processing-rust
refactor/level-06-telemetry-split-into-modules
perf/level-02-streaming-replace-json-stringify
```

---

## Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

Format: `type(scope): description`

- **type**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`
- **scope**: the level and layer, e.g. `level-03/frontend`, `level-05/backend`, `root`
- **description**: present tense, lowercase, no period at the end, max 72 characters

Examples:

```bash
feat(level-03/frontend): add SWR polling with exponential backoff hook
fix(level-04/backend): correct cursor encoding to use base64url not base64
docs(level-01/frontend): add flame chart reading guide to detect.md
perf(level-02/backend): replace JSON.stringify with fast-json-stringify in streaming controller
test(level-05/backend): add autocannon benchmark for gRPC vs REST comparison
chore(root): update README badges to reflect current Node.js version
```

---

## Pull Request Template

Every PR must use this template. Copy it into your PR description.

```markdown
## What does this PR do?

<!-- One paragraph describing the change. What problem does it solve? What does it add? -->

## Level and Layer

<!-- e.g. Level 03 — Frontend, Level 05 — Backend, Root -->

## Type of change

- [ ] New performance pattern
- [ ] Bug fix
- [ ] Documentation improvement
- [ ] New project example or route
- [ ] Performance improvement to existing example
- [ ] Translation

## Before/After Measurement

<!-- Required for any code change. Paste benchmark output, Lighthouse scores, or bundle sizes. -->

**Before:**
```
(paste output here)
```

**After:**
```
(paste output here)
```

## Checklist

- [ ] My code is runnable (`npm install && npm run dev` works)
- [ ] No pseudo-code — all snippets are real and compile
- [ ] TypeScript strict mode — no `any` types
- [ ] I have run `npm run lint` and fixed all warnings
- [ ] I have added or updated comments for non-obvious logic
- [ ] My PR title follows the commit message format
- [ ] I have tested this on Node.js >= 20

## Screenshots or Demo (if applicable)

<!-- Terminal output, Lighthouse report screenshot, or DevTools screenshot -->
```

---

## Adding a New Level Entry

If you are adding new content to an existing level, follow these rules:

### Adding to detect.md or fix.md

Add a new numbered section following the existing format. Do not rewrite existing sections. Match the tone, structure, and level of detail of the surrounding content. Every section should have: what the symptom looks like, how to measure it, and what the fix is.

### Adding a New Route or Controller to a Project

Follow the existing code style in that project. If the project uses class-based services, do not add functional-style code. If the project uses Prisma, do not add raw SQL unless there is a specific reason. Add a corresponding entry to the project's local README.md if one exists.

### Adding an Entirely New Sub-topic

Create it as a separate folder inside the level with its own detect.md, fix.md, and project/ directory. Follow the same three-file structure that every other entry uses.

---

## Adding a New Level (Level 07+)

This is a significant contribution. Open an issue first describing:

- **What topic** the new level covers
- **Why** it is not already covered in Levels 01-06
- **What the frontend and backend projects would demonstrate**
- **A draft outline** of detect.md (section headers with one-sentence descriptions)

Wait for maintainer approval before building it. This saves everyone time. A well-scoped issue with a clear outline will get approved faster than a 500-file PR with no prior discussion.

---

## Performance Budget Rules for Contributions

Any code example added to the frontend must not violate these thresholds when run through Lighthouse:

| Metric | Threshold |
|--------|-----------|
| Performance score | Minimum 80 |
| LCP | Maximum 3000ms |
| CLS | Maximum 0.15 |
| TBT | Maximum 400ms |

These are intentionally more lenient than the main repo assertions (85 / 2500 / 0.1 / 200) to allow for demo complexity. Examples that score below 80 will be rejected. Run `npm run lhci` in the relevant project folder before submitting.

---

## Getting Help

### Open a GitHub Issue for

- Bug reports
- Broken examples
- Incorrect information
- Suggestions for new content
- Questions about the repository structure

### Open a GitHub Discussion for

- Questions about the code
- Asking for clarification on a guide
- Sharing how you used this repo in a project
- Proposing ideas before building them

### Do NOT Open an Issue to Ask

- "How do I get started?" — Read the README first.
- "Can you explain this code?" — The code has comments. Read them.
- "Is this repo still maintained?" — Check the commit history.

---

## Recognition

All contributors are listed in the GitHub contributors graph. Significant contributors (more than 5 merged PRs) will be added to a CONTRIBUTORS.md file with a short description of what they built. We value your time and your expertise. Your name in that file means you helped thousands of engineers write better, faster code.

---

> **The standard is high because the audience deserves it.** Every engineer who reads this repo is trying to ship better software. Your contribution is part of that. Make it something you would be proud to put your name on.
