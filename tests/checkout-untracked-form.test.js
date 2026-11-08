const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {test} = require('node:test');
const source = fs.readFileSync('js/checkout.js','utf8');

function page() {
  const roots=new Map(),requests=[];
  function element(){const children=new Map();return {dataset:{},listeners:{},innerHTML:'',textContent:'',value:'',
    addEventListener(type,fn){(this.listeners[type] ||= []).push(fn);},
    querySelector(selector){if(/untracked-form|team-profile-form/.test(selector))return null;if(!children.has(selector))children.set(selector,element());return children.get(selector);},
    querySelectorAll(){return [];},insertAdjacentHTML(){}};}
  const document={querySelector(selector){if(!roots.has(selector))roots.set(selector,element());return roots.get(selector);},querySelectorAll(){return [];}};
  const window={sessionStorage:{getItem(){return null;},setItem(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){},
    async fetch(url,options){const data=JSON.parse(options.body);requests.push(data);return {ok:!window.fail,status:window.fail?503:201,async json(){return window.fail?{error:'Temporary save failure'}:detail;}};}};
  const detail={team:{id:2,name:'Return team',identifier:'return-team',memberNames:[]},inventory:[],orders:[],returns:[],returnCorrections:[],protectedInventory:[],returnInventory:[
    {componentId:7,name:'Servo <test>',category:'Motor',imageUrl:'/images/checkout/components/servo.webp',imageAlt:'Servo photo',version:3,mlhQuantity:0,physicalAvailable:5},
    {componentId:8,name:'MLH item',version:1,mlhQuantity:3,physicalAvailable:0}]};
  vm.runInNewContext(source.replace(/  initialize\(\);\s*\}\)\(\);\s*$/,`
    loadTeams=async function(){};loadAdminOverview=async function(){};
    window.hooks={state,renderTeamDetail,captureTeamDetailDraft,restoreTeamDetailDraft,teamDetailHasDraft,filterReturnPicker,setConfirm:function(fn){confirmAction=fn;}};
  })();`),{document,window,Intl});
  window.hooks.state.user={id:1,role:'admin'};window.hooks.state.selectedTeamId=2;window.hooks.setConfirm(async()=>true);
  const button={dataset:{untrackedOutcome:'hold'},textContent:'Add to Currently Holding'};
  const returnButton={dataset:{untrackedOutcome:'return'},textContent:'Return now'};
  const fields=Object.fromEntries(Object.entries({componentId:'7',quantity:'2',condition:'good',note:''}).map(([key,value])=>[key,{value}]));
  const pickerPanel={hidden:true},pickerValue={innerHTML:''},pickerEmpty={hidden:true},search={value:'',focus(){search.focused=true;}};
  const pickerButton={attributes:{'aria-expanded':'false'},focus(){form.focusedComponent=true;},setAttribute(key,value){this.attributes[key]=value;},closest(){return form;}};
  const options=[{dataset:{selectReturnComponent:'7',name:'Servo',version:'3',available:'5',held:'0',search:'servo motor'},innerHTML:'<img src="servo.webp"><strong>Servo</strong>'},
    {dataset:{selectReturnComponent:'9',name:'Resistor',version:'2',available:'9',held:'0',search:'resistor electronics'},innerHTML:'<strong>Resistor</strong>'}];
  options.forEach(option=>{option.closest=()=>form;option.focus=()=>{option.focused=true;};});
  const form={dataset:{teamId:'2'},hidden:true,elements:fields,
    querySelector(selector){
      const id=selector.match(/^\[data-select-return-component="(\d+)"\]$/);
      if(id)return options.find(o=>o.dataset.selectReturnComponent===id[1])||null;
      return {'button[type="submit"]':button,'[data-toggle-return-picker]':pickerButton,'[data-return-picker-panel]':pickerPanel,'[data-return-picker-value]':pickerValue,'[data-return-picker-search]':search,'[data-return-picker-empty]':pickerEmpty}[selector]||null;
    },querySelectorAll(selector){return selector==='[data-select-return-component]'?options:[...Object.values(fields),search];}};
  const toggle={attributes:{'aria-expanded':'false'},parentElement:{querySelector(){return form;}},setAttribute(key,value){this.attributes[key]=value;}};
  function click(selector,target){return Promise.all(document.querySelector('[data-team-detail]').listeners.click.map(fn=>fn({target:{closest:s=>s===selector?target:null}})));}
  return {...window.hooks,requests,window,detail,fields,form,button,toggle,pickerButton,pickerPanel,pickerValue,pickerEmpty,search,options,node:s=>document.querySelector(s),
    clickToggle(){return click('[data-toggle-untracked]',toggle);},clickPicker(){return click('[data-toggle-return-picker]',pickerButton);},choose(index){return click('[data-select-return-component]',options[index]);},
    key(key){let prevented=false;document.querySelector('[data-team-detail]').listeners.keydown.forEach(fn=>fn({key,preventDefault(){prevented=true;},target:{closest:()=>form,matches:()=>true}}));return prevented;},
    submit(outcome='hold'){return Promise.all(document.querySelector('[data-team-detail]').listeners.submit.map(fn=>fn({preventDefault(){},submitter:outcome==='return'?returnButton:button,target:{closest:s=>s==='[data-untracked-form]'?form:null}})));}};
}

