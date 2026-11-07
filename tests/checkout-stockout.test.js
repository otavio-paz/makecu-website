const {test}=require('node:test');
const assert=require('node:assert/strict');
const {stockoutCandidates,zeroAvailable}=require('../scripts/inventory-stockout-policy');
const {definitions,applyCatalog}=require('../scripts/reconcile-inventory-2026-11-07');
test('missing stock is zeroed while preserving allocations, MLH stock and explicit keep items',()=>{
  const rows=[
    {name:'Adafruit Microphone Breakout',totalQuantity:1},
    {name:'Heart Rate Sensor',totalQuantity:6},
    {name:'Moisture sensor',totalQuantity:17,mlhQuantity:2,reservedQuantity:1,checkedOutQuantity:2,unavailableQuantity:1},
    {name:'DMM',totalQuantity:1},
    {name:'Small Solderable Prototyping Board',totalQuantity:6},
    {name:'Sonar Altimeter and Echosounder (PING)',totalQuantity:1},
    {name:'Tactile Push Buttons (Assorted)',totalQuantity:250},
    {name:'JST Headers 4 pin male',totalQuantity:13},
    {name:'ESP32-CAM Camera Development Module',totalQuantity:6},
    {name:'Ultrasonic Distance Sensor (MLH)',totalQuantity:3,mlhQuantity:3}
  ];
  assert.deepEqual(stockoutCandidates(rows,definitions()).map(c=>c.name),['Adafruit Microphone Breakout','Heart Rate Sensor','Moisture sensor']);
  const moisture=zeroAvailable(rows[2]);
  assert.equal(moisture.totalQuantity,6);
  assert.equal(moisture.mlhQuantity,2);
  assert.equal(moisture.totalQuantity-moisture.mlhQuantity-moisture.reservedQuantity-moisture.checkedOutQuantity-moisture.unavailableQuantity,0);
  assert.equal(zeroAvailable(rows[0]).totalQuantity,0);
});
test('catalog stockouts stay zero when reconciliation is repeated',()=>{
  const catalog=require('../db/checkout-catalog.json');
  assert.deepEqual(applyCatalog(catalog),catalog);
  assert.equal(catalog.components.find(c=>c.name==='Adafruit Microphone Breakout').totalQuantity,0);
});
