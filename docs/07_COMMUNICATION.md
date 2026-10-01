# Codex Communication Protocol

This repository uses GitHub Issues as the official work log between the product owner, the reviewing ChatGPT conversation, and Codex.

## Source of truth

For each implementation task:

1. The task specification lives in `/tasks/<AREA>/<TASK-ID>.md`.
2. A GitHub Issue with the same task ID is the live communication log.
3. The implementation branch / pull request contains the code changes.
4. The final implementation report lives in `/task-reports/<TASK-ID>.md`.

Do not use chat-only status updates as the sole record of development work.

## Required GitHub reports

Codex must post comments on the task Issue using the following exact status markers.

### Start report

```md
[CODEX:START]

Task: <TASK-ID>
Branch: <branch>
Plan:
- ...
- ...

Files expected to change:
- ...

Tests planned:
- ...

Questions / risks:
- None
```

Post this before making implementation changes.

### Progress report

```md
[CODEX:PROGRESS]

Task: <TASK-ID>
Completed:
- ...

Currently working on:
- ...

Tests run:
- ...

Current result:
- ...

Next action:
- ...
```

Use this when a meaningful milestone is reached. Do not spam minor updates.

### Consultation / blocked report

```md
[CODEX:BLOCKED]

Task: <TASK-ID>
Stopped at:
- ...

Reason:
- ...

Decision required:
- ...

Options identified:
1. ...
2. ...

Files changed so far:
- ...

Safety note:
- No further implementation will be performed until explicit instruction is received.
```

If the specification is ambiguous, a required external decision exists, a security-sensitive change would be needed, or the requested implementation cannot be completed as written, STOP and post this report.

Do not choose an option yourself.

### Completion report

```md
[CODEX:COMPLETE]

Task: <TASK-ID>
Result: PASS | FAIL

Implemented:
- ...

Changed files:
- ...

Dependencies added:
- None

Database changes:
- None

Tests:
- <command>: PASS/FAIL

Build / lint / typecheck:
- ...

Known issues:
- None

Specification deviations:
- None

PR:
- <URL or number>

Implementation report:
- /task-reports/<TASK-ID>.md
```

A task must not be marked PASS unless all completion conditions in its task specification are satisfied.

## Communication rules

- Report facts, not assumptions.
- Never include passwords, access tokens, API keys, cookies, OAuth secrets, service-role keys, or other secrets.
- Do not paste full environment variable values.
- Do not claim a test passed unless it was actually executed successfully.
- Do not claim a file was unchanged if it was modified.
- If implementation differs from the specification, explicitly report the deviation.
- If a task is blocked, stop work until an explicit decision is provided.
- Do not start the next task automatically after completion.
- PR creation does not authorize merge.
- Merge does not authorize the next task.

## Review workflow

The reviewing ChatGPT conversation may inspect:
- task specifications,
- Issue comments,
- pull request diffs,
- implementation reports,
- test results,
- Supabase configuration and logs,
- Vercel deployments and logs.

The reviewer will return one of:
- PASS
- PASS WITH NOTES
- CHANGES REQUIRED
- BLOCKED

Only explicit approval allows progression to the next task.
