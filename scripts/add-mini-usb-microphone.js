const {addComponent}=require('./add-micro-usb-cables');
const component={
  name:'Adafruit Mini USB Microphone',
  description:'Compact Adafruit USB microphone with a USB-A plug for audio input on a compatible USB host. This is a complete USB microphone, separate from the microphone breakout boards.',
  imageUrl:'/images/checkout/components/adafruit-mini-usb-microphone.webp',
  imageAlt:'Compact black Adafruit USB microphone with a USB-A plug, from the organizer-provided photo',
  category:'Audio',compatibility:'Raspberry Pi',arduinoGuidance:'Requires a compatible USB host.',
  raspberryPiGuidance:'Connect to a USB-A host port and select the microphone as the audio input.',
  binLocation:'',technicalSpecs:'Compact USB microphone with a USB-A male connector.',
  totalQuantity:1,mlhQuantity:0,unavailableQuantity:0,protectedStock:0,maxActivePerTeam:1,active:true,
  adminNotes:'Organizer added November 8, 2026: 1 Adafruit Mini USB Microphone, maximum 1 per team. Photo supplied by organizer. From Otavio Paz.'
};
addComponent(component,'Organizer added 1 Adafruit Mini USB Microphone; maximum 1 per team.').catch(e=>{console.error(e.message);process.exitCode=1;});
