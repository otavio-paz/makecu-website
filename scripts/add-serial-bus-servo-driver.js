const fs=require('node:fs');
const {addComponent}=require('./add-micro-usb-cables');
const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
const service=require('../api/_lib/checkout-service');
const donorNote='From Otavio Paz.';
const component={
  name:'Serial Bus Servo Driver Board (ST/SC)',
  description:'Serial bus servo driver board supporting up to 253 ST/SC serial bus servos. Use with compatible serial bus servos and an appropriate external servo power supply.',
  imageUrl:'/images/checkout/components/serial-bus-servo-driver-st-sc.webp',
  imageAlt:'Serial bus servo driver board with USB-C, UART, servo connectors, and external power inputs, from the organizer-provided photo',
  category:'Motor Related',compatibility:'Arduino + Raspberry Pi',
  arduinoGuidance:'Use the UART connection with compatible serial bus servos; check voltage levels and wiring.',
  raspberryPiGuidance:'Use a compatible USB or UART connection and a separate servo power supply.',
  binLocation:'',technicalSpecs:'Supports up to 253 ST/SC serial bus servos. USB-C and UART connections.',
  totalQuantity:1,mlhQuantity:0,unavailableQuantity:0,protectedStock:0,maxActivePerTeam:1,active:true,
  adminNotes:`${donorNote} Organizer added November 8, 2026: 1 board, maximum 1 per team. Photo supplied by organizer.`
};
async function main(){
  await addComponent(component,'Organizer added 1 serial bus servo driver board from Otavio Paz; maximum 1 per team.');
  if(process.argv.includes('--catalog')){
    const filename='db/checkout-catalog.json';const catalog=JSON.parse(fs.readFileSync(filename,'utf8'));
    const microphone=catalog.components.find(c=>c.name==='Adafruit Mini USB Microphone');
    if(!microphone)throw new Error('Microphone missing from catalog.');
    if(!microphone.adminNotes.includes(donorNote))microphone.adminNotes=`${microphone.adminNotes}\n${donorNote}`;
    fs.writeFileSync(filename,JSON.stringify(catalog,null,2)+'\n');return;
  }
  try{
    const db=await getDatabase();
    const actor=(await db.query("SELECT id,role,username,display_name FROM checkout_users WHERE active=TRUE AND role='admin' ORDER BY id LIMIT 1")).rows[0];
    const microphone=(await service.catalog(db,actor,true)).find(c=>c.name==='Adafruit Mini USB Microphone');
    if(!microphone)throw new Error('Microphone missing from inventory.');
    if(!microphone.adminNotes.includes(donorNote))await service.saveComponent(db,{...microphone,expectedVersion:microphone.version,adminNotes:`${microphone.adminNotes}\n${donorNote}`,changeReason:'Organizer confirmed the Mini USB Microphone is from Otavio Paz.'},actor);
    console.log('Volunteer notes on both items identify Otavio Paz.');
  }finally{await resetDatabaseForTests();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
