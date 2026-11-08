const {addComponent}=require('./add-micro-usb-cables');
const component={
  name:'Energizer AA Battery',
  description:'Individual Energizer AA alkaline battery for compatible battery holders and low-voltage projects. Observe polarity and do not recharge alkaline batteries.',
  imageUrl:'/images/checkout/components/energizer-aa-battery.webp',
  imageAlt:'Energizer AA alkaline battery from the organizer-provided photo',
  category:'Power',compatibility:'N/A',arduinoGuidance:'Use a suitable battery holder and power regulation for the board.',
  raspberryPiGuidance:'Use a suitable regulated power supply rather than connecting cells directly to the board.',
  binLocation:'',technicalSpecs:'AA alkaline battery; 1.5 V nominal. Issued individually.',
  totalQuantity:14,mlhQuantity:0,unavailableQuantity:0,protectedStock:0,maxActivePerTeam:4,active:true,
  adminNotes:'From Otavio Paz. Organizer added November 8, 2026: 14 individual Energizer AA batteries, maximum 4 per team. Photo supplied by organizer.'
};
addComponent(component,'Organizer added 14 individual Energizer AA batteries; maximum 4 per team.').catch(e=>{console.error(e.message);process.exitCode=1;});
