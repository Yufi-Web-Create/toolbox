import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(status:number, body:unknown){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});}
function str(v:unknown){return typeof v==="string"?v:"";}
function parseBundle(v:unknown):Record<string,unknown>|null{try{const x=JSON.parse(str(v));return x&&typeof x==="object"?x:null;}catch{return null;}}
function fromId(v:unknown):string {
  return v&&typeof v==="object" ? str((v as Record<string,unknown>).id) : "";
}
async function graph(path:string, token:string, query:Record<string,string>={}) {
  const u=new URL("https://graph.instagram.com/v26.0/"+encodeURIComponent(path));
  for(const [k,v] of Object.entries(query))u.searchParams.set(k,v);
  const r=await fetch(u,{headers:{authorization:"Bearer "+token}});
  if(!r.ok)throw new Error("instagram_api_"+r.status);
  return await r.json() as Record<string,unknown>;
}
Deno.serve(async(req)=>{
  if(req.method!=="POST")return json(405,{ok:false,error:"method_not_allowed"});
  const url=Deno.env.get("SUPABASE_URL")??"";
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")??"";
  if(!url||!key)return json(500,{ok:false,error:"server_config_missing"});
  const bearer=req.headers.get("authorization")??"";
  if(!bearer.startsWith("Bearer "))return json(401,{ok:false,error:"unauthorized"});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error:authError}=await admin.auth.getUser(bearer.slice(7));
  if(authError||!user)return json(401,{ok:false,error:"unauthorized"});
  const {data:membership}=await admin.from("organization_members").select("organization_id").eq("user_id",user.id).maybeSingle();
  if(!membership)return json(403,{ok:false,error:"membership_required"});
  const payload=await req.json().catch(()=>({}));
  const connectionId=str(payload?.connectionId);
  if(!/^[0-9a-f-]{36}$/i.test(connectionId))return json(400,{ok:false,error:"invalid_connection"});
  const {data:connection}=await admin.from("provider_connections")
    .select("id,external_account_id").eq("id",connectionId).eq("organization_id",membership.organization_id)
    .eq("provider","instagram").eq("status","active").maybeSingle();
  if(!connection)return json(404,{ok:false,error:"connection_not_found"});
  const {data:secret}=await admin.rpc("omnibox_get_provider_secret",{p_connection_id:connection.id});
  const bundle=parseBundle(secret);
  const token=str(bundle?.access_token);
  if(!token)return json(409,{ok:false,error:"instagram_reconnect_required"});

  let conversations=0,imported=0,skipped=0;
  try {
    // Bounded import. Instagram APIs only expose a limited history per thread.
    const response=await graph(connection.external_account_id+"/conversations",token,{fields:"id,participants,updated_time",limit:"25"});
    const list=Array.isArray(response.data)?response.data.slice(0,25):[];
    conversations=list.length;
    for(const item of list){
      if(!item||typeof item!=="object")continue;
      const conversation=item as Record<string,unknown>;
      const thread=str(conversation.id);
      if(!thread)continue;
      let history;
      try {
        history=await graph(thread,token,{fields:"messages{id,created_time,from,to,message}",limit:"20"});
      }catch{skipped++;continue;}
      const rawMessages=(history.messages&&typeof history.messages==="object")
        ? (history.messages as Record<string,unknown>).data : null;
      const messages=Array.isArray(rawMessages)?rawMessages.slice(0,20):[];
      for(const raw of messages.reverse()){
        if(!raw||typeof raw!=="object")continue;
        const msg=raw as Record<string,unknown>;
        const id=str(msg.id),sender=fromId(msg.from),body=str(msg.message).trim();
        // Outgoing history is not imported as a fake inbound customer message.
        if(!id||!sender||sender===connection.external_account_id||!body)continue;
        const providerMessageId="instagram:"+connection.id+":"+id;
        const {data:existing}=await admin.from("messages").select("id").eq("organization_id",membership.organization_id)
          .eq("provider_message_id",providerMessageId).limit(1);
        if(existing?.length)continue;
        const time=Date.parse(str(msg.created_time));
        const occurredAt=Number.isFinite(time)?new Date(time).toISOString():new Date().toISOString();
        const {error}=await admin.rpc("omnibox_ingest_external_message",{
          p_provider_connection_id:connection.id,p_provider:"instagram",
          // Align with webhook using Instagram-scoped sender ID rather than graph conversation ID.
          p_provider_thread_id:sender,p_customer_external_id:sender,p_customer_display_name:sender,
          p_customer_avatar_url:null,p_provider_message_id:providerMessageId,p_body:body,
          p_occurred_at:occurredAt,p_metadata:{historical_import:true,instagram_conversation_id:thread},
        });
        if(!error)imported++;else skipped++;
      }
    }
  }catch(e){
    return json(502,{ok:false,error:"instagram_history_fetch_failed",
      detail:e instanceof Error?e.message.slice(0,80):"provider_error"});
  }
  return json(200,{ok:true,conversations,imported,skipped,
    note:"Instagram APIが取得可能な各会話の最新メッセージのみ対象です。"});
});
