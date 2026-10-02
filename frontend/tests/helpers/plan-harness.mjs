import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
const jsx = (type, props, key) => ({type, props: props ?? {}, key});
export async function load(path, dependencies = {}, globals = {}) {
  const source = await readFile(new URL('../../src/' + path, import.meta.url), 'utf8');
  const result = ts.transpileModule(source, {fileName:path, reportDiagnostics:true, compilerOptions:{
    module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022, jsx:ts.JsxEmit.ReactJSX,
  }});
  assert.equal(result.diagnostics?.length ?? 0, 0);
  const module = {exports:{}};
  runInNewContext(result.outputText, {module,exports:module.exports,URLSearchParams,Date,...globals,require(name){
    if (name === 'react/jsx-runtime') return {jsx,jsxs:jsx,Fragment:'Fragment'};
    if (name === '@mui/material') return new Proxy({}, {get:(_,key)=>key});
    if (name in dependencies) return dependencies[name];
    throw Error(`Unexpected dependency ${name}`);
  }});
  return module.exports;
}
export const plain = value => JSON.parse(JSON.stringify(value));
export function nodes(n){return Array.isArray(n)?n.flatMap(nodes):n?.props?[n,...nodes(n.props.children)]:[];}
export function text(n){return Array.isArray(n)?n.map(text).join(''):n==null||typeof n==='boolean'?'':typeof n==='object'?text(n.props?.children):String(n);}
export const find = (tree, fn) => {const n=nodes(tree).find(fn); assert.ok(n,'Expected element');return n;};
export const button = (tree,label) => find(tree,n=>n.type==='Button'&&text(n)===label);
export const card = (tree,code)=>find(tree,n=>n.props.component==='section'&&n.key===code);
export const tick = ()=>new Promise(resolve=>setImmediate(resolve));
let instance=0;
export function hooks(){
  const slots=[]; let cursor=0; const effects=[];
  return {react:{
    useId(){const i=cursor++;return slots[i]??=`test-${instance}-${i}`;},
    useCallback:fn=>fn,
    useRef(initial){const i=cursor++; return slots[i]??=( {current:initial} );},
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;
      return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useEffect(fn,deps){const i=cursor++;if(!slots[i]||deps.some((v,j)=>v!==slots[i][j]))effects.push(fn);slots[i]=deps;},
  },reset(){cursor=0;instance++;},flush(){for(const fn of effects.splice(0))fn();}};
}
export const subscription = await load('subscriptionPresentation.ts');
export const choices = await load('planChoices.ts',{'./subscriptionPresentation':subscription});
export const presentation = await load('planPresentation.ts');
export const checkoutChoices = await load('checkoutChoices.ts');
export const paid = {
  code:'explorer', name:'Explorer', revision:7, billing_type:'stripe', currency:'EUR', monthly_price:'9.00', annual_price:'90.00',
  description:'Follow research', tax_display:'inclusive',max_digests:2,max_papers_per_run:20,papers_per_month:50,runs_per_month:5,
  manual_runs_per_month:1,schedule_frequencies:['weekly','monthly'],email_delivery:true,
};
export const free = {...paid,code:'free',name:'Free',billing_type:'free',monthly_price:'0.00',annual_price:null,max_digests:1};
export const high = {...paid,code:'researcher',name:'Researcher',monthly_price:'20.00',annual_price:'200.00',max_digests:5,runs_per_month:10,papers_per_month:100,manual_runs_per_month:5};
export const low = {...paid,code:'basic',name:'Basic',monthly_price:'5.00',annual_price:'50.00',max_digests:1,runs_per_month:3,papers_per_month:30};
export const option = (p,interval='monthly')=>({code:p.code,revision:p.revision,name:p.name,interval,price:interval==='annual'?p.annual_price:p.monthly_price,currency:p.currency,
  max_digests:p.max_digests,max_papers_per_run:p.max_papers_per_run,papers_per_month:p.papers_per_month,runs_per_month:p.runs_per_month,
  manual_runs_per_month:p.manual_runs_per_month,schedule_frequencies:p.schedule_frequencies,email_delivery:p.email_delivery});
export function paidAccount(){return {
  access:{billing_type:'stripe',allowed:true,checkout_id:'checkout',plan:{id:7,name:'Explorer',configuration:paid}},
  billing:{checkout_allowed:false,attempt:{code:'explorer',revision:7,interval:'monthly',subscription_status:'active'},period_end:'2030-12-01T00:00:00Z',cancel_at_period_end:false,cancel_allowed:true},
  upgrades:{items:[option(high)],upgrade:null,reason:''},
  changes:{items:[option(low),option(paid,'annual')],change:null,digests:[{id:'one',topic:'Oceanography'},{id:'two',topic:'Astrophysics'}],effective_at:'2030-12-01T00:00:00Z',reason:''},
  freeDigests:{available:true,plan_name:'Free',limit:1,selected_ids:['one'],items:[]},
};}
export function quote(){return {id:'quote-1',state:'preview',plan_name:'Researcher',interval:'monthly',recurring_price:'20.00',currency:'eur',
  credit:200,charge:800,amount_due:600,proration_at:'2030-11-15T00:00:00Z',period_end:'2030-12-01T00:00:00Z',expires_at:'2099-11-15T00:10:00Z',
  pending_until:null,error:null,confirm_allowed:true,retry_allowed:false,payment_allowed:false,limits:high};}
