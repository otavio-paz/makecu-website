const fs=require('node:fs');
const path=require('node:path');
const {getDatabase,resetDatabaseForTests}=require('../api/_lib/checkout-db');
const service=require('../api/_lib/checkout-service');
async function main(){
  const arg=flag=>{const index=process.argv.indexOf(flag);return index<0?'':process.argv[index+1];};
  const name=arg('--name'),file=arg('--file'),alt=arg('--alt');
  if(!name||!file||!alt||path.basename(file)!==file||!file.endsWith('.webp'))throw new Error('Provide --name, --file (WebP filename only), and --alt.');
  for(const directory of ['images/checkout/components','images/checkout/components/thumbnails'])fs.accessSync(path.join(directory,file));
  const patch={imageUrl:`/images/checkout/components/${file}`,imageAlt:alt};
  if(process.argv.includes('--catalog')){
    const filename='db/checkout-catalog.json';const catalog=JSON.parse(fs.readFileSync(filename,'utf8'));
    const component=catalog.components.find(c=>c.name===name);
    if(!component)throw new Error(`Missing component: ${name}`);
    Object.assign(component,patch);fs.writeFileSync(filename,JSON.stringify(catalog,null,2)+'\n');
    const mappingFile='scripts/checkout-local-images.json';const mappings=JSON.parse(fs.readFileSync(mappingFile,'utf8'));
    const index=mappings.findIndex(c=>c.name===name);const mapping={name,file,alt};
    if(index<0)mappings.push(mapping);else mappings[index]=mapping;
    fs.writeFileSync(mappingFile,JSON.stringify(mappings,null,2)+'\n');return;
  }
  if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required.');
  try{
    const db=await getDatabase();
    const actor=(await db.query("SELECT id,role,username,display_name FROM checkout_users WHERE active=TRUE AND role='admin' ORDER BY id LIMIT 1")).rows[0];
    if(!actor)throw new Error('Active admin required.');
    const matches=(await service.catalog(db,actor,true)).filter(c=>c.name===name);
    if(matches.length!==1)throw new Error('Expected exactly one matching component.');
    const component=matches[0];
    if(component.imageUrl!==patch.imageUrl||component.imageAlt!==alt)await service.saveComponent(db,{...component,...patch,expectedVersion:component.version,changeReason:'Updated component photo supplied by organizer.'},actor);
    console.log(JSON.stringify({name,...patch,totalQuantity:component.totalQuantity,maxActivePerTeam:component.maxActivePerTeam}));
  }finally{await resetDatabaseForTests();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
