import type { EngineInterface, On } from 'claude-code'

/**
 * `/stash`: a stack of prompts, newest first, numbered from 1 as `/stash list`
 * shows them. Every answer is a hook's own `{ text }` with no `context`, so
 * no subcommand starts a model turn or puts anything in the model's context.
 */

export const COMMAND_NAME = 'stash'

export const STORE_KEY = 'stack'

export const PREVIEW_CHARS = 72

export const USAGE_TEXT =
  'usage: /stash <prompt> | /stash list | /stash pop [n]'

export const EMPTY_TEXT = 'stash is empty'

const COMMAND_SPEC = {
  name: COMMAND_NAME,
  description:
    'Stash a prompt, list stashed prompts, or pop one into the prompt box',
  argumentHint: '<prompt> | list | pop [n]',
  immediate: true,
} as const

/**
 * The stack as `$.store` holds it: the store is a JSON file on disk, so its
 * value is checked here and a malformed one throws, naming what was found.
 */
export function stackOf(value: unknown): string[] {
  if (value === undefined) {
    return []
  }

  if (
    !Array.isArray(value) ||
    !value.every(entry => typeof entry === 'string')
  ) {
    throw new Error(
      `prompt-stash: store key "${STORE_KEY}" is not an array of strings: ${JSON.stringify(value)}`,
    )
  }

  return value
}

/**
 * One `/stash list` row: the entry's number, right-aligned to `width`, and
 * its first line, cut to PREVIEW_CHARS, with the count of lines left out.
 */
export function previewOf(prompt: string, n: number, width: number): string {
  const [first = '', ...more] = prompt.split('\n')
  const cut =
    first.length > PREVIEW_CHARS
      ? `${first.slice(0, PREVIEW_CHARS - 1)}…`
      : first
  const extra = more.length > 0 ? ` (+${more.length} lines)` : ''

  return `  ${String(n).padStart(width)}  ${cut}${extra}`
}

/**
 * `/stash list`'s output for a non-empty stack. The engine prints the plugin's
 * name before the first line, so that line is a header and every entry starts
 * a line of its own.
 */
export function listTextOf(stack: readonly string[]): string {
  const width = String(stack.length).length
  const noun = stack.length === 1 ? 'prompt' : 'prompts'
  const rows = stack.map((prompt, i) => previewOf(prompt, i + 1, width))

  return [`${stack.length} stashed ${noun}, newest first`, ...rows].join('\n')
}

/**
 * The 0-based index `/stash pop [n]` names: `n` counts from 1, newest first,
 * and defaults to 1. Returns an error text for anything else.
 */
export function indexOf(
  arg: string | undefined,
  size: number,
): { index: number } | { error: string } {
  if (size === 0) {
    return { error: EMPTY_TEXT }
  }

  if (arg === undefined) {
    return { index: 0 }
  }

  if (!/^[1-9][0-9]*$/.test(arg)) {
    return {
      error: `stash entry must be a number from 1 to ${size}, got "${arg}"`,
    }
  }

  const n = Number(arg)

  if (n > size) {
    return { error: `no stash entry ${n}: the stash holds ${size}` }
  }

  return { index: n - 1 }
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    await $.command.register(COMMAND_SPEC)

    return next(e)
  })

  // The engine skips a hook that throws and runs what is beneath it, so every
  // failure is caught here and shown as /stash's own output instead.
  on('command.run', { command: COMMAND_NAME }, async ($, e) => {
    try {
      return await answer($, e.args)
    } catch (err) {
      return { text: failureTextOf(e.args, err) }
    }
  })
}

/**
 * The output /stash shows when a subcommand throws: the arguments as typed
 * and the error's message.
 */
export function failureTextOf(args: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)

  return `/stash ${args.trim()} failed: ${message}`
}

async function answer(
  $: EngineInterface,
  typed: string,
): Promise<{ text: string }> {
  const args = typed.trim()
  const [sub, ...rest] = args.split(/\s+/)
  const stack = stackOf(await $.store.get(STORE_KEY))

  if (args === '') {
    return { text: USAGE_TEXT }
  }

  if (sub === 'list' && rest.length === 0) {
    if (stack.length === 0) {
      return { text: EMPTY_TEXT }
    }

    return { text: listTextOf(stack) }
  }

  if (sub === 'pop' && rest.length <= 1) {
    const picked = indexOf(rest[0], stack.length)

    if ('error' in picked) {
      return { text: picked.error }
    }

    const prompt = stack[picked.index]

    if (prompt === undefined) {
      throw new Error(
        `prompt-stash: index ${picked.index} checked against ${stack.length} entries but missing`,
      )
    }

    const { isFilled } = await $.prompt.fill({ text: prompt, mode: 'replace' })

    if (!isFilled) {
      return {
        text: `the prompt box did not take stash entry ${picked.index + 1}; it stays in the stash`,
      }
    }

    await $.store.set(
      STORE_KEY,
      stack.filter((_, i) => i !== picked.index),
    )

    return {
      text: `popped stash entry ${picked.index + 1} into the prompt box`,
    }
  }

  await $.store.set(STORE_KEY, [args, ...stack])

  return { text: `stashed as entry 1 (${stack.length + 1} in the stash)` }
}