test('the simple form offers catalog photos/categories and no new-component or stock-description fields',()=>{
  const ui=page();ui.renderTeamDetail(ui.detail);const html=ui.node('[data-team-detail]').innerHTML;
  assert.match(html,/type="button" data-toggle-untracked aria-expanded="false"/);
  assert.match(html,/<form id="checkout-untracked-2"[^>]* hidden>/);
  assert.match(html,/data-select-return-component="7"/);
  assert.match(html,/images\/checkout\/components\/thumbnails\/servo.webp/);
  assert.match(html,/Servo &lt;test&gt;/);assert.match(html,/>Motor<\/span>/);
  assert.doesNotMatch(html,/MLH item|Not in catalog|name="(?:newComponentName|description|stockMode|reason|outcome)"/);
  assert.match(html,/data-untracked-outcome="return">Return now/);
});

test('the add button opens the form and the photo dropdown selects an existing component without submitting',async()=>{
  const ui=page();await ui.clickToggle();assert.equal(ui.form.hidden,false);assert.equal(ui.form.focusedComponent,true);
  await ui.clickPicker();assert.equal(ui.pickerPanel.hidden,false);assert.equal(ui.search.focused,true);assert.equal(ui.pickerButton.attributes['aria-expanded'],'true');
  await ui.choose(1);assert.equal(ui.fields.componentId.value,'9');assert.equal(ui.pickerValue.innerHTML,ui.options[1].innerHTML);assert.equal(ui.pickerPanel.hidden,true);
  assert.equal(ui.pickerButton.attributes['aria-expanded'],'false');assert.equal(ui.requests.length,0);
  await ui.clickToggle();assert.equal(ui.form.hidden,true);
});

test('search matches category or name and handles no results',()=>{
  const ui=page();ui.search.value=' MOTOR ';ui.filterReturnPicker(ui.form);assert.equal(ui.options[0].hidden,false);assert.equal(ui.options[1].hidden,true);
  ui.search.value='absent';ui.filterReturnPicker(ui.form);assert.equal(ui.pickerEmpty.hidden,false);
  ui.search.value='';ui.filterReturnPicker(ui.form);assert.equal(ui.pickerEmpty.hidden,true);assert.ok(ui.options.every(o=>!o.hidden));
});

test('Enter in search chooses focus instead of submitting, and Escape closes the photo dropdown',async()=>{
  const ui=page();await ui.clickPicker();
  assert.equal(ui.key('Enter'),true);assert.equal(ui.options[0].focused,true);assert.equal(ui.requests.length,0);
  assert.equal(ui.key('Escape'),true);assert.equal(ui.pickerPanel.hidden,true);assert.equal(ui.pickerButton.attributes['aria-expanded'],'false');
});

test('open drafts and selected photos survive refresh and block polling, including during saves',async()=>{
  const ui=page(),container=ui.node('[data-team-detail]');container.dataset.teamDetailTeam='2';
  container.querySelector=s=>s==='[data-untracked-form]'?ui.form:s==='[data-toggle-untracked]'?ui.toggle:null;
  assert.equal(ui.teamDetailHasDraft(),false);await ui.clickToggle();await ui.choose(1);ui.fields.note.value='Verified in person';
  const draft=ui.captureTeamDetailDraft(container,2);assert.equal(ui.teamDetailHasDraft(),true);
  ui.form.hidden=true;ui.fields.note.value='';ui.fields.componentId.value='7';ui.restoreTeamDetailDraft(container,draft);
  assert.equal(ui.form.hidden,false);assert.equal(ui.fields.note.value,'Verified in person');assert.equal(ui.fields.componentId.value,'9');assert.equal(ui.pickerValue.innerHTML,ui.options[1].innerHTML);
  ui.form.dataset.saving='true';await ui.clickToggle();assert.equal(ui.form.hidden,false);ui.form.hidden=true;assert.equal(ui.teamDetailHasDraft(),true);
});

