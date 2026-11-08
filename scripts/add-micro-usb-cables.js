const fs=require('node:fs');
const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
const service=require('../api/_lib/checkout-service');
const component={
  name:'Micro-USB to USB-A Cable',
  description:'Cable with a USB-A plug and a Micro-USB (Micro-B) plug for compatible development boards and devices. Match the device connector before use.',
  imageUrl:'/images/checkout/components/micro-usb-to-usb-a-cable.webp',
  imageAlt:'Black USB-A to Micro-USB cable from the organizer-provided photo',
  category:'Electronics',compatibility:'Arduino + Raspberry Pi',
  arduinoGuidance:'For boards with a Micro-USB connector; not Mini-USB or USB-C.',
  raspberryPiGuidance:'Use with devices that accept a Micro-USB connection.',
  binLocation:'',technicalSpecs:'USB-A male to Micro-USB Micro-B male connectors.',
  totalQuantity:6,mlhQuantity:0,unavailableQuantity:0,protectedStock:0,maxActivePerTeam:1,active:true,
  adminNotes:'Organizer confirmed November 8, 2026: 6 cables, maximum 1 per team, 0 protected stock. Photo provided by organizer.'
};
async function main(){
  if(process.argv.includes('--catalog')){
    const filename='db/checkout-catalog.json';
    const catalog=JSON.parse(fs.readFileSync(filename,'utf8'));
    const index=catalog.components.findIndex(c=>c.name===component.name);
    if(index<0)catalog.components.push(component);else catalog.components[index]={...catalog.components[index],...component};
    catalog.components.sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
    fs.writeFileSync(filename,JSON.stringify(catalog,null,2)+'\n');
    return;
  }
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
  try{
    const db=await getDatabase();
    const actor=(await db.query("SELECT id,role,username,display_name FROM checkout_users WHERE active=TRUE AND role='admin' ORDER BY id LIMIT 1")).rows[0];
    if(!actor)throw new Error('Active admin required.');
    const matches=(await service.catalog(db,actor,true)).filter(c=>c.name===component.name);
    if(matches.length>1)throw new Error('Multiple matching cables; review before updating.');
    const current=matches[0];
    if(current&&Object.keys(component).every(key=>JSON.stringify(component[key])===JSON.stringify(current[key]))){console.log('Cable inventory already matches the organizer request.');return;}
    const saved=await service.saveComponent(db,{...(current||{}),...component,...(current?{id:current.id,expectedVersion:current.version}:{}),changeReason:'Organizer added 6 Micro-USB to USB-A cables; maximum 1 per team and 0 protected.'},actor);
    console.log(JSON.stringify({id:saved.id,name:saved.name,totalQuantity:saved.totalQuantity,availableQuantity:saved.availableQuantity,maxActivePerTeam:saved.maxActivePerTeam,protectedStock:saved.protectedStock}));
  }finally{await resetDatabaseForTests();}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
