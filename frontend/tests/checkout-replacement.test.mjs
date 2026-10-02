import test from 'node:test';
import assert from 'node:assert/strict';
import { harness, checkoutChoices, paid, free, high, paidAccount, nodes, text, find, button, card, tick } from './helpers/plan-harness.mjs';

const original = {id:'old-attempt',code:'explorer',revision:7,interval:'monthly',plan_name:'Explorer',price:'9.00',currency:'EUR',checkout_status:'open',subscription_status:null};
const pending = (options={}) => harness({plans:[free,paid,high],billing:{checkout_allowed:false,resume_allowed:true,replace_allowed:true,replacement:null,attempt:{...original},reason:'Resume or choose another plan.'},...options});
const payment = tree => button(find(tree,n=>n.type==='Dialog'), 'Continue to Payment');

for (const context of [{},{workspace:true},{embedded:true}]) {
 test(`only matching card resumes in ${JSON.stringify(context)}`,async()=>{
  const app=await pending(context);const tree=app.render();
  assert.ok(button(card(tree,'free'),'Review Subscription'));
  const resume=button(card(tree,'explorer'),'Resume Checkout');assert.equal(resume.props.to,undefined);assert.equal(resume.props.disabled,false);
  const change=button(card(tree,'researcher'),'Upgrade to Researcher');assert.equal(change.props.disabled,false);assert.equal(change.props.to,undefined);
  resume.props.onClick();await tick();assert.deepEqual(app.resumes,[['old-attempt',null]]);assert.equal(app.requests.length,0);assert.equal(app.replacements.length,0);
 });
}
test('another plan opens review, not checkout, and cancellation leaves original untouched',async()=>{
 const app=await pending();button(app.render(),'Upgrade to Researcher').props.onClick();let tree=app.render();
 const dialog=find(tree,n=>n.type==='Dialog');assert.equal(dialog.props.open,true);
 assert.match(text(dialog),/Continuing replaces your unfinished checkout/);assert.match(text(dialog),/Explorer — Monthly/);
 assert.match(text(dialog),/Cancel leaves the existing checkout unchanged/);
 assert.equal(payment(tree).props.color,'success');assert.equal(payment(tree).props.variant,'contained');
 assert.equal(app.replacements.length,0);assert.equal(app.requests.length,0);
 button(dialog,'Cancel').props.onClick();assert.equal(find(app.render(),n=>n.type==='Dialog').props.open,false);
 assert.equal(app.replacements.length,0);assert.ok(button(app.render(),'Resume Checkout'));
});
test('confirmation binds exact source, target and interval while unrelated tabs change',async()=>{
 const app=await pending();app.interval('annual');button(app.render(),'Upgrade to Researcher').props.onClick();
 const content=text(find(app.render(),n=>n.type==='DialogContent'));
 app.interval('monthly');app.settings.plans=[free,{...paid},{...high,annual_price:'999.00',revision:8}];
 assert.equal(text(find(app.render(),n=>n.type==='DialogContent')),content);
 payment(app.render()).props.onClick();await tick();
 assert.deepEqual(app.replacements,[{code:'researcher',revision:7,interval:'annual',expected_attempt_id:'old-attempt'}]);
 assert.equal(app.requests.length,0);assert.equal(app.destinations[0],'https://checkout.stripe.com/replacement');
});
test('same tier different interval starts a replacement, never silently resumes Monthly',async()=>{
 const app=await pending();app.interval('annual');const tree=app.render();
 assert.ok(!nodes(card(tree,'explorer')).some(n=>n.type==='Button'&&text(n)==='Resume Checkout'));
 button(card(tree,'explorer'),'Upgrade to Explorer').props.onClick();payment(app.render()).props.onClick();await tick();
 assert.equal(app.replacements[0].interval,'annual');assert.equal(app.resumes.length,0);
});
test('old revision resumes with saved price clearly separate from new card terms',async()=>{
 const app=await pending({plans:[free,{...paid,revision:8,monthly_price:'14.00'},high]});const tree=app.render();
 assert.match(text(card(tree,'explorer')),/earlier terms differ/);assert.match(text(card(tree,'explorer')),/9/);
 button(card(tree,'explorer'),'Resume Checkout').props.onClick();await tick();assert.equal(app.resumes[0][0],'old-attempt');
});
test('unpublished original has a fallback resume without changing other card titles',async()=>{
 const app=await pending({plans:[free,high]});const tree=app.render();
 assert.ok(button(tree,'Resume Checkout'));assert.ok(button(card(tree,'researcher'),'Upgrade to Researcher'));
});
test('source changed in another tab disables stale confirmation without expiring it',async()=>{
 const app=await pending();button(app.render(),'Upgrade to Researcher').props.onClick();
 app.settings.billing.attempt={...original,id:'another-attempt'};
 const tree=app.render();assert.equal(payment(tree).props.disabled,true);assert.match(text(tree),/billing status has changed/);
 payment(tree).props.onClick();assert.equal(app.replacements.length,0);
});
test('new paid subscription, disabled billing or failed read never permits replacing it',async()=>{
 for(const alter of [app=>{app.settings.access={billing_type:'stripe'};},app=>{app.settings.billing.replace_allowed=false;},app=>{app.settings.accountError='offline';},app=>{app.settings.catalogueError='offline';}]) {
  const app=await pending();button(app.render(),'Upgrade to Researcher').props.onClick();alter(app);
  assert.equal(payment(app.render()).props.disabled,true);payment(app.render()).props.onClick();assert.equal(app.replacements.length,0);
 }
});
test('in-flight replacement blocks double clicks synchronously even without rerender',async()=>{
 let release;const pendingCheckout=new Promise(r=>release=r);const app=await pending({pendingCheckout});
 button(app.render(),'Upgrade to Researcher').props.onClick();const b=payment(app.render());b.props.onClick();b.props.onClick();
 assert.equal(app.replacements.length,1);assert.equal(payment(app.render()).props.disabled,true);release();await tick();
});
test('resume also blocks double clicks and uses the saved attempt id',async()=>{
 let release;const pendingCheckout=new Promise(r=>release=r);const app=await pending({pendingCheckout});
 const b=button(app.render(),'Resume Checkout');b.props.onClick();b.props.onClick();assert.equal(app.resumes.length,1);release();await tick();
});
test('failed replacement refreshes observations and reports failure without claiming expiration',async()=>{
 const app=await pending({checkoutFailure:true});button(app.render(),'Upgrade to Researcher').props.onClick();payment(app.render()).props.onClick();await tick();
 const tree=app.render();assert.equal(find(tree,n=>n.type==='Dialog').props.open,false);assert.match(text(tree),/could not start/);assert.deepEqual(app.refreshes,['account']);assert.equal(app.destinations.length,0);
});
test('unresolved replacement is recoverable but blocks unrelated replacement requests',async()=>{
 const app=await pending();app.settings.billing.replace_allowed=false;
 app.settings.billing.replacement={id:'intent-1',source_attempt_id:'old-attempt',code:'researcher',revision:7,plan_name:'Researcher',interval:'annual',price:'200.00',currency:'EUR'};
 let tree=app.render();assert.match(text(tree),/Verifying checkout replacement: Researcher — Yearly/);
 assert.equal(button(card(tree,'researcher'),'Upgrade to Researcher').props.disabled,true);
 button(tree,'Resume Checkout').props.onClick();await tick();assert.deepEqual(app.resumes,[['old-attempt','intent-1']]);
});
test('registration retains Free and can resume exact selection or choose a different plan',async()=>{
 const app=await pending({enrolment:true});const select=(code)=>find(app.render(),n=>n.props?.['aria-label']==='Registration plan').props.onChange({target:{value:code}});
 assert.equal(button(app.render(),'Continue with Free').props.disabled,false);
 select('explorer');button(app.render(),'Resume Checkout').props.onClick();await tick();assert.equal(app.resumes.length,1);
 select('researcher');button(app.render(),'Continue to Payment').props.onClick();payment(app.render()).props.onClick();await tick();assert.equal(app.replacements.length,1);
});
test('already-paid accounts still use paid plan-change actions, never checkout replacement',async()=>{
 const app=await harness({...paidAccount(),plans:[free,paid,high]});button(app.render(),'Upgrade to Researcher').props.onClick();
 assert.equal(app.selectedChanges[0].kind,'upgrade');assert.equal(app.replacements.length,0);assert.equal(app.requests.length,0);
});
test('missing identity never permits an ambiguous resume or replacement',()=>{
 const billing={checkout_allowed:false,resume_allowed:true,replace_allowed:true,attempt:{...original,id:null}};
 assert.equal(checkoutChoices.checkoutMatches(paid,'monthly',billing),false);
 assert.equal(checkoutChoices.canSelectCheckout({access:{billing_type:'free'},billing}),false);
});
test('saved-price formatting does not substitute the current catalogue for unknown terms',()=>{
 assert.match(checkoutChoices.savedCheckoutLabel({...original,price:null}),/Price unverified/);
 assert.match(checkoutChoices.savedCheckoutLabel({...original,price:'NaN'}),/Price unverified/);
});
