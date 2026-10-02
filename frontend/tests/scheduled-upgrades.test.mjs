import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {choices, paid, high, low, option, paidAccount, quote, harness, dialogHarness, button, card, find, nodes, text, plain, tick, load, hooks} from './helpers/plan-harness.mjs';

function accountWithRenewal() {
  const account = paidAccount();
  account.changes.items.push(option(high), option(high, 'annual'));
  return account;
}
function savedChange(overrides = {}) {
  return {id:'scheduled-1',state:'scheduled',plan_name:'Researcher',price:'200.00',currency:'EUR',interval:'annual',
    effective_at:'2030-12-01T00:00:00Z',undo_allowed:true,retry_allowed:false,error:null,...overrides};
}

test('higher Yearly is a server-authorized direct renewal upgrade, not a downgrade or immediate purchase', () => {
  const choice = choices.planChoice(high, 'annual', accountWithRenewal());
  assert.equal(choice.kind, 'renewal'); assert.equal(choice.direction, 'Upgrade');
  assert.equal(choices.choiceLabel(choice), 'Upgrade to Researcher');
  assert.equal(choice.option.interval, 'annual'); assert.equal(choice.effectiveAt, '2030-12-01T00:00:00Z');
});
test('same-interval upgrade defaults to immediate but carries an explicit renewal alternative', () => {
  const choice = choices.planChoice(high, 'monthly', accountWithRenewal());
  assert.equal(choice.kind, 'upgrade'); assert.equal(choice.atRenewal.kind, 'renewal');
  assert.equal(choice.atRenewal.option.interval, 'monthly'); assert.equal(choice.atRenewal.direction, 'Upgrade');
  assert.equal(choices.planChoice(high, 'monthly', paidAccount()).atRenewal, undefined);
});
test('a yearly discount does not redefine a server-offered higher tier as a downgrade', () => {
  const target={...high,annual_price:'90.00'}, account=paidAccount();account.changes.items.push(option(target,'annual'));
  const choice=choices.planChoice(target,'annual',account);
  assert.equal(choice.direction,'Upgrade');assert.equal(choice.option.price,'90.00');
});
test('missing or mismatched server options never authorize a cross-interval upgrade', () => {
  const a=accountWithRenewal();
  for(const target of [{...high,revision:8},{...high,currency:'USD'},{...high,annual_price:'205.00'}])
    assert.equal(choices.planChoice(target,'annual',a),null);
  a.changes.items=[];assert.equal(choices.planChoice(high,'annual',a),null);
});
test('public, workspace and embedded catalogues use the same direct Yearly upgrade and timing hint', async () => {
  for(const location of [{},{workspace:true},{embedded:true}]) {
    const app=await harness({...accountWithRenewal(),plans:[paid,high],...location});app.interval('annual');
    const tree=app.render(), b=button(card(tree,high.code),'Upgrade to Researcher');
    assert.equal(b.props.disabled,false);assert.equal(b.props.to,undefined);b.props.onClick();
    assert.equal(app.selectedChanges[0].kind,'renewal');assert.match(text(tree),/Starts at your next renewal/);
    assert.doesNotMatch(text(card(tree,high.code)),/select Monthly to keep/);assert.equal(app.requests.length,0);
  }
});
test('cross-interval upgrade reviews exact yearly terms and schedules only after confirmation', async () => {
  const app=await dialogHarness({account:accountWithRenewal()});
  app.render().choose(choices.planChoice(high,'annual',app.settings.account));let view=app.render();
  assert.equal(app.calls.length,0);assert.equal(text(find(view.dialog,n=>n.type==='DialogTitle')),'Schedule upgrade at renewal?');
  assert.match(text(view.dialog),/No charge or proration now/);assert.match(text(view.dialog),/only after the renewal invoice is paid and verified/);
  assert.match(text(view.dialog),/not a year's allowance upfront/);assert.equal(button(view.dialog,'Schedule upgrade').props.disabled,false);
  button(view.dialog,'Schedule upgrade').props.onClick();await tick();
  assert.deepEqual(plain(app.calls),[['schedule',{code:'researcher',revision:7,interval:'annual',expected_period_end:'2030-12-01T00:00:00Z',digest_ids:['one','two']}]]);
  assert.equal(app.urls.length,0);
});
test('same-interval preview can switch to renewal without confirming payment', async () => {
  const app=await dialogHarness({account:accountWithRenewal()});
  app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();
  button(app.render().dialog,'Schedule this upgrade at renewal instead').props.onClick();
  const view=app.render();assert.equal(text(find(view.dialog,n=>n.type==='DialogTitle')),'Schedule upgrade at renewal?');
  assert.doesNotMatch(text(view.dialog),/Due now:/);
  button(view.dialog,'Schedule upgrade').props.onClick();await tick();
  assert.deepEqual(app.calls.map(c=>c[0]),['previewUpgrade','schedule']);
  assert.equal(app.calls[1][1].interval,'monthly');
});
test('removed renewal alternative cannot be selected after an immediate quote refresh', async () => {
  const app=await dialogHarness({account:accountWithRenewal()});
  app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();
  app.settings.account.changes.items=[];
  const b=button(app.render().dialog,'Schedule this upgrade at renewal instead');assert.equal(b.props.disabled,true);b.props.onClick();
  assert.equal(text(find(app.render().dialog,n=>n.type==='DialogTitle')),'Continue to Payment?');
  assert.equal(app.calls.length,1);
});
test('a saved scheduled change blocks confirmation of an earlier immediate preview', async () => {
  const app=await dialogHarness({account:accountWithRenewal()});
  app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();
  app.settings.account.changes.change=savedChange();
  const pay=button(app.render().dialog,'Continue to Payment');assert.equal(pay.props.disabled,true);pay.props.onClick();
  assert.equal(app.calls.length,1);
});
test('changed renewal or target terms block stale confirmation and retain reviewed values', async () => {
  for(const mutate of [a=>a.changes.effective_at='2031-01-01T00:00:00Z',a=>a.changes.items=[],a=>a.access.plan.id=99]) {
    const app=await dialogHarness({account:accountWithRenewal()});app.render().choose(choices.planChoice(high,'annual',app.settings.account));
    const before=text(app.render().dialog);mutate(app.settings.account);
    const view=app.render();assert.match(text(view.dialog),/option or your subscription has changed/);
    assert.equal(button(view.dialog,'Schedule upgrade').props.disabled,true);button(view.dialog,'Schedule upgrade').props.onClick();
    assert.equal(app.calls.length,0);assert.ok(before.includes('Researcher'));
  }
});
test('cancellation snapshot requires a pending scheduled state, cutoff, and server permission', () => {
  const change=savedChange(), boundary=Date.parse(change.effective_at);
  assert.equal(choices.canCancelPlanChange(change,boundary-30_001),true);
  assert.equal(choices.canCancelPlanChange(change,boundary-30_000),false);
  for(const state of ['preparing','undoing','awaiting_payment','finalizing','needs_review','applied','undone','stopped'])
    assert.equal(choices.canCancelPlanChange({...change,state},boundary-60_000),false);
  assert.equal(choices.canCancelPlanChange({...change,undo_allowed:false},boundary-60_000),false);
  assert.equal(choices.canCancelPlanChange({...change,effective_at:'invalid'}),false);
});
test('cancel requested change opens explicit confirmation with safe dismiss and never cancels subscription', async () => {
  const app=await dialogHarness();const c=savedChange();app.settings.account.changes.change=c;
  app.render().cancelChange(c);const view=app.render();
  assert.equal(app.calls.length,0);assert.equal(text(find(view.dialog,n=>n.type==='DialogTitle')),'Cancel requested change?');
  assert.match(text(view.dialog),/does not cancel your subscription/);assert.match(text(view.dialog),/Professional → Researcher before choosing Professional → Explorer/);
  assert.equal(button(view.dialog,'Keep requested change').props.autoFocus,true);
  button(view.dialog,'Keep requested change').props.onClick();assert.equal(app.render().dialog.props.open,false);assert.equal(app.calls.length,0);
});
test('cancellation submits the exact saved change once and reports confirmed cancellation truthfully', async () => {
  let done;const c=savedChange();const app=await dialogHarness({handlers:{changeAction:()=>new Promise(resolve=>{done=resolve;})}});
  app.settings.account.changes.change=c;app.render().cancelChange(c);const confirm=button(app.render().dialog,'Cancel requested change');
  confirm.props.onClick();confirm.props.onClick();assert.equal(app.calls.length,1);
  done({...c,state:'undone',undo_allowed:false});await tick();
  assert.deepEqual(plain(app.calls),[['changeAction','scheduled-1','undo']]);
  assert.match(app.render().notice,/Requested change cancelled/);assert.match(app.render().notice,/subscription is not cancelled/);
});
test('pending or failed cancellation is not announced as completed', async () => {
  for(const state of ['undoing','needs_review','scheduled']) {
    const c=savedChange();const app=await dialogHarness({handlers:{changeAction:async()=>({...c,state})}});
    app.settings.account.changes.change=c;app.render().cancelChange(c);button(app.render().dialog,'Cancel requested change').props.onClick();await tick();
    assert.match(app.render().notice,/not yet confirmed/);assert.doesNotMatch(app.render().notice,/Requested change cancelled\./);
  }
  const app=await dialogHarness({handlers:{changeAction:async()=>{throw Error('lost connection')}}});const c=savedChange();
  app.settings.account.changes.change=c;app.render().cancelChange(c);button(app.render().dialog,'Cancel requested change').props.onClick();await tick();
  assert.equal(app.render().dialog.props.open,true);assert.match(text(app.render().dialog),/could not be confirmed/);
});
test('replacement, renewal drift, changed origin and stale read cannot cancel the wrong request', async () => {
  for(const mutate of [a=>a.changes.change={...a.changes.change,id:'other'},a=>a.billing.period_end='2035-01-01',
    a=>a.changes.change={...a.changes.change,effective_at:'2031-01-01'},a=>a.changes.change={...a.changes.change,undo_allowed:false}]) {
    const app=await dialogHarness(), c=savedChange();app.settings.account.changes.change=c;app.render().cancelChange(c);mutate(app.settings.account);
    const b=button(app.render().dialog,'Cancel requested change');assert.equal(b.props.disabled,true);b.props.onClick();assert.equal(app.calls.length,0);
  }
  const app=await dialogHarness(), c=savedChange();app.settings.account.changes.change=c;app.render().cancelChange(c);app.settings.disabled=true;
  assert.equal(button(app.render().dialog,'Cancel requested change').props.disabled,true);
});
test('a cutoff crossed without rerender is checked again by the confirmation handler', async () => {
  const app=await dialogHarness(), c=savedChange();app.settings.account.changes.change=c;app.render().cancelChange(c);
  const b=button(app.render().dialog,'Cancel requested change');const original=Date.now;
  try {Date.now=()=>Date.parse(c.effective_at)-10_000;b.props.onClick();assert.equal(app.calls.length,0);}
  finally {Date.now=original;}
});

async function panel(change, overrides={}) {
  const account={...paidAccount(),busy:false,...overrides};account.changes.change=change;
  const cancelled=[];
  const {PendingPlanChange}=await load('components/PendingPlanChange.tsx',{
    'react-router-dom':{Link:'Link'},'./SubscriptionData':{useSubscription:()=>account},'../planChoices':choices,
    '../allowancePresentation':{allowanceDate:value=>`DATE:${value}`},
    './PlanChangeDialog':{usePlanChangeDialog:()=>({busy:false,notice:'',error:'',reviewing:false,dialog:null,cancelChange:c=>cancelled.push(c)})},
  });
  return {tree:PendingPlanChange(),cancelled};
}
test('current-plan summary shows target, recurring price, date, cancellation and replacement explanation', async () => {
  const c=savedChange({plan_name:'Explorer'}),{tree,cancelled}=await panel(c);
  assert.match(text(tree),/Explorer/);assert.match(text(tree),/200/);assert.match(text(tree),/2030-12-01/);
  assert.match(text(tree),/current plan and billing interval/);assert.match(text(tree),/To downgrade to a different plan, cancel this request first/);
  const b=button(tree,'Cancel requested change');assert.equal(b.props.to,undefined);b.props.onClick();assert.equal(cancelled[0],c);
  assert.equal(nodes(tree).some(n=>['upgrade','changes'].includes(n.props?.id)),false);
});
test('pending summary does not hide processing/payment errors or claim cancelled changes are scheduled', async () => {
  for(const state of ['preparing','undoing','awaiting_payment','finalizing','needs_review']) {
    const {tree}=await panel(savedChange({state,error:state==='needs_review'?'Needs reconciliation':null}));
    assert.match(text(tree),/Researcher/);assert.equal(nodes(tree).some(n=>n.type==='Button'&&text(n)==='Cancel requested change'),false);
    if(state==='undoing')assert.match(text(tree),/Do not submit another/);
    if(state==='awaiting_payment')assert.match(text(tree),/does not grant higher benefits/);
  }
  for(const state of ['applied','undone','stopped'])assert.doesNotMatch(text((await panel(savedChange({state}))).tree),/Requested renewal/);
  assert.doesNotMatch(text((await panel(null)).tree),/Scheduled plan change/);
});
test('stale subscription data disables the top cancellation action without removing its context', async () => {
  const {tree}=await panel(savedChange(),{busy:true});assert.equal(button(tree,'Cancel requested change').props.disabled,true);assert.match(text(tree),/Researcher/);
});
test('pending-change panel is last in Current plan and independent of subscriber tabs', async () => {
  const source=await readFile(new URL('../src/components/SubscriptionOverview.tsx',import.meta.url),'utf8');
  assert.match(source,/<PendingPlanChange \/>\s*<\/Paper>\s*<Paper/);
  assert.doesNotMatch(source,/scheduledChange &&/);
});
