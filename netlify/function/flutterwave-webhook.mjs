import {json,supabaseAdmin} from "./_lib.mjs";
export default async(event)=>{
  if(event.httpMethod!=="POST")return json(405,{error:"Method not allowed"});
  const webhookHash=process.env.FLW_WEBHOOK_SECRET_HASH,secret=process.env.FLW_SECRET_KEY;
  if(!webhookHash||!secret)return json(503,{error:"Webhook is not configured."});
  if((event.headers?.["verif-hash"]||event.headers?.["Verif-Hash"])!==webhookHash)return json(401,{error:"Invalid webhook hash."});
  let payload;try{payload=JSON.parse(event.body||"{}")}catch{return json(400,{error:"Invalid JSON."})}
  const transactionId=payload?.data?.id;if(!transactionId)return json(200,{received:true,ignored:true});
  try{
    const resp=await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`,{headers:{Authorization:`Bearer ${secret}`}});
    const verified=await resp.json();const tx=verified?.data;
    if(!resp.ok||verified.status!=="success"||!tx)return json(400,{error:"Transaction verification failed."});
    const db=supabaseAdmin(),txRef=String(tx.tx_ref||"");
    const {data:payment,error}=await db.from("payments").select("*").eq("tx_ref",txRef).maybeSingle();
    if(error)return json(500,{error:"Payment record lookup failed."});
    if(!payment)return json(200,{received:true,ignored:true});
    if(tx.status!=="successful"||tx.currency!==payment.currency||Math.round(Number(tx.amount)*100)<payment.expected_kobo){
      await db.from("payments").update({status:"review",provider_transaction_id:String(transactionId)}).eq("id",payment.id);
      return json(200,{received:true,review:true});
    }
    const eventKey=`flutterwave:${transactionId}:successful`;
    const {error:eventError}=await db.from("processed_events").insert({event_key:eventKey,source:"flutterwave",payload:{tx_ref:txRef,transaction_id:transactionId}});
    if(eventError&&eventError.code==="23505")return json(200,{received:true,duplicate:true});
    if(eventError)return json(500,{error:"Could not record webhook event."});
    const {error:updateError}=await db.from("payments").update({provider_transaction_id:String(transactionId)}).eq("id",payment.id);
    if(updateError)return json(500,{error:"Could not update payment."});
    const {error:creditError}=await db.rpc("credit_wallet_deposit",{p_payment_id:payment.id,p_verified_ref:txRef,p_amount_kobo:payment.expected_kobo});
    if(creditError)return json(500,{error:"Verified payment requires reconciliation."});
    return json(200,{received:true,credited:true});
  }catch{return json(500,{error:"Webhook processing failed; retry safely."})}
};
