import { createClient } from "@supabase/supabase-js";

export const json = (statusCode, body) => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(body)
});
export function supabaseAdmin() {
  const url=process.env.SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function requireUser(event, admin) {
  const header=event.headers?.authorization||event.headers?.Authorization||"";
  const token=header.startsWith("Bearer ")?header.slice(7):"";
  if(!token) return null;
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data?.user) return null;
  return data.user;
}
export function requestId() {
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return `${v.year}${v.month}${v.day}${v.hour}${v.minute}${crypto.randomUUID().replaceAll("-","").slice(0,12)}`;
}
export function toKobo(naira){return Math.round(Number(naira)*100);}
