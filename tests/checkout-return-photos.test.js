const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync('js/checkout.js', 'utf8');

function page() {
  const roots = new Map();
  function element() {
    const children = new Map();
    return { dataset:{}, listeners:{}, innerHTML:'', textContent:'', value:'', open:false,
      addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); },
      querySelector(selector) {
        if (/untracked-form|team-profile-form|checkout-protected-order/.test(selector)) return null;
        if (!children.has(selector)) children.set(selector, element());
        return children.get(selector);
      },
      querySelectorAll() { return []; }, insertAdjacentHTML() {},
      showModal() { this.open = true; }, close() { this.open = false; }
    };
  }
  const document = {querySelector(selector) { if (!roots.has(selector)) roots.set(selector, element()); return roots.get(selector); },querySelectorAll() {return [];} };
  const window = {sessionStorage:{getItem(){return null;},setItem(){}},setInterval(){},clearInterval(){},setTimeout(){},clearTimeout(){}};
  vm.runInNewContext(source.replace(/  initialize\(\);\s*\}\)\(\);\s*$/, 'window.hooks={state,renderTeamDetail};})();'), {document,window,Intl});
  window.hooks.state.user = {id:1,role:'admin'};
  return {...window.hooks,node:selector=>document.querySelector(selector),
    click(target) {return Promise.all(document.querySelector('[data-team-detail]').listeners.click.map(fn=>fn({target})));}
  };
}
function detail(inventory) {
  return {team:{id:2,name:'Example team',identifier:'example',memberNames:[],profileVersion:0},inventory,
    orders:[],returns:[],returnCorrections:[],returnInventory:[],protectedInventory:[]};
}
const component = {componentId:14,name:'Servo',category:'Motor',checkedOutQuantity:2,
  imageUrl:'/images/checkout/components/servo.webp',imageAlt:'Servo with mounting horn'};

test('return rows show a photo, category tag and unchanged return quantity controls', () => {
  const ui = page();ui.renderTeamDetail(detail([component]));
  const html = ui.node('[data-team-detail]').innerHTML;
  assert.match(html,/src="\/images\/checkout\/components\/thumbnails\/servo.webp"/);
  assert.match(html,/alt="Servo with mounting horn"/);
  assert.match(html,/class="checkout-tag checkout-tag-tone-4">Motor<\/span>/);
  assert.match(html,/type="button" data-preview-component="14"/);
  assert.match(html,/max="2" value="0" data-return-quantity/);
  assert.match(html,/data-return-condition/);
});

test('photo clicks open the original image without loading the inventory tab or submitting a return', async () => {
  const ui = page();ui.renderTeamDetail(detail([component]));
  assert.equal(ui.state.components.length,0);
  const preview = {dataset:{imageName:component.name,imageUrl:component.imageUrl,imageAlt:component.imageAlt}};
  await ui.click({closest:selector=>selector==='[data-preview-component]'?preview:null});
  const dialog = ui.node('[data-image-dialog]');
  assert.equal(dialog.open,true);
  assert.equal(dialog.querySelector('[data-image-dialog-image]').src,component.imageUrl);
  assert.equal(dialog.querySelector('[data-image-dialog-image]').alt,component.imageAlt);
  assert.equal(dialog.querySelector('[data-image-dialog-title]').textContent,'Servo');
  await Promise.all(dialog.listeners.click.map(fn=>fn({target:dialog})));
  assert.equal(dialog.open,false);
});

test('pending and missing images remain non-clickable, and names and categories are escaped', () => {
  for (const imageUrl of ['', '/images/checkout-image-pending.svg']) {
    const ui = page();ui.renderTeamDetail(detail([{...component,imageUrl,name:'<script>test</script>',category:'Sensor & Tool'}]));
    const html = ui.node('[data-team-detail]').innerHTML;
    assert.doesNotMatch(html,/data-preview-component=/);
    assert.doesNotMatch(html,/<script>/);
    assert.match(html,/&lt;script&gt;test&lt;\/script&gt;/);
    assert.match(html,/Sensor &amp; Tool/);
    assert.match(html,/Currently holding 2/);
  }
});

test('team return details include the catalog photo, alt text and category for disabled held components', async () => {
  delete process.env.DATABASE_URL;
  process.env.CHECKOUT_PGLITE_PATH='memory://';
  const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
  const service=require('../api/_lib/checkout-service');
  const db=await getDatabase();
  try {
    const team=(await db.query("INSERT INTO checkout_teams(name,identifier) VALUES('Photo team','photo-team') RETURNING id")).rows[0];
    const part=(await db.query(`INSERT INTO checkout_components(name,image_url,image_alt,category,compatibility,total_quantity,checked_out_quantity,active)
      VALUES('Servo','/photo.webp','Detailed servo photo','Motor','N/A',2,2,FALSE) RETURNING id`)).rows[0];
    await db.query('INSERT INTO checkout_team_inventory(team_id,component_id,checked_out_quantity) VALUES($1,$2,2)',[team.id,part.id]);
    const result=await service.teamAdminDetail(db,Number(team.id));
    assert.equal(result.inventory[0].imageUrl,'/photo.webp');
    assert.equal(result.inventory[0].imageAlt,'Detailed servo photo');
    assert.equal(result.inventory[0].category,'Motor');
    assert.equal(result.inventory[0].checkedOutQuantity,2);
    const option = result.returnInventory.find(item => item.componentId === Number(part.id));
    assert.equal(option.imageUrl,'/photo.webp');
    assert.equal(option.imageAlt,'Detailed servo photo');
    assert.equal(option.category,'Motor');
  } finally {await resetDatabaseForTests();}
});
