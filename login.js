const loginForm=document.getElementById('login-form');
loginForm.addEventListener('submit', async event=>{
 event.preventDefault();
 const button=document.getElementById('sign-in-button'),message=document.getElementById('login-error');
 button.disabled=true;button.textContent='Signing in…';message.textContent='';
 try{
   const email=document.getElementById('login-email').value.trim(),password=document.getElementById('login-password').value;
   const {error}=await window.supabaseClient.auth.signInWithPassword({email,password});
   if(error)throw error;
   window.location.href='myTeams.html';
 }catch(error){message.textContent=error.message==='Invalid login credentials'?'Unable to sign in. Check your email and password.':error.message;}
 finally{button.disabled=false;button.textContent='Sign in →';}
});
