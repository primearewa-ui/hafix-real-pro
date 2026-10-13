import {json,supabaseAdmin,requireUser,requestId} from "./_lib.mjs";

export default async (event) => {
  if(event.httpMethod!=="POST") return json(405,{error:"Method not allowed"});
  const base=process.env.VTPASS_BASE_URL||"https://sandbox.vtpass.com";
  const apiKey=process.env.VTPASS_API_KEY, publicKey=process.env.VTPASS_PUBLIC_KEY, secretKey=process.env.VTPASS_SECRET_KEY;
  if(!apiKey||!publicKey||!secretKey) return json(503,{error:"VTPass credentials are not configured. Orders are disabled."});
  let body;
  try{body=JSON.parse(event.body||"{}")}catch{return json(400,{error:"Invalid JSON."})}
  const catalogId=String(body.catalog_id||""), recipient=String(body.recipient||"").trim(), idem=String(body.idempotency_key||"");
  if(!/^[0-9a-f-]{36}$/i.test(catalogId)) return json(400,{error:"Choose a valid catalogue item."});
  if(recipient.length<5||recipient.length>100) return json(400,{error:"Enter a valid recipient, meter or account number."});
  if(idem.length<12||idem.length>100) return json(400,{error:"A unique idempotency key is required."});
  try{
    const db=supabaseAdmin(), user=await requireUser(event,db);
    if(!user)return json(401,{error:"Please sign in first."});
    const rid=requestId();
    const {data:reserved,error:reserveError}=await db.rpc("reserve_order",{p_user_id:user.id,p_catalog_id:catalogId,p_idempotency_key:idem,p_recipient:recipient,p_request_id:rid});
    if(reserveError){
      const msg=reserveError.message||"";
      if(msg.includes("INSUFFICIENT_FUNDS"))return json(402,{error:"Insufficient wallet balance."});
      if(msg.includes("PRODUCT_UNAVAILABLE"))return json(409,{error:"This service is not currently available."});
      if(msg.includes("INVALID"))return json(400,{error:"Invalid order details."});
      return json(500,{error:"Could not reserve the order. No provider request was sent."});
    }
    if(reserved.duplicate)return json(200,{order_id:reserved.order_id,status:reserved.status,duplicate:true,message:"This order request was already received."});
    const {data:product,error:productError}=await db.from("catalog").select("*").eq("id",catalogId).eq("active",true).single();
    if(productError||!product){await db.rpc("finish_order",{p_order_id:reserved.order_id,p_status:"failed",p_provider_transaction_id:null,p_provider_response:{reason:"catalog_missing"}});return json(409,{error:"Service unavailable; reserved funds have been refunded."})}

    const isSandbox=base.includes("sandbox.vtpass.com");
    const payload={request_id:rid,serviceID:product.service_id,billersCode:recipient,phone:recipient};
    if(product.variation_code)payload.variation_code=product.variation_code;
    if(product.category==="airtime"||product.category==="data")payload.amount=product.selling_kobo/100;
    if(product.category==="education")payload.quantity=1;

    let providerResponse,providerHttp;
    try{
      const resp=await fetch(`${base.replace(/\/$/,"")}/api/pay`,{method:"POST",headers:{"api-key":apiKey,"secret-key":secretKey,"Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      providerHttp=resp.status;providerResponse=await resp.json();
    }catch{
      await db.rpc("finish_order",{p_order_id:reserved.order_id,p_status:"review",p_provider_transaction_id:null,p_provider_response:{reason:"provider_network_error"}});
      return json(202,{order_id:reserved.order_id,status:"review",message:"Provider response is uncertain. Funds are held while the order is reconciled; do not retry as a new order."});
    }
    const code=String(providerResponse?.code||"");
    const providerStatus=String(providerResponse?.content?.transactions?.status||"").toLowerCase();
    // VTpass documents code 000 as processed, not necessarily delivered.
    // Only mark success when the transaction status explicitly says delivered.
    // Treat only documented terminal failure codes as failed; all ambiguous
    // responses remain review/pending until /api/requery confirms final status.
    const success=code==="000" && providerStatus==="delivered";
    const failed=["016","091"].includes(code);
    const finalStatus=success?"successful":failed?"failed":"review";
    const {error:finishError}=await db.rpc("finish_order",{p_order_id:reserved.order_id,p_status:finalStatus,p_provider_transaction_id:String(providerResponse?.content?.transactions?.transactionId||""),p_provider_response:{http_status:providerHttp,code,response_description:providerResponse?.response_description||"No description"}});
    if(finishError)return json(202,{order_id:reserved.order_id,status:"review",message:"Provider replied but reconciliation needs attention."});
    return json(200,{order_id:reserved.order_id,status:finalStatus,message:finalStatus==="successful"?"Provider reports success.":finalStatus==="failed"?"Provider reports failure; refund processed if confirmed.":"Order is pending reconciliation."});
  }catch(err){
    if(String(err.message).includes("SUPABASE_NOT_CONFIGURED"))return json(503,{error:"Supabase is not configured."});
    return json(500,{error:"Order could not be processed safely."});
  }
};
