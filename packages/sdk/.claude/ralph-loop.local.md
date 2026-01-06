---
active: true
iteration: 1
max_iterations: 50
completion_promise: "ALL_ISSUES_CLOSED_TESTS_PASSING"
started_at: "2026-01-06T20:50:40Z"
---

You are working on the @dotdo/claude SDK TDD implementation. Your goal is to close all 34 open beads issues by implementing them with TDD (Red-Green-Refactor).

## Current State Check
Run: bd stats && bd ready && pnpm vitest run 2>&1 | tail -5

## Strategy
1. Check bd ready for unblocked issues
2. Launch 3-4 parallel Task subagents, each working on one ready TDD issue
3. Each subagent should:
   - Read the issue with bd show <id>
   - Write failing tests (RED)
   - Implement code to pass (GREEN)  
   - Refactor and document (REFACTOR)
   - Run tests to verify
   - Close the issue with bd close <id>
4. Wait for subagents to complete
5. Run full test suite: pnpm vitest run
6. Check bd stats for remaining open issues

## Completion Criteria
When bd stats shows Open: 0 AND pnpm vitest run shows all tests passing, output:
<promise>ALL_ISSUES_CLOSED_TESTS_PASSING</promise>

## Important
- Always use bd ready to find unblocked work
- Run tests after each batch of implementations
- If tests fail, create subagents to fix them
- Sync with bd sync periodically
- Do NOT output the promise tag until truly complete
