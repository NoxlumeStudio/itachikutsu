/* Independent sound layer. Does not modify story state or navigation handlers. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const SETTINGS_KEY = 'itachikutsu-audio-settings-v1';
  const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
  const defaults = {masterEnabled:true,seEnabled:true, seVolume:.35, bgmVolume:.25};
  let settings = {...defaults};
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if(saved && typeof saved === 'object') settings = {
      masterEnabled:saved.masterEnabled !== false,
      seEnabled:saved.seEnabled !== false,
      seVolume:clamp(saved.seVolume ?? defaults.seVolume),
      bgmVolume:clamp(saved.bgmVolume ?? defaults.bgmVolume)
    };
  } catch { /* Sound preferences should never block the game. */ }

  const save = () => {try {localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))} catch {}};
  const bgm = document.createElement('audio');
  bgm.src = './assets/itachikutsu-ame-no-sukima-loop.wav';
  bgm.loop = true;
  bgm.preload = 'auto';
  bgm.volume = settings.bgmVolume;
  const song = document.createElement('audio');
  song.src = './assets/rena-garasu-no-yoru.mp3';
  song.preload = 'auto';
  song.loop = false;
  const karaokeTracks = {
    '001':{title:'夜霧の街角',src:'./assets/001_showa_kayou_instrumental.mp3'},
    '002':{title:'ネオンの向こう側',src:'./assets/002_80s_citypop_instrumental.mp3'},
    '003':{title:'帰らぬ灯',src:'./assets/003_enka_instrumental.mp3'}
  };
  const karaoke = document.createElement('audio');
  karaoke.preload = 'none';
  karaoke.loop = false;
  let karaokeActive = false, karaokeNumber = '', karaokeListener = null;
  const karaokeStatus = (playing=karaokeActive) => {
    try {karaokeListener?.({number:karaokeNumber,title:karaokeTracks[karaokeNumber]?.title||'',playing})} catch {}
  };
  let songActive = false;
  song.addEventListener('ended', () => {songActive=false;unlockMusic()});
  karaoke.addEventListener('ended', () => {karaokeActive=false;karaokeNumber='';karaokeStatus(false);unlockMusic()});
  karaoke.addEventListener('error', () => {karaokeActive=false;karaokeStatus(false);unlockMusic()});
  let audioContext = null;
  const lastSound = {};
  let lastHoverTarget = null;

  function unlockMusic(){
    if(!settings.masterEnabled || songActive || karaokeActive || !bgm.paused || settings.bgmVolume === 0) return;
    const attempt = bgm.play();
    if(attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
  }
  function playSong(){
    songActive = true;
    stopKaraoke();
    bgm.pause();
    song.pause();
    song.currentTime = 0;
    // The vocal insert is mastered more prominently than the ambient loop.
    song.volume = Math.min(1, settings.bgmVolume * 0.9);
    if(!settings.masterEnabled)return;
    const attempt = song.play();
    if(attempt && typeof attempt.catch === 'function')attempt.catch(() => {songActive=false;unlockMusic()});
  }
  function stopSong(){
    if(!songActive && song.paused)return;
    songActive = false;
    song.pause();
    song.currentTime = 0;
    unlockMusic();
  }
  function playKaraoke(number){
    const id=String(number).padStart(3,'0');
    const track=karaokeTracks[id];
    if(!track || songActive || !settings.masterEnabled)return false;
    karaoke.pause();
    karaokeActive=true;
    karaokeNumber=id;
    bgm.pause();
    karaoke.src=track.src;
    karaoke.currentTime=0;
    karaoke.volume=settings.bgmVolume;
    karaokeStatus(true);
    const attempt=karaoke.play();
    if(attempt&&typeof attempt.catch==='function')attempt.catch(()=>{
      karaokeActive=false;karaokeStatus(false);unlockMusic();
    });
    return true;
  }
  function stopKaraoke(){
    if(!karaokeActive&&karaoke.paused)return;
    karaokeActive=false;
    karaokeNumber='';
    karaoke.pause();
    karaoke.currentTime=0;
    karaokeStatus(false);
    unlockMusic();
  }
  function onKaraokeState(callback){karaokeListener=typeof callback==='function'?callback:null;if(karaokeListener)karaokeStatus()}
  window.ItachikutsuAudio = {playSong,stopSong,playObjectSound,playKaraoke,stopKaraoke,onKaraokeState};
  function context(){
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if(!AudioContextClass) return null;
    if(!audioContext) audioContext = new AudioContextClass();
    if(audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    return audioContext;
  }
  const tones = {
    text:{frequency:630,end:580,duration:.026,level:.017,type:'triangle',cooldown:38},
    move:{frequency:810,end:750,duration:.042,level:.019,type:'sine',cooldown:90},
    confirm:{frequency:330,end:290,duration:.082,level:.029,type:'sine',cooldown:60},
    cancel:{frequency:475,end:260,duration:.100,level:.022,type:'sine',cooldown:60}
  };
  function sound(name){
    if(!settings.masterEnabled || !settings.seEnabled || settings.seVolume === 0) return;
    const profile = tones[name];
    if(!profile) return;
    const now = performance.now();
    if(now - (lastSound[name] ?? -Infinity) < profile.cooldown) return;
    lastSound[name] = now;
    try {
      const ctx = context();
      if(!ctx) return;
      const start = ctx.currentTime + .003;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = profile.type;
      oscillator.frequency.setValueAtTime(profile.frequency,start);
      oscillator.frequency.exponentialRampToValueAtTime(profile.end,start + profile.duration);
      gain.gain.setValueAtTime(.0001,start);
      gain.gain.linearRampToValueAtTime(profile.level * settings.seVolume,start + .006);
      gain.gain.exponentialRampToValueAtTime(.0001,start + profile.duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(start);
      oscillator.stop(start + profile.duration + .004);
      oscillator.onended = () => {oscillator.disconnect();gain.disconnect()};
    } catch { /* Audio playback is optional. */ }
  }

  // Short, restrained object foley. All sounds share the existing SE switch/slider.
  // Synthesis uses no external audio assets and never touches story state.
  const objectEffects = {
    radio:'static',akariradio:'static',candy:'candyglass',finger:'metal',
    parcel:'paper',slip:'paper',receipt:'paper',battery:'metal',
    ramen:'ceramic',pot:'ceramic',glass:'glass',ramune:'glass',
    prostheticleg:'servo',eye:'glass',stamp:'servo',surgerybed:'metal',
    hibachi:'ember',karaoke:'static',makeup:'paper',medicalnotes:'paper',
    parkbin:'metal',lantern:'paper',shopback:'servo',flowers:'glass',storeback:'metal',parkbench:'wood',register:'metal'
  };
  // Real-world materials are mostly short, irregular attacks rather than pitched
  // oscillator sweeps (which sounded like a cartoon jump). Radio keeps its hiss.
  const objectProfiles = {
    static:{duration:.30,level:.105,filter:'bandpass',frequency:1450,q:.7,hits:[0],decay:.25},
    paper:{duration:.18,level:.085,filter:'lowpass',frequency:2900,q:.55,hits:[0,.022,.049],decay:.027},
    ember:{duration:.14,level:.065,filter:'highpass',frequency:3000,q:.7,hits:[0,.057],decay:.012},
    candyglass:{duration:.22,level:.075,filter:'highpass',frequency:1650,q:.65,hits:[0,.068,.137],decay:.013,ring:[1760,2640],ringDecay:.055,ringMix:.24},
    glass:{duration:.17,level:.080,filter:'highpass',frequency:1900,q:.65,hits:[0,.067],decay:.015,ring:[1510,2290],ringDecay:.070,ringMix:.26},
    metal:{duration:.18,level:.090,filter:'bandpass',frequency:1750,q:.7,hits:[0,.042,.093],decay:.022,ring:[2030,3190],ringDecay:.036,ringMix:.14},
    ceramic:{duration:.15,level:.082,filter:'lowpass',frequency:1300,q:.8,hits:[0,.057],decay:.026},
    servo:{duration:.19,level:.078,filter:'bandpass',frequency:850,q:.7,hits:[0,.035,.081,.115],decay:.018},
    wood:{duration:.18,level:.075,filter:'lowpass',frequency:700,q:.5,hits:[0,.09],decay:.039}
  };
  function playObjectSound(key){
    const kind = objectEffects[key];
    if(!kind || !settings.masterEnabled || !settings.seEnabled || settings.seVolume===0)return false;
    const profile = objectProfiles[kind];
    const now=performance.now();
    if(now-(lastSound['object:'+kind]??-Infinity)<115)return true;
    lastSound['object:'+kind]=now;
    try{
      const ctx=context();if(!ctx)return true;
      const start=ctx.currentTime+.004;
      const gain=ctx.createGain();
      const peak=profile.level*settings.seVolume;
      gain.gain.setValueAtTime(peak,start);
      gain.connect(ctx.destination);
      const frames=Math.max(1,Math.floor(ctx.sampleRate*profile.duration));
      const buffer=ctx.createBuffer(1,frames,ctx.sampleRate);
      const channel=buffer.getChannelData(0);
      for(let i=0;i<frames;i++){
        const t=i/ctx.sampleRate;
        const envelope=kind==='static'
          ? (.55+.25*Math.sin(t*31)**2)*Math.min(1,t/.009)*Math.min(1,(profile.duration-t)/.04)
          : profile.hits.reduce((sum,hit)=>sum+(t>=hit?Math.exp(-(t-hit)/profile.decay):0),0);
        const transient=(Math.random()*2-1)*Math.min(1,envelope);
        // A quiet, fixed-frequency tail gives glass/metal a brief hard "clink".
        // No sweeping pitch: it must feel like an object, never a UI chime.
        const ringing=profile.ring?profile.hits.reduce((sum,hit)=>{
          if(t<hit)return sum;
          const age=t-hit;
          const decay=Math.exp(-age/profile.ringDecay);
          return sum+decay*(Math.sin(2*Math.PI*profile.ring[0]*age)+.43*Math.sin(2*Math.PI*profile.ring[1]*age));
        },0)*profile.ringMix:0;
        channel[i]=Math.max(-1,Math.min(1,transient+ringing));
      }
      const source=ctx.createBufferSource();
      source.buffer=buffer;
      const filter=ctx.createBiquadFilter();
      filter.type=profile.filter;
      filter.frequency.value=profile.frequency;
      filter.Q.value=profile.q;
      source.connect(filter);filter.connect(gain);
      source.start(start);
      source.stop(start+profile.duration+.003);
      source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect()};
    }catch{/* Effects are optional and must never interrupt interaction. */}
    return true;
  }

  const panel = $('soundPanel');
  const button = $('soundSettingsBtn');
  const enabled = $('seEnabled');
  const seVolume = $('seVolume');
  const bgmVolume = $('bgmVolume');
  panel.insertAdjacentHTML?.('afterbegin','<label>音モード <select id="soundMode" aria-label="音モード"><option value="on">ON</option><option value="off">OFF</option></select></label>');
  const soundMode = $('soundMode');
  soundMode.value = settings.masterEnabled?'on':'off';
  soundMode.addEventListener('change',()=>{
    settings.masterEnabled=soundMode.value==='on';
    if(!settings.masterEnabled){bgm.pause();song.pause();karaoke.pause()}
    else if(songActive){const attempt=song.play();attempt?.catch?.(()=>{})}
    else if(karaokeActive){const attempt=karaoke.play();attempt?.catch?.(()=>{})}
    else unlockMusic();
    save();
  });
  enabled.checked = settings.seEnabled;
  seVolume.value = String(Math.round(settings.seVolume * 100));
  bgmVolume.value = String(Math.round(settings.bgmVolume * 100));
  button.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    button.setAttribute('aria-expanded',String(!panel.hidden));
  });
  enabled.addEventListener('change', () => {settings.seEnabled = enabled.checked;save();if(enabled.checked)sound('confirm')});
  seVolume.addEventListener('input', () => {settings.seVolume = clamp(seVolume.value / 100);save()});
  bgmVolume.addEventListener('input', () => {
    settings.bgmVolume = clamp(bgmVolume.value / 100);
    bgm.volume = settings.bgmVolume;
    song.volume = Math.min(1, settings.bgmVolume * 2.5);
    karaoke.volume = settings.bgmVolume;
    if(settings.bgmVolume > 0) unlockMusic();
    save();
  });
  document.addEventListener('pointerdown', unlockMusic, {capture:true});
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape') {if(!panel.hidden){panel.hidden = true;button.setAttribute('aria-expanded','false')}sound('cancel')}
    if(event.key === 'Enter' || event.key === ' ') unlockMusic();
    if(event.key === 'ArrowDown' || event.key === 'ArrowUp') sound('move');
  });
  document.addEventListener('pointerover', event => {
    const target = event.target.closest?.('.hotspot,.choice,.item');
    if(!target || target === lastHoverTarget) return;
    lastHoverTarget = target;
    sound('move');
  });
  document.addEventListener('click', event => {
    const target = event.target;
    if(target.closest?.('#soundPanel,#soundSettingsBtn')) return;
    const hotspot=target.closest?.('.hotspot');
    if(hotspot && objectEffects[hotspot.dataset?.soundKey])return;
    if(target.closest?.('#nextBtn,#line,#speaker')) return sound('text');
    if(target.closest?.('#closeModal,#resetNo,#mapBtn')) return sound('cancel');
    if(target.closest?.('button,.hotspot')) sound('confirm');
  }, {capture:true});
})();
