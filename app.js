const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
let selectedNetwork = "MTN", balanceVisible = true, deferredInstall = null;
const money = n => "₦" + Number(n || 0).toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2});
function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove("show"),3600)}
function go(view){$$(".view").forEach(v=>v.hidden=v.id!=="view-"+view);$$(".nav-item").forEach(b=>b.classList.toggle("active",b.dataset.view===view));const titles={home:"Good day 👋",data:"Data bundles",airtime:"Airtime recharge",bills:"Bills & subscriptions",education:"Education pins",wallet:"Your wallet",transactions:"Transaction history"};$("#pageTitle").textContent=titles[view]||"HAFIZ DATA & BILLS";$(".sidebar").classList.remove("open");window.scrollTo({top:0,behavior:"smooth"})}
$$("[data-view]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.view)));
$$("[data-go]").forEach(b=>b.addEventListener("click",()=>go(b.dataset.go)));
$("#menuToggle").addEventListener("click",()=>$(".sidebar").classList.toggle("open"));
$$(".network").forEach(b=>b.addEventListener("click",()=>{selectedNetwork=b.dataset.network;$$(".network").forEach(n=>n.classList.toggle("selected",n===b))}));
$("#toggleBalance").addEventListener("click",()=>{balanceVisible=!balanceVisible;$("#balance").textContent=balanceVisible?"₦0.00":"••••••";$("#toggleBalance").textContent=balanceVisible?"◉":"○"});
$$("[data-bill]").forEach(b=>b.addEventListener("click",()=>{$("#billTitle").textContent=b.dataset.bill;$("#billProvider").value=b.dataset.bill==="DStv / GOtv"?"DStv":b.dataset.bill==="Electricity"?"IKEDC":"Water utility (if supported)";$("#billForm").scrollIntoView({behavior:"smooth",block:"center"})}));
function recordDemo(item,amount){const row=document.createElement("div");row.className="transaction-row";row.innerHTML=`<span class="service-icon green">↻</span><div><b></b><small></small></div><strong></strong>`;row.querySelector("b").textContent=item;row.querySelector("small").textContent="Demo request · not sent to a provider";row.querySelector("strong").textContent=money(amount);row.style.cssText="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);width:100%;text-align:left";const target=$("#recentList");if(target.classList.contains("empty-state")){target.className="panel";target.innerHTML="";}target.prepend(row.cloneNode(true));const all=$("#allTransactions");if(all.classList.contains("empty-state")){all.className="panel";all.innerHTML=""}all.prepend(row);go("transactions")}
$$("[data-purchase]").forEach(btn=>btn.addEventListener("click",()=>{
 const type=btn.dataset.purchase;let item="",amount=0;
 if(type==="data"){const phone=$("#dataPhone").value.trim(),plan=$("#dataPlan").value;if(!/^0\d{10}$/.test(phone))return toast("Enter a valid 11-digit Nigerian phone number.");if(!plan)return toast("Please select a data plan.");const p=plan.split("|");item=`${selectedNetwork} ${p[0]} data · ${phone}`;amount=Number(p[1])}
 if(type==="airtime"){const phone=$("#airPhone").value.trim();amount=Number($("#airAmount").value);if(!/^0\d{10}$/.test(phone))return toast("Enter a valid 11-digit Nigerian phone number.");if(!Number.isFinite(amount)||amount<50)return toast("Enter an airtime amount of at least ₦50.");item=`${$("#airNetwork").value} airtime · ${phone}`}
 if(type==="bill"){item=`${$("#billTitle").textContent} · ${$("#billAccount").value.trim()}`;amount=Number($("#billAmount").value);if(!$("#billAccount").value.trim())return toast("Enter the relevant meter, smartcard or account number.");if(!amount||amount<1)return toast("Enter a valid amount. Provider validation is not connected yet.")}
 if(type==="exam"){const qty=Number($("#pinQuantity").value);if(!Number.isInteger(qty)||qty<1||qty>20)return toast("Choose a quantity between 1 and 20.");return toast("Demo only: connect an authorized exam-pin supplier before selling pins.")}
 toast("Demo mode: no payment was taken and no service was delivered.");recordDemo(item,amount);
}));
$("#fundBtn").addEventListener("click",()=>toast("Payment provider not connected. No money has been charged."));
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("#installBtn").hidden=false});
$("#installBtn").addEventListener("click",async()=>{if(!deferredInstall)return toast("On your phone, use your browser menu and choose Add to Home screen.");deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("#installBtn").hidden=true});
$("#year").textContent=new Date().getFullYear();
if("serviceWorker" in navigator && location.protocol.startsWith("http"))navigator.serviceWorker.register("/sw.js").catch(()=>{});

