const evidence=require('./inventory-review-2026-11-07.json');
const {COMPONENT_MERGES}=require('./merge-checkout-components');
const {correctedName,protectedFromRemoval}=require('./inventory-name-policy');
const {catalogMlhQuantity}=require('./import-checkout-catalog');
const normalize=name=>correctedName(name.trim()).toLowerCase().replace(/\s+/g,' ');
const aliases=new Map(Object.entries({
  'Ultrasonic Sensor':'Ultrasonic Distance Sensor (CURC)',
  'Battery to round hole':'9V to dc jack',
  'DC Barrel Jack to Female Thing':'DC Barrel Jack to Female',
  'Motor Shield V2.3':'Motor Shield V3.0',
  '10Pcs Pressure Resistance Strain Gauge':'Pressure Resistance Strain Gauge'
}).map(([a,b])=>[normalize(a),normalize(b)]));
for(const group of COMPONENT_MERGES) {
  if(group.finalName==='Ultrasonic Sensors') continue;
  for(const name of group.memberNames) aliases.set(normalize(name),normalize(group.finalName));
}
function stockoutCandidates(components,confirmed,includeZero=false){
  const verified=new Set(confirmed.flatMap(d=>[d.name,...d.aliases]).map(normalize));
  const missing=new Set(evidence.main.filter(r=>[0,8].includes(r.fill)&&r.source!=='MLH'&&!protectedFromRemoval(r.name)).flatMap(r=>[normalize(r.name),aliases.get(normalize(r.name))]).filter(Boolean));
  return components.filter(c=>missing.has(normalize(c.name))&&!verified.has(normalize(c.name))&&!protectedFromRemoval(c.name)&&(includeZero||c.totalQuantity>catalogMlhQuantity(c)));
}
function zeroAvailable(component){
  const mlh=catalogMlhQuantity(component);
  const committed=(component.reservedQuantity||0)+(component.checkedOutQuantity||0)+(component.unavailableQuantity||0);
  return {...component,totalQuantity:mlh+committed,mlhQuantity:mlh,protectedStock:0};
}
module.exports={stockoutCandidates,zeroAvailable};
