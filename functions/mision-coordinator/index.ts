import { createClient } from 'npm:@supabase/supabase-js@2.117.3';
const URL=Deno.env.get('SUPABASE_URL')!;
const SERVICE=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON=Deno.env.get('SUPABASE_ANON_KEY')!;
const SITE='https://kimymickel-boop.github.io';
const ORIGINS=new Set([SITE,'https://misionprimergrado2027.netlify.app','https://misionprimergrado2027.web.app','https://misionprimergrado2027.firebaseapp.com']);
const options={auth:{persistSession:false,autoRefreshToken:false}};
const service=createClient(URL,SERVICE,options);
const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b=>b.toString(16).padStart(2,'0')).join('');
const rpc=async(name:string,args:Record<string,unknown>)=>{const r=await service.rpc(name,args);if(r.error)throw Error('Operation failed');return r.data;};
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||SITE;
 const headers={'Access-Control-Allow-Origin':ORIGINS.has(origin)?origin:SITE,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Cache-Control':'no-store','Content-Type':'application/json','Vary':'Origin'};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(!ORIGINS.has(origin))return reply({error:'Origen no permitido.'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Método no permitido.'},405);
 try{
  const raw=await req.text();if(raw.length>2048)return reply({error:'Solicitud demasiado grande.'},413);
  const body=JSON.parse(raw);
  if(!['enter','issue','revoke'].includes(body.action))return reply({error:'Operación inválida.'},400);
  const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
  if(!await rpc('mision_access_rate',{p_bucket:'coord:'+await hash(SERVICE+'|'+ip),p_limit:60,p_seconds:3600}))return reply({error:'Espera unos minutos antes de volver a intentar.'},429);
  if(body.action!=='enter'){
   const jwt=req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
   if(!jwt)return reply({error:'Ingresa como tesorera.'},401);
   const user=await service.auth.getUser(jwt);if(user.error||!user.data.user)return reply({error:'Sesión inválida.'},401);
   const signed=createClient(URL,ANON,{...options,global:{headers:{Authorization:'Bearer '+jwt}}});
   const me=await signed.rpc('mision_me');if(me.error||!me.data?.[0]?.is_treasurer)return reply({error:'Solo la tesorera puede gestionar este acceso.'},403);
   const token=random(),expiresAt=body.action==='issue'?new Date(Date.now()+24*60*60*1000).toISOString():new Date().toISOString();
   await rpc('mision_coordinator_issue',{p_hash:await hash(token),p_expires:expiresAt});
   return reply(body.action==='issue'?{token,expiresAt}:{revoked:true});
  }
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return reply({error:'Enlace de coordinación inválido.'},400);
  const digest=await hash(body.token);
  let account=(await rpc('mision_coordinator_consume',{p_hash:digest}))?.[0];
  if(!account?.email)return reply({error:'Este enlace ya se utilizó, fue desactivado o venció. Solicita uno nuevo a la tesorera.'},403);
  if(!account.user_id){
   const made=await service.auth.admin.createUser({email:account.email,password:random(),email_confirm:true});
   if(made.error){account=(await rpc('mision_coordinator_account',{}))?.[0];if(!account?.user_id)throw Error('Create failed');}
  }
  const generated=await service.auth.admin.generateLink({type:'magiclink',email:account.email});
  if(generated.error||!generated.data.properties?.hashed_token)throw Error('Link failed');
  const login=createClient(URL,ANON,options);
  const verified=await login.auth.verifyOtp({token_hash:generated.data.properties.hashed_token,type:'email'});
  if(verified.error||!verified.data.session)throw Error('Login failed');
  const me=await login.rpc('mision_me');
  const stillValid=await rpc('mision_coordinator_active',{p_hash:digest});
  if(me.error||me.data?.[0]?.family!==14||me.data?.[0]?.is_treasurer||!stillValid){await rpc('mision_access_revoke_sessions',{p_user:verified.data.user!.id});throw Error('Role validation failed');}
  return reply({session:{access_token:verified.data.session.access_token,refresh_token:verified.data.session.refresh_token}});
 }catch{return reply({error:'No se pudo abrir el acceso. Vuelve a intentar o solicita un enlace nuevo a la tesorera.'},400);}
});
