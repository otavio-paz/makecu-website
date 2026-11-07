const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/checkout.js','utf8');
function page(storage=new Map()){
  const elements=new Map(),pending=[];
  function element(){return {hidden:true,value:'',checked:false,dataset:{},textContent:'',innerHTML:'',listeners:{},insertAdjacentHTML(){},addEventListener(event,fn){this.listeners[event]=fn;},querySelector(){return element();},querySelectorAll(){return [];}};}
  const document={querySelector(selector){if(!elements.has(selector))elements.set(selector,element());return elements.get(selector);},querySelectorAll(){return [];}};
  const window={sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout(){},clearTimeout(){},setInterval(){},clearInterval(){},async fetch(url,options){const action=JSON.parse(options.body).action;const result=action==='catalog'?{components:[]}:await new Promise(resolve=>pending.push(resolve));return {ok:true,json:async()=>result};}};
  vm.runInNewContext(source.replace(/  initialize\(\);\s*\}\)\(\);\s*$/,'window.hooks={state,setSession,detectOrderUpdates,loadTeamData};})();'),{window,document,Intl});
  window.hooks.setSession({id:1,role:'team'});
  return {...window.hooks,storage,pending,node:s=>document.querySelector(s),dismiss:()=>document.querySelector('[data-dismiss-order-updates]').listeners.click()};
}
const order=status=>({id:4,receiptCode:'O-00004',status,createdAt:'2026-11-07T16:00:00Z',items:[]});
test('teams receive one notification per observed change, with a persistent pickup message',()=>{
  const ui=page();
  ui.detectOrderUpdates([order('submitted')]);
  assert.equal(ui.node('[data-toast]').hidden,true);
  for(const status of ['reviewing','accepted','ready'])ui.detectOrderUpdates([order(status)]);
  const list=ui.node('[data-team-order-update-list]').innerHTML;
  assert.match(list,/O-00004 is ready for pickup at the hardware desk/);
  assert.equal((list.match(/<li>/g)||[]).length,3);
  ui.detectOrderUpdates([order('ready')]);
  assert.equal(ui.node('[data-team-order-update-list]').innerHTML,list);
  ui.dismiss();
  ui.detectOrderUpdates([order('ready')]);
  assert.equal(ui.node('[data-team-order-updates]').hidden,true);
  ui.detectOrderUpdates([order('picked_up')]);
  assert.match(ui.node('[data-toast]').textContent,/Picked Up/);
});
test('updates survive refresh, changes while away are detected, and other accounts cannot see them',()=>{
  const first=page();first.detectOrderUpdates([order('submitted')]);first.detectOrderUpdates([order('accepted')]);
  const reloaded=page(first.storage);reloaded.detectOrderUpdates([order('ready')]);
  assert.match(reloaded.node('[data-team-order-update-list]').innerHTML,/Accepted/);
  assert.match(reloaded.node('[data-team-order-update-list]').innerHTML,/ready for pickup/);
  reloaded.setSession({id:2,role:'team'});reloaded.detectOrderUpdates([order('cancelled')]);
  assert.equal(reloaded.node('[data-team-order-updates]').hidden,true);
  assert.equal(reloaded.node('[data-team-order-update-list]').innerHTML,'');
  reloaded.setSession({id:1,role:'admin'});reloaded.detectOrderUpdates([order('picked_up')]);
  assert.equal(reloaded.node('[data-toast]').hidden,true);
  assert.equal(reloaded.node('[data-team-order-updates]').hidden,true);
});
test('notification content is escaped and multiple changes appear together',()=>{
  const ui=page();ui.detectOrderUpdates([order('submitted'),{...order('submitted'),id:5}]);
  ui.detectOrderUpdates([{...order('ready'),receiptCode:'<img onerror=alert(1)>'},{...order('cancelled'),id:5,receiptCode:'O-00005'}]);
  assert.doesNotMatch(ui.node('[data-team-order-update-list]').innerHTML,/<img/);
  assert.match(ui.node('[data-team-order-update-list]').innerHTML,/&lt;img/);
  assert.match(ui.node('[data-toast]').textContent,/Cancelled/);
});
test('old polling responses and responses after logout do not produce notifications',async()=>{
  const ui=page();ui.detectOrderUpdates([order('submitted')]);
  const old=ui.loadTeamData(true),fresh=ui.loadTeamData(true);
  ui.pending[1]({orders:[order('ready')],inventory:[],cooldownSeconds:0});await fresh;
  ui.pending[0]({orders:[order('accepted')],inventory:[],cooldownSeconds:0});await old;
  assert.doesNotMatch(ui.node('[data-team-order-update-list]').innerHTML,/Accepted/);
  assert.equal(ui.state.dashboard.orders[0].status,'ready');
  const afterLogout=ui.loadTeamData(true);ui.setSession(null);
  ui.pending[2]({orders:[order('cancelled')],inventory:[],cooldownSeconds:0});await afterLogout;
  assert.equal(ui.node('[data-toast]').hidden,true);
  assert.equal(ui.node('[data-team-order-updates]').hidden,true);
});
