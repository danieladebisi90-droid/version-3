(() => {
  const client=window.supabaseClient;
  const msg=document.getElementById('auth-message');
  if(!client){if(msg)msg.textContent='Unable to initialize Supabase. Refresh the page.';return;}
  function show(text,ok=false){msg.textContent=text;msg.classList.toggle('ok',ok)}
  async function submit(form, callback){
    const button=form.querySelector('button[type=submit]');button.disabled=true;
    try{await callback()}catch(err){show(err.message||'Something went wrong. Please try again.')}finally{button.disabled=false}
  }
  const signup=document.getElementById('signup-form');
  signup?.addEventListener('submit',e=>{e.preventDefault();submit(signup,async()=>{
    const email=document.getElementById('signup-email').value.trim(),password=document.getElementById('signup-password').value;
    if(password!==document.getElementById('signup-confirm').value)throw Error('The passwords do not match.');
    if(password.length<8)throw Error('Use a password of at least 8 characters.');
    const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:new URL('myTeams.html',location.href).href}});
    if(error)throw error;
    if(data.session){location.href='myTeams.html';return;}
    show('If registration is available for this email, check your inbox for a confirmation link. After confirming, sign in.',true);
  })});
  const forgot=document.getElementById('forgot-form');
  forgot?.addEventListener('submit',e=>{e.preventDefault();submit(forgot,async()=>{
    const email=document.getElementById('forgot-email').value.trim();
    const redirectTo=new URL('reset-password.html',location.href).href;
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)throw error;
    show('If an account exists for that address, a reset link has been sent. Check your inbox and spam folder.',true);
  })});
  const reset=document.getElementById('reset-form');
  if(reset){
    let recoveryReady=false;
    async function refresh(){const {data}=await client.auth.getSession();recoveryReady=!!data.session;
      document.getElementById('reset-description').textContent=recoveryReady?'Enter a new password for your account.':'Open this page from your password reset email to verify your recovery link.';
      reset.querySelector('button').disabled=!recoveryReady;
    }
    client.auth.onAuthStateChange((event)=>{if(event==='PASSWORD_RECOVERY'||event==='SIGNED_IN')refresh()});
    refresh();
    reset.addEventListener('submit',e=>{e.preventDefault();submit(reset,async()=>{
      if(!recoveryReady)throw Error('Open the reset link from your email first.');
      const password=document.getElementById('new-password').value;
      if(password!==document.getElementById('confirm-password').value)throw Error('The passwords do not match.');
      if(password.length<8)throw Error('Use a password of at least 8 characters.');
      const {error}=await client.auth.updateUser({password});if(error)throw error;
      show('Your password has been updated. You can now sign in.',true);
      await client.auth.signOut();recoveryReady=false;
    })});
  }
})();
