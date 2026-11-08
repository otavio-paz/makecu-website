const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {test}=require('node:test');
const source=fs.readFileSync('js/checkout.js','utf8');
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function page(){
  const roots=new Map(),requests=[];
  function element(){const children=new Map();return {dataset:{},listeners:{},open:false,hidden:false,_html:'',_text:'',
    get innerHTML(){return this._html;},set innerHTML(value){this._html=value;this._text=value;},get textContent(){return this._text;},set textContent(value){this._text=value;this._html=value;},
    querySelector(selector){if(!children.has(selector))children.set(selector,element());return children.get(selector);},querySelectorAll(){return [];},
    addEventListener(type,fn){(this.listeners[type] ||= []).push(fn);},insertAdjacentHTML(){},showModal(){this.open=true;},close(){this.open=false;}};}
  const document={querySelector(selector){if(!roots.has(selector))roots.set(selector,element());return roots.get(selector);},querySelectorAll(){return [];}};
  const form=document.querySelector('[data-component-form]');
  for(const field of ['id','expectedVersion','name','description','imageUrl','imageAlt','category','compatibility','arduinoGuidance','raspberryPiGuidance','binLocation','technicalSpecs','totalQuantity','mlhQuantity','unavailableQuantity','protectedStock','maxActivePerTeam','adminNotes','changeReason','active'])form[field]={value:'',checked:false};
  form.reset=()=>{};
  let respond=async data=>({componentId:data.componentId,teams:[{teamId:2,teamName:'Example Team',identifier:'team-2',quantity:3}],totalHeldQuantity:3});
  const window={sessionStorage:{getItem(){return null;},setItem(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},
    async fetch(url,options){const data=JSON.parse(options.body);requests.push(data);const body=await respond(data);return {ok:!body.error,status:body.error?503:200,async json(){return body;}};}};
  vm.runInNewContext(source.replace(/  initialize\(\);\s*\}\)\(\);\s*$/,'window.hooks={state,openComponentForm,loadComponentHoldings,setSession};})();'),{document,window,Intl});
  window.hooks.state.user={id:1,role:'admin'};
  const node=s=>document.querySelector(s);
  return {...window.hooks,form,requests,node,respond(fn){respond=fn;},async open(component){window.hooks.openComponentForm(component);await settle();},
    async refresh(){await Promise.all(node('[data-refresh-component-holdings]').listeners.click.map(fn=>fn()));await settle();}};
}
const component=id=>({id,name:'Board '+id,version:1,totalQuantity:10,mlhQuantity:0,unavailableQuantity:0,protectedStock:0,active:true,relationships:[]});

test('opening inventory edit shows per-team quantities and refresh does not alter unsaved fields',async()=>{
  const ui=page();await ui.open(component(7));
  assert.equal(ui.node('[data-component-holdings]').hidden,false);
  assert.deepEqual(ui.requests[0],{action:'component-holdings',componentId:7});
  assert.match(ui.node('[data-component-holdings-body]').innerHTML,/Example Team/);
  assert.match(ui.node('[data-component-holdings-body]').innerHTML,/@team-2/);
  assert.match(ui.node('[data-component-holdings-body]').innerHTML,/<td>3<\/td>/);
  ui.form.name.value='Unsaved edit';ui.form.totalQuantity.value=17;
  ui.respond(async()=>({teams:[{teamName:'Example Team',identifier:'team-2',quantity:1}],totalHeldQuantity:1}));await ui.refresh();
  assert.match(ui.node('[data-component-holdings-body]').innerHTML,/<td>1<\/td>/);
  assert.equal(ui.form.name.value,'Unsaved edit');assert.equal(ui.form.totalQuantity.value,17);
});

test('no holdings, failed loads, retry and escaped team names are displayed safely',async()=>{
  const ui=page();ui.respond(async()=>({teams:[],totalHeldQuantity:0}));await ui.open(component(7));
  assert.match(ui.node('[data-component-holdings-body]').textContent,/No teams are currently holding/);
  ui.respond(async()=>({error:'Temporary failure'}));await ui.refresh();
  assert.match(ui.node('[data-component-holdings-body]').textContent,/Could not load team holdings.*Refresh/);
  assert.equal(ui.node('[data-refresh-component-holdings]').disabled,false);
  ui.respond(async()=>({teams:[{teamName:'<script>bad</script>',identifier:'x&y',quantity:2}],totalHeldQuantity:2}));await ui.refresh();
  assert.match(ui.node('[data-component-holdings-body]').innerHTML,/&lt;script&gt;bad&lt;\/script&gt;/);
  assert.match(ui.node('[data-component-holdings-body]').innerHTML,/@x&amp;y/);
  assert.doesNotMatch(ui.node('[data-component-holdings-body]').innerHTML,/<script>/);
});

test('an older component request cannot overwrite a newly selected component',async()=>{
  const ui=page();let first;
  ui.respond(data=>data.componentId===7?new Promise(resolve=>{first=resolve;}):Promise.resolve({teams:[{teamName:'New team',identifier:'new',quantity:1}],totalHeldQuantity:1}));
  await ui.open(component(7));await ui.open(component(8));
  first({teams:[{teamName:'Old team',identifier:'old',quantity:9}],totalHeldQuantity:9});await settle();
  const html=ui.node('[data-component-holdings-body]').innerHTML;
  assert.match(html,/New team/);assert.doesNotMatch(html,/Old team/);
});

test('creating a component hides holdings and ignores pending old responses',async()=>{
  const ui=page();let first;ui.respond(()=>new Promise(resolve=>{first=resolve;}));
  await ui.open(component(7));await ui.open(null);
  first({teams:[{teamName:'Old team',identifier:'old',quantity:9}],totalHeldQuantity:9});await settle();
  assert.equal(ui.node('[data-component-holdings]').hidden,true);
  assert.equal(ui.node('[data-component-holdings-body]').innerHTML,'');assert.equal(ui.requests.length,1);
});

test('logout clears holdings, closes the editor and discards pending private results',async()=>{
  const ui=page();let first;ui.respond(()=>new Promise(resolve=>{first=resolve;}));await ui.open(component(7));ui.setSession(null);
  first({teams:[{teamName:'Private team',identifier:'private',quantity:9}],totalHeldQuantity:9});await settle();
  assert.equal(ui.node('[data-component-dialog]').open,false);assert.equal(ui.node('[data-component-holdings]').hidden,true);
  assert.equal(ui.node('[data-component-holdings-body]').innerHTML,'');
});
