import {json,supabaseAdmin,requireUser} from "./_lib.mjs";
export default async (event)=>{
  if(event.httpMethod!=="POST")return json(405,{error:"Method not allowed"});
  const secret=process.env.FLW_SECRET_KEY,siteUrl=process.env.SITE_URL||process.env.URL;
  if(!secret||!siteUrl)return json(503,{error:"Flutterwave is not configured."});
  let body;try{body=JSON.parse(event.body||"{}")}catch{return json(400,{error:"Invalid JSON."})}
  const amount=Number(body.amount),name=String(body.name||"").trim().slice(0,100),phone=String(body.phone||"").trim().slice(0,20);
  if(!Number.isFinite(amount)||amount<100||amount>1000000)return json(400,{error:"Funding amount must be ₦100 to ₦1,000,000."});
  try{
    const db=supabaseAdmin(),user=await requireUser(event,db);if(!user)return json(401,{error:"Sign in before funding your wallet."});
    const {data:profile}=await db.from("profiles").select("full_name").eq("id",user.id).maybeSingle();
    const customerName=name||profile?.full_name||"HAFIZ Customer";
    const txRef=`HAFIZ-${crypto.randomUUID()}`,expectedKobo=Math.round(amount*100);
    const {data:payment,error:insertError}=await db.from("payments").insert({user_id:user.id,tx_ref:txRef,purpose:"wallet_funding",expected_kobo:expectedKobo,currency:"NGN",status:"pending"}).select("id").single();
    if(insertError)return json(500,{error:"Could not create payment record."});
    const resp=await fetch("https://api.flutterwave.com/v3/payments",{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/json"},body:JSON.stringify({tx_ref:txRef,amount,currency:"NGN",redirect_url:`${siteUrl.replace(/\/$/,"")}/payment-result.html`,customer:{email:user.email,name:customerName,phonenumber:phone||undefined},customizations:{title:"HAFIZ DATA & BILLS",description:"Wallet funding"},meta:{purpose:"wallet_funding",payment_id:payment.id,user_id:user.id}})});
    const result=await resp.json().catch(()=>({}));
    if(!resp.ok||result.status!=="success"||!result.data?.link){await db.from("payments").update({status:"failed"}).eq("id",payment.id);return json(502,{error:"Could not create checkout."})}
    return json(200,{checkoutUrl:result.data.link,txRef});
  }catch{return json(503,{error:"Payment service is not ready."})}
};
