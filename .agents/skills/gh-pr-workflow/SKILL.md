---
name: gh-pr-workflow
description: Automate the creation of feature branches, pushing code, and opening descriptive Pull Requests using the GitHub CLI (gh). Use this when finalizing a task and moving code to review.
---

# GitHub PR Workflow

This skill automates the process of moving code from your local environment to a Pull Request on GitHub.

## Workflow

To create a Pull Request, follow these steps in sequence:

### 1. Verify README Status
Check if the `README.md` needs to be updated based on staged changes:
```powershell
node .agents/skills/readme-auto-update/scripts/check-readme.cjs
```

### 2. Prepare and Validate PR Description
Save your PR description content to a temporary file (e.g., `pr-body.txt`) and run the description format checker:
```powershell
node .agents/skills/pr-description-check/scripts/verify.cjs pr-body.txt
```
*Note: If formatting warnings/errors are reported (e.g., unbackticked paths/commands), edit the file to fix them and re-run the check.*

### 3. Create Branch, Commit, Push, and Open PR
Once all checks pass, run the following sequence to push the changes, open the PR using the verified description file, and monitor its checks:
```powershell
git checkout -b <branch-name>; git add .; git commit -m "<conventional-commit-msg>"; git push -u origin <branch-name>; gh pr create --title "<pr-title>" --body-file pr-body.txt --reviewer kunalbhatia; Remove-Item pr-body.txt; node .agents/skills/verify-pr-status/scripts/verify-checks.cjs
```

## Guidelines

- **PR Lifecycle**: Always run the `verify-pr-status` check script immediately after creating a PR to monitor status until all checks resolve.
- **Branch Naming**: Use `feat/`, `fix/`, or `docs/` prefixes (e.g., `feat/new-api-endpoint`).
- **Commit Messages**: Always use **Conventional Commits** (e.g., `feat: add slack command listener`).
- **PR Titles**: Match the commit message or use a clear descriptive title.
- **PR Body**:
  - **Description**: What does this PR do?
  - **Changes**: Bulleted list of technical modifications.
  - **Verification**: Summarize test results, linting, and manual checks.

## Examples

### Feature Implementation

**Branch**: `feat/user-auth`
**PR Title**: `feat: implement jwt-based user authentication`
**PR Body**:

```markdown
### Description

Implements JWT authentication and protected routes.

### Changes

- Added auth middleware.
- Created login/register routes.
- Integrated bcrypt for password hashing.

### Verification

- `npm test` passed.
- Manual login verification successful.
```
