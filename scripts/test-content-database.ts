import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function main(){
  const url=new URL(process.env.DATABASE_URL||"");
  if(!["localhost","127.0.0.1"].includes(url.hostname)||!url.pathname.endsWith("_feature"))throw new Error("Use an isolated local *_feature database");
  const {pgPool,closeDatabaseConnections}=await import("../src/db");
  const {getGeneration,getTemplate}=await import("../src/lib/content/store");
  const {initialTemplates,initialHolidays}=await import("../src/lib/content/catalog");
  try{
    await pgPool.query("CREATE SCHEMA IF NOT EXISTS portal; CREATE TABLE IF NOT EXISTS portal.agents(id integer PRIMARY KEY); INSERT INTO portal.agents(id) VALUES(1),(2) ON CONFLICT DO NOTHING");
    const migration=await readFile("db/migrations/20260910-content-center.sql","utf8");
    await pgPool.query(migration);await pgPool.query(migration);
    const family=randomUUID(),template=randomUUID(),project=randomUUID(),job=randomUUID(),key=randomUUID();
    const config=initialTemplates()[0].config;
    await pgPool.query("INSERT INTO portal.content_templates(id,family_id,version,status,config) VALUES($1,$2,1,'published',$3)",[template,family,JSON.stringify(config)]);
    assert.equal((await getTemplate(template))?.config.name.en,config.name.en);
    await assert.rejects(pgPool.query("INSERT INTO portal.content_templates(id,family_id,version,status,config) VALUES($1,$2,2,'published',$3)",[randomUUID(),family,JSON.stringify(config)]),(e:{code?:string})=>e.code==="23505");
    await pgPool.query("INSERT INTO portal.content_projects(id,owner_agent_id,title,input) VALUES($1,1,'test','{}')",[project]);
    const insert="INSERT INTO portal.content_generations(id,project_id,owner_agent_id,template_id,idempotency_key,request_hash,status,input,brand,prompt,provider_config) VALUES($1,$2,1,$3,$4,'hash','queued','{}','{}','original prompt','{\"deployment\":\"gpt-image-2\"}')";
    const results=await Promise.allSettled([pgPool.query(insert,[job,project,template,key]),pgPool.query(insert,[randomUUID(),project,template,key])]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
    const row=await pgPool.query("SELECT id FROM portal.content_generations WHERE owner_agent_id=1 AND idempotency_key=$1",[key]);
    const actual=row.rows[0].id;
    assert.equal((await getGeneration(actual,1)).prompt,"original prompt");
    await assert.rejects(getGeneration(actual,2),/not found/);
    assert.equal((await getGeneration(actual,2,true)).id,actual);
    const claims=await Promise.all([pgPool.query("UPDATE portal.content_generations SET status='generating' WHERE id=$1 AND status='queued' RETURNING id",[actual]),pgPool.query("UPDATE portal.content_generations SET status='generating' WHERE id=$1 AND status='queued' RETURNING id",[actual])]);
    assert.equal(claims.reduce((n,r)=>n+(r.rowCount||0),0),1);
    const tables=await pgPool.query("SELECT relname,relrowsecurity FROM pg_class JOIN pg_namespace ON pg_namespace.oid=relnamespace WHERE nspname='portal' AND relname LIKE 'content_%' AND relkind='r'");
    assert.equal(tables.rows.length,7);assert.ok(tables.rows.every(r=>r.relrowsecurity));
    for(const h of initialHolidays()){await pgPool.query("INSERT INTO portal.content_holidays(id,country,name,greeting) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[h.id,h.country,JSON.stringify(h.name),JSON.stringify(h.greeting)]);for(const d of h.dates)await pgPool.query("INSERT INTO portal.content_holiday_dates(holiday_id,year,date) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",[h.id,d.year,d.date]);}
    await assert.rejects(pgPool.query("INSERT INTO portal.content_holiday_dates(holiday_id,year,date) VALUES('spring-festival',2028,'2027-02-06')"),(e:{code?:string})=>e.code==="23514");
    console.log("Content database verified: idempotent migration, published-version uniqueness, concurrent request/provider claims, Agent isolation, RLS, exact holiday dates.");
  }finally{await closeDatabaseConnections();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
