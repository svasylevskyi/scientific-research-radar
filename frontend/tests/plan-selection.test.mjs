import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {choices, paid, free, high, low, option, paidAccount, quote, harness, dialogHarness, button, card, find, nodes, text, plain, tick} from './helpers/plan-harness.mjs';

test('eligible upgrade uses server code, revision, price and same interval',()=>{
 const a=paidAccount();assert.equal(choices.planChoice(high,'monthly',a).kind,'upgrade');
 for(const p of [{...high,revision:8},{...high,currency:'PLN'},{...high,monthly_price:'21.00'}])assert.equal(choices.planChoice(p,'monthly',a),null);
 assert.equal(choices.planChoice(high,'annual',a),null);
});
test('renewal downgrade and same-tier interval switch are not new checkouts',()=>{
 const a=paidAccount();const lower=choices.planChoice(low,'monthly',a);assert.equal(lower.kind,'renewal');assert.equal(choices.choiceLabel(lower),'Downgrade to Basic');
 const current=choices.planChoice({...paid,revision:99,annual_price:'999'},'annual',a);assert.equal(current.option.revision,7);assert.equal(current.option.price,'90.00');assert.equal(choices.choiceLabel(current),'Switch to Yearly');
});
test('relative labels do not make unavailable, mixed, or cross-currency options eligible',()=>{
 const a=paidAccount();a.upgrades.items=[];assert.equal(choices.planDirection(high,a),'Upgrade');assert.equal(choices.planChoice(high,'monthly',a),null);
 assert.equal(choices.planDirection(low,a),'Downgrade');assert.equal(choices.planDirection({...high,max_digests:1},a),'Change');
 assert.equal(choices.planChoice({...high,currency:'USD'},'monthly',paidAccount()),null);
});
test('changed origin, lost access, altered renewal and changed options invalidate frozen selections',()=>{
 for(const mutate of [a=>a.billing.period_end='2031-01-01',a=>a.access.plan.id=8,a=>a.changes.effective_at='2031-01-01',a=>a.changes.items=[],a=>a.access.allowed=false]){
  const a=paidAccount();const choice=choices.planChoice(low,'monthly',a);mutate(a);assert.equal(choices.choiceStillAvailable(choice,a),false);
 }
});
test('Free downgrade requires the actual fallback plan and cancellation permission',()=>{
 const a=paidAccount();assert.equal(choices.planChoice(free,'annual',a).kind,'free');
 a.freeDigests.plan_name='Different Free';assert.equal(choices.planChoice(free,'monthly',a),null);
 a.freeDigests.plan_name='Free';a.billing.cancel_allowed=false;assert.equal(choices.planChoice(free,'monthly',a),null);
});
test('archived current plans retain interval switching with their purchased revision',()=>{
 const a=paidAccount();const c=choices.currentIntervalChoices(a);assert.equal(c.length,1);assert.equal(c[0].option.revision,7);assert.equal(c[0].option.interval,'annual');
});
test('active digest selection rejects duplicates, wrong cardinality and unknown IDs',()=>{
 const o=option(low),digests=paidAccount().changes.digests;
 assert.equal(choices.selectionIdsValid(['one'],o,digests),true);
 for(const ids of [[],['one','one'],['other'],['one','two']])assert.equal(choices.selectionIdsValid(ids,o,digests),false);
});
test('public, workspace and embedded catalogues expose identical current/upgrade/downgrade actions',async()=>{
 for(const options of [{},{workspace:true},{embedded:true}]){
  const app=await harness({...paidAccount(),plans:[free,low,paid,high],...options});const tree=app.render();
  assert.equal(button(card(tree,'explorer'),'Review Subscription').props.to,'/radar/subscription#billing');
  for(const [code,label]of [['researcher','Upgrade to Researcher'],['basic','Downgrade to Basic'],['free','Downgrade to Free']]){
   const b=button(card(tree,code),label);assert.equal(b.props.to,undefined);assert.equal(b.props.disabled,false);b.props.onClick();
  }assert.deepEqual(app.selectedChanges.map(c=>c.kind),['upgrade','renewal','free']);assert.equal(app.requests.length,0);
 }
});
test('embedded catalogue does not add a page header or nested main',async()=>{
 const tree=(await harness({...paidAccount(),embedded:true})).render();
 assert.equal(nodes(tree).some(n=>['MarketingHeader','AppHeader'].includes(n.type)),false);
 assert.equal(find(tree,n=>n.type==='Container').props.component,'section');
 assert.equal(find(tree,n=>n.type==='Container').props.disableGutters,true);
});
test('existing paid users can never enter the initial checkout route even with contradictory checkout_allowed',async()=>{
 const a=paidAccount();a.billing.checkout_allowed=true;const app=await harness({...a,plans:[paid,high]});const tree=app.render();
 assert.ok(!nodes(tree).some(n=>n.type==='Button'&&text(n)==='Choose Researcher'));
 button(tree,'Upgrade to Researcher').props.onClick();assert.equal(app.requests.length,0);
});
test('current card retains Review Subscription while Yearly offers an interval-only modal',async()=>{
 const app=await harness({...paidAccount()});app.interval('annual');const tree=app.render();
 assert.ok(button(card(tree,'explorer'),'Review Subscription'));button(tree,'Switch to Yearly').props.onClick();
 assert.equal(app.selectedChanges[0].intervalOnly,true);
});
test('upgrade for a different selected interval explains the required interval instead of guessing',async()=>{
 const app=await harness({...paidAccount(),plans:[paid,high]});app.interval('annual');const tree=app.render();
 assert.equal(button(tree,'Upgrade to Researcher').props.disabled,true);assert.match(text(tree),/select Monthly to keep your current billing interval/);
});
test('first subscription and Free upgrades open Continue to Payment with a contained green button',async()=>{
 const app=await harness();button(app.render(),'Upgrade to Explorer').props.onClick();const tree=app.render();
 assert.equal(text(find(tree,n=>n.type==='DialogTitle')),'Continue to Payment?');
 const pay=button(tree,'Continue to Payment');assert.equal(pay.props.variant,'contained');assert.equal(pay.props.color,'success');
 assert.equal(button(tree,'Cancel').props.color,undefined);assert.equal(app.requests.length,0);
 pay.props.onClick();await tick();assert.deepEqual(plain(app.requests),[{code:'explorer',revision:7,interval:'monthly'}]);
});
test('merely rendering or browsing card options makes no transaction requests',async()=>{
 const app=await dialogHarness();app.render();app.render();assert.deepEqual(app.calls,[]);
});
test('paid upgrade opens a quoted payment modal on selection, without charging or starting checkout',async()=>{
 const app=await dialogHarness();app.render().choose(choices.planChoice(high,'monthly',app.settings.account));
 assert.equal(app.calls[0][0],'previewUpgrade');await tick();const result=app.render();
 assert.match(text(result.dialog),/Due now/);assert.match(text(result.dialog),/saved Stripe payment method/);
 assert.equal(text(find(result.dialog,n=>n.type==='DialogTitle')),'Continue to Payment?');
 assert.equal(button(result.dialog,'Continue to Payment').props.color,'success');assert.equal(button(result.dialog,'Continue to Payment').props.disabled,false);
 assert.equal(app.calls.length,1);
});
test('confirming upgrade uses the saved quote ID once, preserving verified payment semantics',async()=>{
 const app=await dialogHarness();app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();
 const tree=app.render().dialog;button(tree,'Continue to Payment').props.onClick();button(tree,'Continue to Payment').props.onClick();await tick();
 assert.deepEqual(app.calls.map(c=>c[0]),['previewUpgrade','upgradeAction']);assert.equal(app.calls[1][1],'quote-1');
 assert.equal(app.urls.length,0);assert.match(text(app.render().status),/Benefits follow verified payment/);
});
test('pending upgrade payment opens the existing hosted invoice, never another Checkout subscription',async()=>{
 const app=await dialogHarness({handlers:{upgradeAction:async()=>({...quote(),state:'pending_payment',confirm_allowed:false,payment_allowed:true})}});
 app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();button(app.render().dialog,'Continue to Payment').props.onClick();await tick();
 assert.deepEqual(app.calls.map(c=>c[0]),['previewUpgrade','upgradeAction','payUpgrade']);assert.equal(app.urls[0],'https://billing.stripe.com/test');
});
test('failed upgrade confirmation retains quote and exposes failure instead of creating a fresh purchase',async()=>{
 const app=await dialogHarness({handlers:{upgradeAction:async()=>{throw Error('timeout')}}});app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();
 button(app.render().dialog,'Continue to Payment').props.onClick();await tick();assert.equal(app.render().dialog.props.open,true);
 assert.match(text(app.render().dialog),/could not be confirmed/);assert.equal(app.calls.filter(c=>c[0]==='checkout').length,0);
});
test('expired and superseded upgrade quotes cannot be confirmed',async()=>{
 for(const mutate of [a=>a.upgrades.upgrade.id='different',a=>a.billing.period_end='2035-01-01',a=>a.upgrades.upgrade.confirm_allowed=false]){
  const app=await dialogHarness();app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();mutate(app.settings.account);
  const b=button(app.render().dialog,'Continue to Payment');assert.equal(b.props.disabled,true);b.props.onClick();await tick();assert.equal(app.calls.length,1);
 }
 const app=await dialogHarness({handlers:{previewUpgrade:async()=>{const q={...quote(),expires_at:'2000-01-01'};app.settings.account.upgrades.upgrade=q;return q;}}});
 app.render().choose(choices.planChoice(high,'monthly',app.settings.account));await tick();assert.equal(button(app.render().dialog,'Continue to Payment').props.disabled,true);
});
test('downgrade modal includes recurrence, exact price and active-digest choice without an immediate charge',async()=>{
 const app=await dialogHarness();app.render().choose(choices.planChoice(low,'monthly',app.settings.account));let result=app.render();
 assert.equal(app.calls.length,0);assert.match(text(result.dialog),/No charge or proration now/);assert.ok(nodes(result.dialog).some(n=>n.props?.label==='Oceanography'));
 const labels=nodes(result.dialog).filter(n=>n.type==='FormControlLabel');labels[0].props.control.props.onChange();result=app.render();
 assert.equal(button(result.dialog,'Confirm change at renewal').props.disabled,true);
 nodes(result.dialog).filter(n=>n.type==='FormControlLabel')[1].props.control.props.onChange();
 button(app.render().dialog,'Confirm change at renewal').props.onClick();await tick();
 assert.deepEqual(plain(app.calls),[['schedule',{code:'basic',revision:7,interval:'monthly',expected_period_end:'2030-12-01T00:00:00Z',digest_ids:['two']}]]);
});
test('failed renewal save keeps the selected plan and digest preferences intact',async()=>{
 const app=await dialogHarness({handlers:{schedule:async()=>{throw Error('failed')}}});app.render().choose(choices.planChoice(low,'monthly',app.settings.account));
 button(app.render().dialog,'Confirm change at renewal').props.onClick();await tick();const view=app.render();assert.equal(view.dialog.props.open,true);
 assert.equal(nodes(view.dialog).find(n=>n.type==='FormControlLabel').props.control.props.checked,true);assert.match(text(view.dialog),/could not be confirmed/);
});
test('renewal-date drift and a failed account read disable confirmation without overwriting drafts',async()=>{
 const app=await dialogHarness();app.render().choose(choices.planChoice(low,'monthly',app.settings.account));app.settings.account.changes.effective_at='2031-01-01';
 let b=button(app.render().dialog,'Confirm change at renewal');assert.equal(b.props.disabled,true);b.props.onClick();assert.equal(app.calls.length,0);
 app.settings.disabled=true;assert.equal(button(app.render().dialog,'Confirm change at renewal').props.disabled,true);
});
test('Free downgrade confirms cancellation externally and never starts Checkout or changes Free preferences automatically',async()=>{
 const app=await dialogHarness();app.render().choose(choices.planChoice(free,'monthly',app.settings.account));const view=app.render();assert.match(text(view.dialog),/No new payment/);
 button(view.dialog,'Continue to cancellation').props.onClick();await tick();assert.deepEqual(plain(app.calls),[['openBilling','cancel']]);
});
test('saved pending upgrades retain payment/retry actions and saved preview review',async()=>{
 const app=await dialogHarness();app.settings.account.upgrades.upgrade=quote();button(app.render().status,'Review saved preview').props.onClick();
 assert.equal(button(app.render().dialog,'Continue to Payment').props.disabled,false);
 app.settings.account.upgrades.upgrade={...quote(),state:'pending_payment',confirm_allowed:false,payment_allowed:true,retry_allowed:true};
 button(app.render().status,'Complete payment securely').props.onClick();await tick();assert.equal(app.calls[0][0],'payUpgrade');
});
test('saved renewal change can be undone only after explicit confirmation',async()=>{
 const app=await dialogHarness();app.settings.account.changes.change={id:'change',state:'scheduled',plan_name:'Basic',price:'5',currency:'eur',interval:'monthly',effective_at:'2030-12-01',undo_allowed:true,retry_allowed:false};
 button(app.render().status,'Undo scheduled change').props.onClick();assert.equal(app.calls.length,0);
 button(app.render().dialog,'Confirm undo').props.onClick();await tick();assert.deepEqual(plain(app.calls),[['changeAction','change','undo']]);
});
test('closing a modal makes no payment or scheduling request',async()=>{
 const app=await dialogHarness();app.render().choose(choices.planChoice(low,'monthly',app.settings.account));button(app.render().dialog,'Cancel').props.onClick();
 assert.equal(app.render().dialog.props.open,false);assert.equal(app.calls.length,0);
});
test('plan changes tab embeds the same catalogue instead of separate upgrade/downgrade pickers',async()=>{
 const source=await readFile(new URL('../src/pages/SubscriptionAccessPage.tsx',import.meta.url),'utf8');
 assert.match(source,/name === "plans" && <SubscriptionPlanCatalogue/);assert.doesNotMatch(source,/<SubscriptionUpgrades|<SubscriptionChanges/);
 assert.match(source,/preventScrollReset: true/);assert.match(source,/hash: "#" \+ value/);
});
