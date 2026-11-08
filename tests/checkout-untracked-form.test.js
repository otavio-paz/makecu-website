const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const source = fs.readFileSync('js/checkout.js','utf8');

function page() {
  const roots = new Map(), requests = [];
  function element() {
    const children = new Map();
    return {dataset:{},listeners:{},innerHTML:'',textContent:'',value:'',
      addEventListener(type, fn) {(this.listeners[type] ||= []).push(fn);},
      querySelector(selector) {
        if (/untracked-form|team-profile-form/.test(selector)) return null;
        if (!children.has(selector)) children.set(selector,element());
        return children.get(selector);
      },querySelectorAll(){return [];},insertAdjacentHTML(){}};
  }
  const document = {querySelector(selector){if (!roots.has(selector)) roots.set(selector,element());return roots.get(selector);},querySelectorAll(){return [];}};
  const window = {sessionStorage:{getItem(){return null;},setItem(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},
    async fetch(url,options){
      const data=JSON.parse(options.body);requests.push(data);
      return {ok: !window.fail,status:window.fail?503:201,async json(){return window.fail?{error:'Temporary save failure'}:detail;}};
    }};
  const detail = {team:{id:2,name:'Return team',identifier:'return-team',memberNames:[]},inventory:[],orders:[],returns:[],returnCorrections:[],protectedInventory:[],returnInventory:[
    {componentId:7,name:'Servo <test>',version:3,mlhQuantity:0,physicalAvailable:5},
    {componentId:8,name:'MLH item',version:1,mlhQuantity:3,physicalAvailable:0}]};
  vm.runInNewContext(source.replace(/  initialize\(\);\s*\}\)\(\);\s*$/, `
    loadTeams=async function(){}; loadAdminOverview=async function(){};
    window.hooks={state,renderTeamDetail,setConfirm:function(fn){confirmAction=fn;}};
  })();`),{document,window,Intl});
  window.hooks.state.user={id:1,role:'admin'};
  window.hooks.state.selectedTeamId=2;
  window.hooks.setConfirm(async()=>true);
  const button={dataset:{},textContent:'Review and record item'};
  const fields=Object.fromEntries(Object.entries({componentId:'7',quantity:'2',reason:'Recovered handout',stockMode:'counted',newComponentName:'',description:'',outcome:'hold',condition:'good',note:''}).map(([key,value])=>[key,{value}]));
  fields.componentId.options=[{textContent:'Servo',dataset:{version:'3',available:'5',held:'0'}}];
  fields.componentId.selectedIndex=0;
  const form={dataset:{teamId:'2'},elements:fields,querySelector(){return button;}};
  return {...window.hooks,requests,window,detail,fields,form,button,node:selector=>document.querySelector(selector),
    submit(){return Promise.all(document.querySelector('[data-team-detail]').listeners.submit.map(fn=>fn({preventDefault(){},target:{closest:selector=>selector==='[data-untracked-form]'?form:null}})));}};
}

test('admin returns show the add action even with no holdings, including disabled inventory but excluding MLH',()=>{
  const ui=page();ui.renderTeamDetail(ui.detail);
  const html=ui.node('[data-team-detail]').innerHTML;
  assert.match(html,/Add untracked component to this team/);
  assert.match(html,/data-untracked-form/);
  assert.match(html,/Servo &lt;test&gt;/);
  assert.doesNotMatch(html,/MLH item/);
  assert.match(html,/Not in catalog/);
});

test('confirmation captures the reviewed values and prevents repeated submissions',async()=>{
  const ui=page();let accept;
  ui.setConfirm(()=>new Promise(resolve=>{accept=resolve;}));
  const first=ui.submit();await ui.submit();
  assert.equal(ui.requests.length,0);
  ui.fields.quantity.value='99';ui.fields.reason.value='Changed while confirming';
  accept(true);await first;
  assert.equal(ui.requests.length,1);
  assert.equal(ui.requests[0].action,'record-untracked-item');
  assert.equal(ui.requests[0].quantity,2);
  assert.equal(ui.requests[0].reason,'Recovered handout');
  assert.equal(ui.button.disabled,false);
  assert.equal(ui.button.textContent,'Review and record item');
});

test('cancelled confirmation, a changed account or a changed team never submits',async()=>{
  for(const change of ['cancel','account','team']){
    const ui=page();let accept;
    ui.setConfirm(()=>new Promise(resolve=>{accept=resolve;}));
    const saving=ui.submit();
    if(change==='account')ui.state.user={id:9,role:'admin'};
    if(change==='team')ui.state.selectedTeamId=3;
    accept(change!=='cancel');await saving;
    assert.equal(ui.requests.length,0,change);
    assert.equal(ui.button.disabled,false);
  }
});

test('failed saves retain entered fields and reuse the same idempotency key on retry',async()=>{
  const ui=page();ui.window.fail=true;
  await ui.submit();assert.equal(ui.fields.reason.value,'Recovered handout');
  assert.equal(ui.button.disabled,false);
  assert.equal(ui.node('[data-toast]').textContent,'Temporary save failure');
  ui.window.fail=false;await ui.submit();
  assert.equal(ui.requests.length,2);
  assert.equal(ui.requests[0].idempotencyKey,ui.requests[1].idempotencyKey);
});

test('damaged returns require a note, and approved shortage corrections match the reviewed quantity',async()=>{
  const ui=page();ui.fields.outcome.value='return';ui.fields.condition.value='damaged';
  await ui.submit();assert.equal(ui.requests.length,0);
  ui.fields.note.value='Broken connector';ui.fields.quantity.value='7';ui.fields.stockMode.value='shortfall';
  await ui.submit();assert.equal(ui.requests[0].approvedStockIncrease,2);
  assert.equal(ui.requests[0].outcome,'return');assert.equal(ui.requests[0].note,'Broken connector');
});
