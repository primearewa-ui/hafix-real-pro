import { createClient } from '@supabase/supabase-js';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
const reply=(status,body)=>({statusCode:status,headers,body:JSON.stringify(body)});
export async function handler(event){
 if(!['GET','POST'].includes(event.httpMethod)) return reply(405,{error:'Method not allowed'});
 const url=process.env.SUPABASE_URL, service=process.env.SUPABASE_SERVICE_ROLE_KEY, anon=process.env.SUPABASE_ANON_KEY;
 if(!url||!service||!anon) return reply(503,{error:'Support backend is not configured'});
 const token=(event.headers.authorization||event.headers.Authorization||'').replace(/^Bearer\s+/i,'');
 if(!token) return reply(401,{error:'Sign in required'});
 const authClient=createClient(url,anon,{auth:{persistSession:false}});
 const {data:ud,error:ue}=await authClient.auth.getUser(token); if(ue||!ud?.user) return reply(401,{error:'Invalid session'});
 const db=createClient(url,service,{auth:{persistSession:false}}); const uid=ud.user.id;
 const {data:profile}=await db.from('profiles').select('role,full_name').eq('id',uid).maybeSingle(); const role=profile?.role||'customer';
 let input={};try{if(event.body)input=JSON.parse(event.body)}catch{return reply(400,{error:'Invalid JSON'})}
 try {
  if(event.httpMethod==='GET'){
   const params=new URLSearchParams(event.rawQuery||''); const conversationId=params.get('conversation_id');
   if(role==='admin'||role==='agent'){
    if(conversationId){const {data:c,error:ce}=await db.from('support_conversations').select('*').eq('id',conversationId).single();if(ce)return reply(404,{error:'Conversation not found'});const {data:m,error:me}=await db.from('support_messages').select('*').eq('conversation_id',conversationId).order('created_at');if(me)throw me;return reply(200,{conversation:c,messages:m||[]})}
    const {data,error}=await db.from('support_conversations').select('*,profiles:customer_id(full_name)').order('last_message_at',{ascending:false}).limit(100);if(error)throw error;return reply(200,{conversations:data||[]});
   }
   if(conversationId){const {data:c,error:ce}=await db.from('support_conversations').select('*').eq('id',conversationId).eq('customer_id',uid).single();if(ce)return reply(404,{error:'Conversation not found'});const {data:m,error:me}=await db.from('support_messages').select('*').eq('conversation_id',conversationId).order('created_at');if(me)throw me;return reply(200,{conversation:c,messages:m||[]})}
   const {data,error}=await db.from('support_conversations').select('*').eq('customer_id',uid).order('last_message_at',{ascending:false}).limit(20);if(error)throw error;return reply(200,{conversations:data||[]});
  }
  if(input.action==='send'){
   const body=String(input.body||'').trim();if(!body||body.length>4000)return reply(400,{error:'Message must be 1–4000 characters'});
   let cid=input.conversation_id;
   if(cid){const {data:c,error}=await db.from('support_conversations').select('*').eq('id',cid).single();if(error)return reply(404,{error:'Conversation not found'});if(role==='customer'&&c.customer_id!==uid)return reply(403,{error:'Forbidden'});}
   else {if(role!=='customer')return reply(400,{error:'Choose a conversation'});const {data:c,error}=await db.from('support_conversations').insert({customer_id:uid,subject:'Customer support'}).select().single();if(error)throw error;cid=c.id;}
   const sender_kind=role==='admin'?'admin':role==='agent'?'agent':'customer';const {data:msg,error:me}=await db.from('support_messages').insert({conversation_id:cid,sender_id:uid,sender_kind,body}).select().single();if(me)throw me;
   await db.from('support_conversations').update({last_message_at:new Date().toISOString(),status:role==='customer'?'open':'pending'}).eq('id',cid);
   return reply(201,{conversation_id:cid,message:msg});
  }
  if(input.action==='resolve'){
   if(!['admin','agent'].includes(role))return reply(403,{error:'Admin or agent access required'});
   const {error}=await db.from('support_conversations').update({status:'resolved'}).eq('id',input.conversation_id);if(error)throw error;return reply(200,{ok:true});
  }
  return reply(400,{error:'Unknown action'});
 }catch(e){console.error('support-chat error',e);return reply(500,{error:'Support request failed'});}
}
