document.addEventListener('DOMContentLoaded', () => {
 const old = document.getElementById('login-form');
 const status = document.getElementById('auth-status');
 if (!old) return;
 const form = old.cloneNode(true);
 old.replaceWith(form);
 form.addEventListener('submit', async e => {
  e.preventDefault();
  const button = form.querySelector('[type="submit"]');
  if(button) button.disabled=true;
  const say = msg => { if(status) status.textContent=msg; };
  try {
   const cfg=window.MISION_CONFIG;
   const create=window.misionCreateClient;
   if(!cfg || !create) throw Error('No se pudo cargar la conexión.');
   const fields=new FormData(form);
   const username=String(fields.get('username')||'').trim().toLowerCase();
   const password=String(fields.get('password')||'');
   if(!username || !password) throw Error('Escribe tu usuario y contraseña.');
   say('Ingresando…');
   const client=create(cfg.url,cfg.publishableKey);
   const response=await client.functions.invoke('mision-access',{body:{action:'login',username,password}});
   if(response.error) {
    const details=await response.error.context?.json?.().catch(()=>null);
    throw Error(details?.error || response.error.message);
   }
   if(!response.data?.session) throw Error('No se recibió una sesión.');
   const saved=await client.auth.setSession(response.data.session);
   if(saved.error) throw saved.error;
   const me=await client.rpc('mision_me');
   if(me.error) throw me.error;
   if(!me.data?.[0]?.family) throw Error('La sesión se abrió, pero no se reconoció la familia.');
   say('Sesión iniciada. Abriendo tu cuenta…');
   window.location.reload();
  } catch(err) {
   say('Error: '+(err.message||'No se pudo ingresar.'));
   if(button) button.disabled=false;
  }
 });
});