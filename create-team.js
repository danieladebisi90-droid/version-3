'use strict';
// Scoridium team setup: relies on existing window.supabaseClient initialization.
(() => {
  const $ = id => document.getElementById(id);
  const state = { type: 'school', primary: '#181818', secondary: '#9299A5', activeColour: 'primary', basePrimary: '#181818', baseSecondary: '#9299A5', shadePrimary: 0, shadeSecondary: 0, saving: false };
  const validHex = value => /^#[0-9a-fA-F]{6}$/.test(value);
  const normalizeHex = value => value.trim().toUpperCase();
  const rgb = h => [1,3,5].map(n => parseInt(h.slice(n,n+2),16));
  const mix = (hex, target, ratio) => {
    const a = rgb(hex); const b = rgb(target);
    return '#' + a.map((x,i)=> Math.round(x*(1-ratio)+b[i]*ratio).toString(16).padStart(2,'0')).join('').toUpperCase();
  };
  const luminance = hex => rgb(hex).map(n=>{const x=n/255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,c,i)=>s+c*[.2126,.7152,.0722][i],0);
  const contrastText = hex => luminance(hex) > .179 ? '#10233E' : '#FFFFFF';
  const autoShade = hex => luminance(hex)<.26 ? mix(hex,'#FFFFFF',.52):mix(hex,'#000000',.44);
  const basicColours = [
    ['Red','#C62828'], ['Blue','#1565C0'], ['Navy','#123B78'],
    ['Green','#21834A'], ['Yellow','#FFD600'], ['Orange','#F57C00'],
    ['Purple','#7436AD'], ['Black','#181818'], ['White','#FFFFFF'],
    ['Grey','#9299A5'], ['Maroon','#800020'], ['Teal','#008C95']
  ];
  function setColourTarget(which){
    if(which==='secondary' && $('auto-secondary').checked) return;
    state.activeColour=which;
    document.querySelectorAll('[data-colour-target]').forEach(button=>{
      const active=button.dataset.colourTarget===which;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    $('palette-title').textContent=`Pick a ${which} colour`;
    renderPalette();
    updateShadeControl();
  }
  function renderPalette(){
    const selected=state[state.activeColour==='primary'?'basePrimary':'baseSecondary'];
    document.querySelectorAll('.palette-swatch').forEach(button=>{
      const active=button.dataset.hex.toUpperCase()===selected.toUpperCase();
      button.classList.toggle('selected',active);
      button.setAttribute('aria-pressed',String(active));
    });
  }
  function shadedColour(base,amount){
    if(amount===0) return base;
    return mix(base,amount>0?'#FFFFFF':'#000000',Math.abs(amount)/100);
  }
  function updateShadeControl(){
    const which=state.activeColour;
    const disabled=which==='secondary' && $('auto-secondary').checked;
    const slider=$('colour-shade-slider');
    slider.disabled=disabled;
    slider.value=state[which==='primary'?'shadePrimary':'shadeSecondary'];
    $('shade-slider-label').textContent=`Adjust ${which} shade`;
    const amount=Number(slider.value);
    $('shade-slider-value').textContent=amount===0?'Original':`${Math.abs(amount)}% ${amount>0?'lighter':'darker'}`;
  }
  function updateColourUI(){
    for(const which of ['primary','secondary']){
      $(which+'-sample').style.backgroundColor=state[which];
      $(which+'-target-hex').textContent=state[which];
      syncColour(which);
    }
    $('target-secondary').disabled=$('auto-secondary').checked;
    $('target-secondary').setAttribute('aria-label',$('auto-secondary').checked?'Secondary colour, automatically generated':'Customize secondary colour');
    $('secondary-picker').disabled=$('auto-secondary').checked;
    $('secondary-hex').disabled=$('auto-secondary').checked;
    renderPalette();
    updateShadeControl();
  }
  function chooseColour(which,hex){
    if(which==='secondary' && $('auto-secondary').checked) return;
    const colour=normalizeHex(hex);
    state[which==='primary'?'basePrimary':'baseSecondary']=colour;
    state[which==='primary'?'shadePrimary':'shadeSecondary']=0;
    state[which]=colour;
    if(which==='primary' && $('auto-secondary').checked){state.secondary=autoShade(state.primary);}
    updateColourUI();
    setTheme();
  }
  $('colour-shade-slider').addEventListener('input',e=>{
    const which=state.activeColour;
    if(which==='secondary' && $('auto-secondary').checked) return;
    const amount=Number(e.target.value);
    state[which==='primary'?'shadePrimary':'shadeSecondary']=amount;
    const base=state[which==='primary'?'basePrimary':'baseSecondary'];
    state[which]=shadedColour(base,amount);
    if(which==='primary' && $('auto-secondary').checked) state.secondary=autoShade(state.primary);
    updateColourUI();
    setTheme();
  });
  $('reset-default-colours').addEventListener('click',()=>{
    state.basePrimary='#181818';state.baseSecondary='#9299A5';
    state.shadePrimary=0;state.shadeSecondary=0;
    state.primary=state.basePrimary;
    state.secondary=$('auto-secondary').checked?autoShade(state.primary):state.baseSecondary;
    updateColourUI();setTheme();
  });
  for(const which of ['primary','secondary']){
    $('target-'+which).addEventListener('click',()=>setColourTarget(which));
  }
  for(const [name,hex] of basicColours){
    const button=document.createElement('button');
    button.type='button';
    button.className='palette-swatch';
    button.dataset.hex=hex;
    button.setAttribute('aria-label',name);
    button.setAttribute('aria-pressed','false');
    const patch=document.createElement('span');
    patch.className='palette-patch';
    patch.style.backgroundColor=hex;
    const caption=document.createElement('span');
    caption.textContent=name;
    button.append(patch,caption);
    button.addEventListener('click',()=>chooseColour(state.activeColour,hex));
    $('simple-palette').append(button);
  }
  const initials = () => {
    if(state.type==='school') return (($('school-name').value.trim().split(/\s+/)[0]?.[0]||'S')+($('mascot').value.trim()[0]||'T')).toUpperCase();
    return ($('club-name').value.trim().split(/\s+/).filter(Boolean).map(w=>w[0]).slice(0,2).join('')||'CT').toUpperCase();
  };
  const division = () => {
    const base = $(state.type==='school'?'school-division':'club-division').value;
    return base==='Other' ? $(state.type==='school'?'school-division-custom':'club-division-custom').value.trim() : base;
  };
  const teamDisplayName = () => state.type==='school'
    ? [$('school-name').value.trim(),$('mascot').value.trim()].filter(Boolean).join(' ')
    : $('club-name').value.trim();
  const setTheme = () => {
    document.documentElement.style.setProperty('--primary',state.primary);
    document.documentElement.style.setProperty('--secondary',state.secondary);
    document.documentElement.style.setProperty('--on-primary',contrastText(state.primary));
    document.documentElement.style.setProperty('--on-secondary',contrastText(state.secondary));
    $('preview-logo').textContent=initials();
    $('preview-name').textContent=teamDisplayName()||'Your Team';
    $('preview-meta').textContent=`${division()||'Division'} · Basketball`;
  };
  function setType(type){
    state.type=type;
    $('school-fields').hidden=type!=='school'; $('club-fields').hidden=type!=='club';
    document.querySelectorAll('.type-option').forEach(b=>{
      const on=b.dataset.type===type;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));
    });
    setTheme();
  }
  document.querySelectorAll('.type-option').forEach(b=>b.addEventListener('click',()=>setType(b.dataset.type)));
  for(const id of ['school-name','mascot','school-division','school-division-custom','club-name','club-division','club-division-custom']) $(id).addEventListener('input',setTheme);
  for(const type of ['school','club']){
    $(type+'-division').addEventListener('change',()=>{
      $(type+'-division-custom-wrap').hidden=$(type+'-division').value!=='Other';
      setTheme();
    });
  }
  for(const which of ['primary','secondary']){
    $(which+'-picker').addEventListener('input',e=>chooseColour(which,e.target.value));
    $(which+'-hex').addEventListener('input',e=>{
      if(validHex(e.target.value)) chooseColour(which,e.target.value);
    });
  }
  function syncColour(which){$(which+'-picker').value=state[which];$(which+'-hex').value=state[which];}
  $('auto-secondary').addEventListener('change',e=>{
    if(e.target.checked){
      state.secondary=autoShade(state.primary);
      setColourTarget('primary');
    } else {
      state.secondary=shadedColour(state.baseSecondary,state.shadeSecondary);
    }
    updateColourUI();
    setTheme();
  });
  updateColourUI();
  const year=new Date().getFullYear();
  for(let y=year-1;y<=year+2;y++){
    const o=document.createElement('option');o.value=`${y}-${y+1}`;o.textContent=o.value;if(y===year)o.selected=true;$('season-select').append(o);
  }
  function showError(msg){$('create-error').textContent=msg;}
  $('create-team-form').addEventListener('submit',async e=>{
    e.preventDefault();if(state.saving)return;
    showError('');
    const school=$('school-name').value.trim();const mascot=$('mascot').value.trim();const club=$('club-name').value.trim();
    if(state.type==='school' && (school.length<2||mascot.length<2)){showError('Enter the school name and mascot.');return;}
    if(state.type==='club' && club.length<2){showError('Enter your club or team name.');return;}
    if(!division()){showError('Enter the division or age group.');return;}
    if(!validHex($('primary-hex').value) || (!$('auto-secondary').checked && !validHex($('secondary-hex').value))){showError('Enter a valid six-digit hex colour.');return;}
    if(!window.supabaseClient){showError('Supabase is not initialized. Add your existing Supabase client script before create-team.js.');return;}
    state.saving=true;$('create-btn').disabled=true;$('create-btn').textContent='Creating team…';
    try{
      const {data:{user},error:authError}=await window.supabaseClient.auth.getUser();
      if(authError||!user)throw new Error('Please sign in before creating a team.');
      const {data,error}=await window.supabaseClient.rpc('create_scoridium_team',{
        p_team_type:state.type,
        p_school_name:state.type==='school'?school:null,
        p_mascot:state.type==='school'?mascot:null,
        p_club_name:state.type==='club'?club:null,
        p_division:division(),
        p_primary_color:state.primary,
        p_secondary_color:state.secondary,
        p_season:$('season-select').value
      });
      if(error)throw error;
      const created=Array.isArray(data)?data[0]:data;
      if(!created?.team_id || !created?.season_id)throw new Error('Team creation returned no team or season ID. Check Supabase.');
      sessionStorage.setItem('selectedTeamId',created.team_id);
      sessionStorage.setItem('selectedSeasonId',created.season_id);
      try {sessionStorage.setItem('scoridium:team-preview:'+created.team_id,JSON.stringify({id:created.team_id,primary_color:state.primary,secondary_color:state.secondary,team_type:state.type,school_name:state.type==='school'?school:'',mascot:state.type==='school'?mascot:'',club_name:state.type==='club'?club:''}));}catch{}
      $('finish-summary').replaceChildren();
      const heading=document.createElement('strong');heading.textContent=teamDisplayName();
      const meta=document.createElement('span');meta.textContent=`${division()} · ${$('season-select').value} · Basketball`;
      $('finish-summary').append(heading,meta);
      $('identity-step').hidden=true;$('finish-step').hidden=false;
      $('step-indicator').textContent='STEP 2 OF 2';$('progress-fill').style.width='100%';
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(error){console.error('Team creation failed:',error);showError(`Couldn't create team: ${error.message}`);}
    finally{state.saving=false;$('create-btn').disabled=false;$('create-btn').textContent='Create Team →';}
  });
  setType('school');
})();
