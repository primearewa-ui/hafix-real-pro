import {json,supabaseAdmin} from "./_lib.mjs";
export default async () => {
  try {
    const db=supabaseAdmin();
    const {data,error}=await db.from("catalog").select("id,category,service_id,product_code,variation_code,title,selling_kobo").eq("active",true).order("category").order("title");
    if(error) return json(500,{error:"Could not load service catalogue."});
    return json(200,{products:(data||[]).map(p=>({...p,price_naira:p.selling_kobo/100}))});
  } catch { return json(503,{error:"Database is not configured."}); }
};