// Shared theme switch
const themeBtn = $("#themeToggle");
const savedTheme = localStorage.getItem("hafiz-theme");
if (savedTheme === "light") document.documentElement.dataset.theme = "light";
if (themeBtn) themeBtn.addEventListener("click",()=>{const light=document.documentElement.dataset.theme!=="light";if(light)document.documentElement.dataset.theme="light";else delete document.documentElement.dataset.theme;localStorage.setItem("hafiz-theme",light?"light":"dark");});

// Supabase session display. The dashboard remains browseable in demo mode, but real purchases are not enabled here.
let sb = null;
try { const c=window.HAFIZ_CONFIG; if(window.supabase&&c?.SUPABASE_URL&&c?.SUPABASE_ANON_KEY&&!c.SUPABASE_URL.includes('YOUR_PROJECT')) sb=window.supabase.createClient(c.SUPABASE_URL,c.SUPABASE_ANON_KEY); } catch(e) { console.warn('Supabase config issue',e); }
if(sb){sb.auth.getSession().then(({data})=>{const link=document.querySelector('.account-link');if(data.session&&link){link.textContent='My account · Sign out';link.href='#';link.addEventListener('click',async e=>{e.preventDefault();await sb.auth.signOut();location.href='/login.html';});} });}

// Persistent support chat through the Netlify function. Requires a configured Supabase project and signed-in customer.
const chatPanel = $("#chatPanel");
let activeConversation = null;
async function chatRequest(method, payload, query='') {
 if(!sb) throw new Error('Support is not configured yet. Add your Supabase settings first.');
 const {data:{session}}=await sb.auth.getSession(); if(!session) throw new Error('Please sign in before using live chat.');
 const res=await fetch('/.netlify/functions/support-chat'+query,{method,headers:{'content-type':'application/json','authorization':'Bearer '+session.access_token},body:method==='POST'?JSON.stringify(payload):undefined});
 const data=await res.json();if(!res.ok)throw new Error(data.error||'Chat request failed');return data;
}
async function loadChat(){const log=$("#chatLog");log.innerHTML='';try{const result=activeConversation?await chatRequest('GET',null,'?conversation_id='+encodeURIComponent(activeConversation)):await chatRequest('GET');let conv=activeConversation?result.conversation:(result.conversations||[])[0];if(!conv){const note=document.createElement('p');note.className='chat-note';note.textContent='Send a message to start a support conversation.';log.append(note);return;}activeConversation=conv.id;for(const m of result.messages||[]){const b=document.createElement('div');b.className='chat-bubble '+(m.sender_kind==='customer'?'user-bubble':'agent-bubble');b.textContent=m.body;log.append(b);}log.scrollTop=log.scrollHeight;}catch(e){const note=document.createElement('p');note.className='chat-note';note.textContent=e.message;log.append(note);}}
$("#chatOpen")?.addEventListener('click',()=>{chatPanel.hidden=false;loadChat();$("#chatMessage").focus()});
$("#chatClose")?.addEventListener('click',()=>{chatPanel.hidden=true});
$("#chatForm")?.addEventListener('submit',async e=>{e.preventDefault();const input=$("#chatMessage"),body=input.value.trim();if(!body)return;try{const out=await chatRequest('POST',{action:'send',conversation_id:activeConversation,body});activeConversation=out.conversation_id;input.value='';await loadChat();}catch(err){toast(err.message);}});
