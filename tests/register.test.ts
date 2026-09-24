import type { CommandRunInput, On, SessionStartInput } from 'claude-code'
import { describe, expect, test, tier } from 'claude-code/testing'

tier('user')

const SESSION: SessionStartInput = {
  surface: 'terminal',
  isInteractive: true,
  cwd: '/work',
}

function stash(args: string): CommandRunInput {
  return {
    command: 'stash',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  }
}

/**
 * The world beneath the mod: a session start, the plugin's store as a Map the test reads, a
 * command registry that takes /stash, and a prompt box that records each
 * fill and takes it unless `isBoxOpen` is false.
 */
function world(on: On, entries: Record<string, unknown>, isBoxOpen = true) {
  const store = new Map<string, unknown>(Object.entries(entries))
  const fills: string[] = []

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => {
    store.set(e.key, e.value)

    return { value: undefined }
  })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('prompt.fill', ($, e) => {
    if (isBoxOpen) {
      fills.push(e.text)
    }

    return { isFilled: isBoxOpen }
  })

  return { store, fills }
}

describe('register', () => {
  test('a prompt stashes on top, newest first', async ($, on) => {
    const { store } = world(on, { stack: ['older'] })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('fix the flaky test'))).toEqual({
      text: 'stashed as entry 1 (2 in the stash)',
    })
    expect(store.get('stack')).toEqual(['fix the flaky test', 'older'])
  })

  test('list puts a header first, then numbered first lines', async ($, on) => {
    world(on, { stack: ['one', 'two\nline b\nline c', 'x'.repeat(80)] })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('list'))).toEqual({
      text: [
        '3 stashed prompts, newest first',
        '  1  one',
        '  2  two (+2 lines)',
        `  3  ${'x'.repeat(71)}…`,
      ].join('\n'),
    })
  })

  test('list names one prompt in the singular', async ($, on) => {
    world(on, { stack: ['only'] })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('list'))).toEqual({
      text: '1 stashed prompt, newest first\n  1  only',
    })
  })

  test('list right-aligns numbers past 9', async ($, on) => {
    const stack = Array.from({ length: 10 }, (_, i) => `p${i + 1}`)
    world(on, { stack })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('list'))).toEqual({
      text: [
        '10 stashed prompts, newest first',
        '   1  p1',
        '   2  p2',
        '   3  p3',
        '   4  p4',
        '   5  p5',
        '   6  p6',
        '   7  p7',
        '   8  p8',
        '   9  p9',
        '  10  p10',
      ].join('\n'),
    })
  })

  test('list on an empty stash says so', async ($, on) => {
    world(on, {})
    await $.session.start(SESSION)

    expect(await $.command.run(stash('list'))).toEqual({ text: 'stash is empty' })
  })

  test('pop n fills the box with entry n and removes it', async ($, on) => {
    const { store, fills } = world(on, { stack: ['a', 'b\nsecond line', 'c'] })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('pop 2'))).toEqual({
      text: 'popped stash entry 2 into the prompt box',
    })
    expect(fills).toEqual(['b\nsecond line'])
    expect(store.get('stack')).toEqual(['a', 'c'])
  })

  test('pop with no number pops entry 1', async ($, on) => {
    const { store, fills } = world(on, { stack: ['a', 'b'] })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('pop'))).toEqual({
      text: 'popped stash entry 1 into the prompt box',
    })
    expect(fills).toEqual(['a'])
    expect(store.get('stack')).toEqual(['b'])
  })

  test('pop keeps the entry when the box refuses the fill', async ($, on) => {
    const { store } = world(on, { stack: ['a'] }, false)
    await $.session.start(SESSION)

    expect(await $.command.run(stash('pop 1'))).toEqual({
      text: 'the prompt box did not take stash entry 1; it stays in the stash',
    })
    expect(store.get('stack')).toEqual(['a'])
  })

  test('pop out of range or not a number names the value', async ($, on) => {
    const { fills } = world(on, { stack: ['a', 'b'] })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('pop 3'))).toEqual({
      text: 'no stash entry 3: the stash holds 2',
    })
    expect(await $.command.run(stash('pop 0'))).toEqual({
      text: 'stash entry must be a number from 1 to 2, got "0"',
    })
    expect(await $.command.run(stash('pop x'))).toEqual({
      text: 'stash entry must be a number from 1 to 2, got "x"',
    })
    expect(fills).toEqual([])
  })

  test('pop on an empty stash says so', async ($, on) => {
    world(on, {})
    await $.session.start(SESSION)

    expect(await $.command.run(stash('pop'))).toEqual({ text: 'stash is empty' })
  })

  test('no arguments shows usage and stashes nothing', async ($, on) => {
    const { store } = world(on, {})
    await $.session.start(SESSION)

    expect(await $.command.run(stash('  '))).toEqual({
      text: 'usage: /stash <prompt> | /stash list | /stash pop [n]',
    })
    expect(store.has('stack')).toEqual(false)
  })

  test('a malformed store shows as /stash output, naming the value', async ($, on) => {
    const { store, fills } = world(on, { stack: 'not a list' })
    await $.session.start(SESSION)

    expect(await $.command.run(stash('pop 1'))).toEqual({
      text:
        '/stash pop 1 failed: prompt-stash: store key "stack" is not an array of strings: "not a list"',
    })
    expect(fills).toEqual([])
    expect(store.get('stack')).toEqual('not a list')
  })
})
