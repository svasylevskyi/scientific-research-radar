import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/components/CloseAccountDialog.tsx', import.meta.url), 'utf8');
const {outputText} = ts.transpileModule(source, {compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
}});
function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return tree?.props ? [tree, ...elements(tree.props.children)] : [];
}
function dialog(request) {
  const slots = []; let cursor = 0;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = initial;
      return [slots[index], value => { slots[index] = value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ??= {current: initial}; },
  };
  const module = {exports: {}};
  runInNewContext(outputText, {module, exports: module.exports,
    require: name => name === 'react' ? react : name === '@mui/material' ? new Proxy({}, {get: (_, key) => key})
      : name === '../api/accountClosure' ? {accountClosureApi: {request}}
      : name === '../api/client' ? {ApiError: Error} : require(name),
  });
  const accepted = []; let dismissed = 0;
  const render = () => { cursor = 0; return module.exports.CloseAccountDialog({open: true, userId: 'target', name: 'Member',
    onClose: () => { dismissed++; }, onAccepted: value => accepted.push(value)}); };
  return {render, accepted, dismissed: () => dismissed};
}
const field = tree => elements(tree).find(item => item.type === 'TextField');
const consent = tree => elements(tree).find(item => item.type === 'FormControlLabel').props.control;
const form = tree => elements(tree).find(item => item.type === 'form');
const submitButton = tree => elements(tree).find(item => item.type === 'Button' && item.props.type === 'submit');

test('closure requires password and explicit consent; repeated submit sends once', async () => {
  const calls = []; let finish;
  const view = dialog((...args) => { calls.push(args); return new Promise(resolve => { finish = resolve; }); });
  let tree = view.render();
  assert.equal(submitButton(tree).props.disabled, true);
  await form(tree).props.onSubmit({preventDefault() {}});
  assert.equal(calls.length, 0);
  field(tree).props.onChange({target: {value: 'my password'}});
  tree = view.render();
  assert.equal(submitButton(tree).props.disabled, true);
  consent(tree).props.onChange({target: {checked: true}});
  tree = view.render();
  assert.equal(submitButton(tree).props.disabled, false);
  const first = form(tree).props.onSubmit({preventDefault() {}});
  await form(tree).props.onSubmit({preventDefault() {}});
  assert.deepEqual(calls, [['my password', 'target']]);
  view.render().props.onClose();
  assert.equal(view.dismissed(), 0);
  finish({state: 'pending'}); await first;
  assert.equal(view.accepted.length, 1);
  assert.equal(field(view.render()).props.value, '');
});

test('dismissing confirmation clears the password and consent', () => {
  const view = dialog(async () => {});
  let tree = view.render();
  field(tree).props.onChange({target: {value: 'private password'}});
  consent(tree).props.onChange({target: {checked: true}});
  view.render().props.onClose();
  tree = view.render();
  assert.equal(field(tree).props.value, '');
  assert.equal(consent(tree).props.checked, false);
  assert.equal(view.dismissed(), 1);
});
