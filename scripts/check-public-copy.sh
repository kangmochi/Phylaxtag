#!/usr/bin/env bash
# Public-copy guard.
#
# Fails when a file that is about to become public carries a trace that must not be
# published: a local absolute path, a private network address, the name of another
# project, the source of a design we must not copy, or a credential.
#
# Usage:
#   scripts/check-public-copy.sh          # checks the staged files (pre-commit)
#   scripts/check-public-copy.sh --all    # checks every tracked file
#
# Open-source names are NOT checked. Wallet names, libraries and standards appear in this
# repository on purpose. Add a rule only when a real leak happened or is likely.
set -uo pipefail

mode="${1:---staged}"
if [ "$mode" = "--all" ]; then
  files=$(git ls-files)
else
  files=$(git diff --cached --name-only --diff-filter=ACM)
fi

if [ -z "${files}" ]; then
  echo "check-public-copy: nothing to check"
  exit 0
fi

# Local paths, private hosts, other projects, and credential prefixes.
FIXED=(
  "/home/hermes"
  "/home/pranesta"
  ".hermes/"
  "tailscale"
  "100.102."
  "100.107."
  "100.64."
  "omnibook"
  "phylax-qa"
  "athena"
  "squads.xyz"
  "framer"
  "ed25519:"
  "ghp_"
  "github_pat_"
  "BEGIN OPENSSH PRIVATE KEY"
  "BEGIN RSA PRIVATE KEY"
)

# Patterns with a shape rather than a fixed string.
REGEX=(
  "sk-[A-Za-z0-9]{20,}"
  "https?://[A-Za-z0-9._-]*squads"
)

skip='(^|/)node_modules/|package-lock\.json$|Cargo\.lock$|^web/dist/|\.(png|jpg|jpeg|webp|gif|ico|wasm|pdf)$|^scripts/check-public-copy\.sh$'

status=0
report() {
  # Prints the rule and the file, never the matching text, so a secret cannot be echoed
  # into a log by the guard itself.
  echo "FAIL: rule '$1' matched in $2"
  status=1
}

while IFS= read -r file; do
  [ -f "$file" ] || continue
  if echo "$file" | grep -Eq "$skip"; then
    continue
  fi
  if ! grep -Iq . "$file" 2>/dev/null; then
    continue
  fi
  for rule in "${FIXED[@]}"; do
    if grep -Fiq -- "$rule" "$file" 2>/dev/null; then
      report "$rule" "$file"
    fi
  done
  for rule in "${REGEX[@]}"; do
    if grep -Eqi -- "$rule" "$file" 2>/dev/null; then
      report "$rule" "$file"
    fi
  done
done <<< "$files"

if [ "$status" -ne 0 ]; then
  echo
  echo "check-public-copy: fix or unstage the files above. Nothing was pushed."
  exit 1
fi

echo "check-public-copy: clean ($(echo "$files" | wc -l | tr -d ' ') files)"
