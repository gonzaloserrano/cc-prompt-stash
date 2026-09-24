# cc-prompt-stash

A Claude Code mod (a plugin built on function hooks) that gives prompts a
git-stash-like stack:

- `/stash <prompt>` pushes a prompt. Entry 1 is the newest.
- `/stash list` lists entries by number and first line.
- `/stash pop [n]` puts entry `n` (default 1) back in the prompt box, editable,
  and removes it from the stash only once the box took it.

Every subcommand answers locally: no model turn, nothing in the model's
context. The stash lives in the plugin's `$.store`, so it survives sessions.

Function hooks are early access
([anthropics/claude-code#91870](https://github.com/anthropics/claude-code/issues/91870)).
The API can change between releases.

## Compared with Ctrl+S

Claude Code has a built-in prompt stash on Ctrl+S (the `chat:stash`
keybinding). With text in the input, Ctrl+S stashes it and clears the
prompt. On an empty prompt, Ctrl+S restores the stashed text, cursor position
and pasted content
([interactive mode docs](https://code.claude.com/docs/en/interactive-mode)).

The main difference: Ctrl+S holds one prompt, `/stash` holds a stack.

|                          | Ctrl+S                                     | `/stash`                                     |
| ------------------------ | ------------------------------------------ | -------------------------------------------- |
| Entries                  | One                                        | A stack, as many as the 4 MiB store holds    |
| Stash                    | One key, takes the current draft           | Type `/stash ` before the prompt             |
| Restore                  | One key, on an empty prompt                | `/stash pop [n]`, any entry                  |
| See what is stashed      | No                                         | `/stash list`                                |
| Restores cursor, pastes  | Yes                                        | No: text only, cursor at the end             |
| Across sessions          | Not documented                             | Yes: a JSON file in the plugin's store       |
| Needs function hooks     | No                                         | Yes (`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`)  |

Use Ctrl+S to park one draft for a moment. Use `/stash` to keep several
prompts, or to keep them after you quit.

The two do not share state: `/stash pop` does not see what Ctrl+S stashed.

## Install

This repository is its own plugin marketplace. In Claude Code:

    /plugin marketplace add gonzaloserrano/cc-prompt-stash
    /plugin install prompt-stash@cc-prompt-stash

Or from a shell:

    claude plugin marketplace add gonzaloserrano/cc-prompt-stash
    claude plugin install prompt-stash@cc-prompt-stash

Mods load only where function hooks are enabled. Start Claude Code with the
flag set, for example by exporting it in your shell profile:

    export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1

## Run from a checkout

    CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir .

## Check

The type declarations are not in this repository. Generate them first: in a
Claude Code session started in this folder with function hooks enabled, run
`/plugin-types`. It writes them to `.claude/types/`, which git ignores.

    npx -p typescript@5 tsc -p tsconfig.json
    CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test .

## Status

Built against Claude Code 2.1.280. Typecheck passes. 12 of 12 tests pass.
Stash, list and pop work in a live session.

The engine skips a hook that throws and runs what is beneath it (fail open).
So the `/stash` hook catches every error and shows it, with the arguments
and the offending value, as its own output.

Open:

- No test covers a failing `$.store` write: a test hook that throws is
  skipped too, so it cannot simulate one.
- A prompt that is exactly `list` or `pop` runs that subcommand.
