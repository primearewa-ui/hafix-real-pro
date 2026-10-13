import {json,supabaseAdmin,requireUser} from "./_lib.mjs";
export default async(event)=>{
  if(event.httpMethod!=="GET")return json(405,{error:"Method not allowed"});
  try{const db=supabaseAdmin(),user=await requireUser(event,db);if(!user)return json(401,{authenticated:false});
    const [{data:profile},{data:wallet},{data:orders}]=await Promise.all([
      db.from("profiles").select("full_name,phone,role").eq("id",user.id).maybeSingle(),
      db.from("wallets").select("balance_kobo").eq("user_id",user.id).maybeSingle(),
      db.from("orders").select("id,status,amount_kobo,created_at").eq("user_id",user.id).order("created_at",{ascending:false}).limit(10)
    ]);
    return json(200,{authenticated:true,user:{id:user.id,email:user.email},profile,wallet:{balance_naira:Number(wallet?.balance_kobo||0)/100},recent_orders:orders||[]});
  }catch{return json(503,{error:"Supabase is not configured."})}
};
