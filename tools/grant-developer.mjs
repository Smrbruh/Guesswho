import {createDatabase} from '../server/database.mjs';
import {resolve} from 'node:path';
const username=process.argv[2];
const level=Number(process.argv[3]);
if(!username||!Number.isSafeInteger(level)||level<1||level>10000)throw new Error('Usage: node tools/grant-developer.mjs PLAYER_NAME LEVEL');
let running=false;
try{running=(await fetch(`http://127.0.0.1:${process.env.PORT||3000}/api/health`,{signal:AbortSignal.timeout(1000)})).ok;}catch{}
if(running)throw new Error('Stop the local server before editing its database');
const backend=await createDatabase(resolve(process.env.DATA_DIR||'server/.data'));
try{
  const result=await backend.db.transaction(async tx=>{
    const {rows}=await tx.query('select id,username,wins,games,coins,rating from public.profiles where lower(username)=lower($1) for update',[username]);
    if(rows.length!==1)throw new Error(`Expected one matching player, found ${rows.length}`);
    const bonus=level-1-Math.floor(rows[0].wins/5);
    if(bonus<0)throw new Error('Requested level is lower than the earned level');
    const updated=await tx.query("update public.profiles set level_bonus=$1,special_titles=array['developer']::text[],title='developer' where id=$2 returning username,title,level_bonus,wins,games,coins,rating",[bonus,rows[0].id]);
    return {...updated.rows[0],level};
  });
  console.log(JSON.stringify(result));
}finally{await backend.close();}