export async function harness(options={}){
  const settings={plans:[free,paid],enrolment:false,workspace:false,user:{id:'user'},isInitializing:false,
    access:{billing_type:'free'},billing:{checkout_allowed:true,resume_allowed:false,attempt:null,reason:''},
    catalogueError:'',accountError:'',sandbox:false,accountLoading:false,...options};
  const requests=[],destinations=[],refreshes=[],selectedChanges=[],replacements=[],resumes=[];const state=hooks();
  const api={plans(){},enrolmentPlans(){},async checkout(body){requests.push(body);if(settings.checkoutFailure)throw Error('provider error');
    if(settings.pendingCheckout)await settings.pendingCheckout;return {url:'https://checkout.stripe.com/example'};},
    async replaceCheckout(body){replacements.push(plain(body));if(settings.checkoutFailure)throw Error('provider error');if(settings.pendingCheckout)await settings.pendingCheckout;return {url:'https://checkout.stripe.com/replacement'};},
    async resumeCheckout(id,replacementId=null){resumes.push([id,replacementId]);if(settings.checkoutFailure)throw Error('provider error');if(settings.pendingCheckout)await settings.pendingCheckout;return {url:'https://checkout.stripe.com/resumed'};}
  };
  const definitions = await load('pages/PlansPage.tsx',{
    react:state.react,'react-router-dom':{Link:'Link',Navigate:'Navigate',useNavigate:()=> (...args)=>destinations.push(args)},
    '../components/ResourceNotice':{ResourceNotice:'ResourceNotice'},'../components/MarketingHeader':{MarketingHeader:'MarketingHeader'},
    '../components/AppHeader':{AppHeader:'AppHeader'},'../components/BillingIntervalTabs':{BillingIntervalTabs:'BillingIntervalTabs'},
    '../auth/AuthContext':{useAuth:()=>({user:settings.user,isInitializing:settings.isInitializing})},'../api/client':{ApiError:class extends Error{}},
    '../api/subscriptions':{subscriptionsApi:api},'../checkoutChoices':checkoutChoices,'../subscriptionPresentation':subscription,'../planPresentation':presentation,'../planChoices':choices,
    '../components/PlanChangeDialog':{usePlanChangeDialog:()=>({busy:false,choose:choice=>selectedChanges.push(choice),dialog:null,status:null})},
    '../components/SubscriptionData':{useSubscription:()=>({...settings,perform:async fn=>fn(),refresh:async()=>{}})},
    '../hooks/usePollingResource':{usePollingResource(loader){const catalogue=loader===api.plans||loader===api.enrolmentPlans;
      return catalogue?{data:settings.plans===null?null:{items:settings.plans,sandbox:settings.sandbox},error:settings.catalogueError,refresh:async()=>refreshes.push('catalogue')}:
        {data:settings.user&&!settings.accountLoading?{billing:settings.billing,access:settings.access,changes:settings.changes,upgrades:settings.upgrades,freeDigests:settings.freeDigests}:null,
          loading:settings.accountLoading,error:settings.accountError,refresh:async()=>refreshes.push('account')};}},
  },{window:{location:{assign:url=>destinations.push(url)}}});
  return {settings,requests,destinations,refreshes,selectedChanges,replacements,resumes,render(){state.reset();const page=settings.embedded?definitions.SubscriptionPlanCatalogue():definitions.PlansPage(settings);return page.type(page.props);},
    interval(value){find(this.render(),n=>n.type==='BillingIntervalTabs').props.onChange(value);}};
}
export async function dialogHarness(options={}){
  const settings={account:paidAccount(),disabled:false,...options};const state=hooks();const calls=[],urls=[];
  const api=new Proxy({}, {get:(_,name)=>async(...args)=>{calls.push([name,...plain(args)]);
    if(settings.handlers?.[name])return settings.handlers[name](...args);
    if(name==='previewUpgrade'){const q=quote();settings.account.upgrades.upgrade=q;return q;}
    if(name==='upgradeAction'){const q={...quote(),state:'applied',confirm_allowed:false};settings.account.upgrades.upgrade=q;return q;}
    if(name==='schedule'){const c={id:'change',state:'scheduled',plan_name:'Basic',price:'5',currency:'eur',interval:'monthly',effective_at:settings.account.changes.effective_at,undo_allowed:true,retry_allowed:false};settings.account.changes.change=c;settings.account.changes.items=[];return c;}
    return {url:'https://billing.stripe.com/test'};}});
  const {usePlanChangeDialog}=await load('components/PlanChangeDialog.tsx',{
    react:state.react,'react-router-dom':{Link:'Link'},'../api/client':{ApiError:class extends Error{}},'../api/subscriptions':{subscriptionsApi:api},'../planChoices':choices,
  },{window:{location:{assign:url=>urls.push(url)}}});
  return {settings,calls,urls,render(){state.reset();const result=usePlanChangeDialog(settings.account,settings.disabled,async action=>action());state.flush();return result;}};
}