test('confirmation captures reviewed quantities and blocks double submissions',async()=>{
  const ui=page();let accept;ui.setConfirm(()=>new Promise(resolve=>{accept=resolve;}));const first=ui.submit();await ui.submit();assert.equal(ui.requests.length,0);
  ui.fields.quantity.value='99';accept(true);await first;assert.equal(ui.requests.length,1);assert.equal(ui.requests[0].quantity,2);assert.equal(ui.requests[0].componentId,7);
  assert.equal(Object.hasOwn(ui.requests[0],'newComponentName'),false);assert.equal(ui.button.disabled,false);assert.equal(ui.button.textContent,'Add to Currently Holding');
});

test('cancelled confirmation or changed account/team never submits',async()=>{
  for(const change of ['cancel','account','team']){const ui=page();let accept;ui.setConfirm(()=>new Promise(resolve=>{accept=resolve;}));const saving=ui.submit();
    if(change==='account')ui.state.user={id:9,role:'admin'};if(change==='team')ui.state.selectedTeamId=3;accept(change!=='cancel');await saving;assert.equal(ui.requests.length,0);}
});

test('failed saves retain the note and reuse idempotency keys',async()=>{
  const ui=page();ui.fields.note.value='Observed return';ui.window.fail=true;await ui.submit();assert.equal(ui.fields.note.value,'Observed return');assert.equal(ui.button.disabled,false);
  ui.window.fail=false;await ui.submit();assert.equal(ui.requests[0].idempotencyKey,ui.requests[1].idempotencyKey);
});

test('damaged returns need a note and shortage corrections match the confirmed quantity',async()=>{
  const ui=page();ui.fields.condition.value='damaged';await ui.submit('return');assert.equal(ui.requests.length,0);
  ui.fields.note.value='Broken connector';ui.fields.quantity.value='7';await ui.submit('return');assert.equal(ui.requests[0].approvedStockIncrease,2);assert.equal(ui.requests[0].outcome,'return');
  ui.fields.componentId.value='new';await ui.submit();assert.equal(ui.requests.length,1);
});

test('opening the form and confirming adds hardware through the real admin API and it returns normally',async()=>{
  delete process.env.DATABASE_URL;
  process.env.CHECKOUT_PGLITE_PATH='memory://';
  process.env.CHECKOUT_FORCE_LIVE='true';
  const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
  const {createSession}=require('../api/_lib/checkout-auth');
  const handler=require('../api/checkout');
  const db=await getDatabase();
  try {
    const admin=(await db.query("INSERT INTO checkout_users(username,password_hash,role,display_name) VALUES('admin-1','unused','admin','Test Volunteer') RETURNING *")).rows[0];
    await db.query("INSERT INTO checkout_teams(id,name,identifier) VALUES(2,'Return team','return-team')");
    await db.query("INSERT INTO checkout_components(id,name,description,category,compatibility,total_quantity,version,active) VALUES(7,'Servo','Test servo','Motor','N/A',10,3,FALSE)");
    let cookie;
    await createSession(db,{setHeader(key,value){cookie=value.split(';')[0];}},admin.id);
    const ui=page();ui.state.user={id:Number(admin.id),role:'admin'};
    ui.window.fetch=async(url,options)=>{
      const result=await new Promise((resolve,reject)=>handler({method:'POST',query:{},headers:{host:'localhost',origin:'http://localhost',cookie},body:JSON.parse(options.body)},
        {statusCode:200,setHeader(){},end(raw){resolve({status:this.statusCode,body:JSON.parse(raw)});}}).catch(reject));
      return {ok:result.status<400,status:result.status,async json(){return result.body;}};
    };
    await ui.clickToggle();assert.equal(ui.form.hidden,false);
    await ui.clickPicker();await ui.choose(0);
    await ui.submit();
    const html=ui.node('[data-team-detail]').innerHTML;
    assert.match(html,/Currently holding 2/);
    assert.match(html,/max="2" value="0" data-return-quantity/);
    assert.equal((await db.query('SELECT checked_out_quantity FROM checkout_team_inventory WHERE team_id=2 AND component_id=7')).rows[0].checked_out_quantity,2);
    const returned=await ui.window.fetch('/api/checkout',{body:JSON.stringify({action:'process-return',teamId:2,items:[{componentId:7,quantity:2,condition:'good',note:''}],idempotencyKey:'normal-return-after-ui-add'})});
    assert.equal(returned.status,201);
    ui.renderTeamDetail(await returned.json(),{preserveDraft:false});
    assert.match(ui.node('[data-team-detail]').innerHTML,/returned all checked-out hardware/);
    assert.equal((await db.query('SELECT checked_out_quantity FROM checkout_team_inventory WHERE team_id=2 AND component_id=7')).rows[0].checked_out_quantity,0);
    assert.equal((await db.query('SELECT COUNT(*)::integer AS n FROM checkout_orders')).rows[0].n,0);
  } finally {await resetDatabaseForTests();}
});
