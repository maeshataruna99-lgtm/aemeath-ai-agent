'use strict';

// What the owner can choose for a Claude request: the model, the effort, and the kind of permission.
// Every value is checked against a fixed list before it reaches the command line, so a window can
// only pick from these lists and never send free text to the CLI.
//
// Permission kinds offered (decision D-017):
//   ask   read and answer; an edit waits for a typed "ya"; shell commands are denied (the default)
//   plan  Claude only makes a plan and changes nothing (the CLI's plan mode)
//   edit  Claude may edit files in the working folder without asking; shell commands are still denied
// Not offered: acceptEdits (it also lets some shell redirects through), auto, dontAsk, manual, and
// bypassPermissions. Nothing here lets a shell command run unattended.

const MODELS = ['fable', 'opus', 'sonnet', 'haiku'];
const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
const PERMISSIONS = ['ask', 'plan', 'edit'];
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];

const pick = (list, value) => (typeof value === 'string' && list.includes(value) ? value : '');

// -> { model, effort, permission } with every unknown value dropped ('' for model and effort, 'ask' for permission)
function cleanOptions(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  return { model: pick(MODELS, o.model), effort: pick(EFFORTS, o.effort), permission: pick(PERMISSIONS, o.permission) || 'ask' };
}

// The extra command line arguments for these choices. `approveEdits` is the one-turn approval that
// follows a typed "ya"; plan mode never allows edits, whatever else is asked.
function optionArgs(raw, approveEdits) {
  const { model, effort, permission } = cleanOptions(raw);
  const args = [];
  if (model) args.push('--model', model);
  if (effort) args.push('--effort', effort);
  if (permission === 'plan') args.push('--permission-mode', 'plan');
  else if (permission === 'edit' || approveEdits === true) args.push('--allowedTools', EDIT_TOOLS.join(','));
  return args;
}

module.exports = { MODELS, EFFORTS, PERMISSIONS, EDIT_TOOLS, cleanOptions, optionArgs };
