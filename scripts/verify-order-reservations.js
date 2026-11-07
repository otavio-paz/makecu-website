const fs=require('node:fs');
async function main(){
  const origin=new URL((await fetch('https://makecu.dev/api/checkout?action=status')).url).origin;
  const account=JSON.parse(fs.readFileSync('checkout-admin-credentials.production.local.json','utf8')).accounts[0];
  let cookie;
  async function request(action,payload={}){
    const response=await fetch(`${origin}/api/checkout`,{method:'POST',headers:{'content-type':'application/json',origin,...(cookie?{cookie}:{})},body:JSON.stringify({action,...payload})});
    if(!response.ok)throw new Error(`Verification failed for ${action}: HTTP ${response.status}`);
    if(action==='login')cookie=response.headers.get('set-cookie').split(';')[0];
    return response.json();
  }
  await request('login',{username:account.username,password:account.password});
  try{
    const {orders}=await request('admin-orders');
    const active=orders.filter(o=>['submitted','reviewing','accepted','ready'].includes(o.status));
    if(active.some(o=>o.reservationExpiresAt))throw new Error('An active order still has an expiration deadline.');
    const {order}=await request('order',{orderId:4});
    if(!['ready','picked_up'].includes(order.status))throw new Error('Restored order is not ready for pickup.');
    console.log(JSON.stringify({activeOrdersWithoutExpiration:active.length,restoredOrder:order.receiptCode,status:order.status,items:order.items.map(i=>({name:i.name,approvedQuantity:i.approvedQuantity}))},null,2));
  }finally{await request('logout');}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
