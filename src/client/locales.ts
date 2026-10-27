/**
 * Dictionary of the `dsh-prompt-recall` locale namespace.
 *
 * @module dsh-prompt-recall/client/locales
 */

/** English copy. */
export const en = {
  /** Tooltip and accessible name of the action button. */
  'recall': 'Recall',
  /** Tooltip while the gesture is in flight. */
  'recall.busy': 'Recalling…',
  /** Failure surfaced in the composer when the conversation holds no prompt. */
  'error.noPrompt': 'There is no prompt to recall in this conversation.',
  /** Failure surfaced in the composer when the rewind was rejected. */
  'error.failed': 'The prompt could not be recalled.',
  /** Failure surfaced when the composer could not take the recalled text back. */
  'error.restore': 'The recalled prompt could not be placed back in the message box.',
  /** Notice on the continuing session when the superseded one stayed visible. */
  'error.archive': 'The conversation moved on, but the previous session could not be archived — it is still in the sidebar.',
}

/** Chinese copy. */
export const zh: Record<keyof typeof en, string> = {
  'recall': '撤回提示词',
  'recall.busy': '正在撤回…',
  'error.noPrompt': '当前会话没有可撤回的提示词。',
  'error.failed': '撤回提示词失败。',
  'error.restore': '撤回的提示词无法放回输入框。',
  'error.archive': '对话已继续，但上一个会话未能归档——它仍然在侧边栏里。',
}