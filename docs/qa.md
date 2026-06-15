# NeuroSort QA Procedure

This checklist is for safe local Zen/Sine validation. It must never launch, read, or mutate a primary browser profile.

## Safety Rules

- Use only the repo-owned disposable profile recorded by `npm run qa:detect`.
- Do not copy data from an existing Zen, Firefox, Sine, or Cosine profile.
- Do not record active profile paths, API keys, Authorization headers, raw prompts, full URLs, or response bodies in evidence.
- Stop and write skip evidence if the harness cannot prove a disposable profile path.
- Keep Sine provider credentials disabled or fake unless the scenario explicitly needs a local test provider.

## Detection

Run:

```sh
npm run qa:detect
```

Pass criteria:

- `.omo/evidence/task-18-real-qa-available.json` exists, or `.omo/evidence/task-18-real-qa-skipped.md` explains the blocker.
- If available, the profile path is `.omo/evidence/zen-qa-profile`.
- No primary profile path appears in evidence.

## Harness Check

Run:

```sh
npm run qa:real
```

Pass criteria:

- The command refuses unsafe runs.
- The log records `primaryProfileMutation=forbidden`.
- The log points only at the disposable profile.

## Manual Disposable-Profile Scenarios

Run these only after the disposable-profile safety checks pass:

1. Install the generated `neurosort.uc.js` in the disposable Zen/Sine profile.
2. Confirm the NeuroSort broom is visible and status text is stateful.
3. Confirm ungrouped tidy affects only ungrouped tabs in the current workspace.
4. Confirm Sort All Tabs includes already grouped tabs.
5. Confirm Sort Selected Tabs leaves unselected tabs untouched.
6. Confirm Undo is session-local and best effort.
7. Confirm auto-tidy triggers only when enabled and threshold is met.
8. Confirm provider timeout or failure does not mutate tabs.
9. Confirm settings/setup state never exposes secrets.
10. Confirm pinned, folder, split-view, closing, and other-workspace tabs are excluded.

Record pass/fail notes in `.omo/evidence/task-23-real-qa.md` only when the scenarios are actually run against the disposable profile. If they cannot be run safely, record `.omo/evidence/task-23-real-qa-skipped.md` with the exact blocker.
