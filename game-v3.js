/* 鼬窟 ― 千夜のある一日 ― : story and exploration system v3 */
(() => {
  'use strict';
  // The verification build NEVER writes to the live Ver.87 save key.
  const REVIEW = typeof window !== 'undefined' && window.ITACHIKUTSU_REVIEW === true;
  const KEY = REVIEW ? 'itachikutsu-story-v3-review-v1' : 'itachikutsu-story-v3';
  const PREF_KEY = REVIEW ? 'itachikutsu-reading-review-v1' : 'itachikutsu-reading-v1';
  const LOG_KEY = REVIEW ? 'itachikutsu-history-review-v1' : 'itachikutsu-history-v1';
  const ENDING_KEY = REVIEW ? 'itachikutsu-endings-review-v1' : 'itachikutsu-endings-v1';
  const OLD_KEY = 'itachikutsu-prototype-v1';
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const page = (who, text) => ({who, text});
  const narration = text => page('地の文', text);
  const p = (who, ...lines) => lines.map(text => page(who, text));
  const initial = () => ({version:3,scene:'prologue',introIndex:0,introDone:false,stage:0,items:[],flags:{},visited:{},inspected:{},interactions:{},dialogue:null,pending:null,selected:null,finished:false});
  let state = initial(), modal = 'title', transient = null, lyricsVisible = false;
  let recollectionActive = false;
  const unlockedEndings = (()=>{try{return JSON.parse(localStorage.getItem(ENDING_KEY))||{}}catch{return {}}})();
  function syncEndings(){let changed=false;for(const type of ['A','B'])if(state.flags?.[`ending_${type.toLowerCase()}_seen`]&&!unlockedEndings[type]){unlockedEndings[type]=true;changed=true}if(changed)persistEndings()}
  function persistEndings(){try{localStorage.setItem(ENDING_KEY,JSON.stringify(unlockedEndings))}catch{}}
  let assistOn = false;
  const loadJSON=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};
  let prefs={speed:REVIEW?'normal':'instant',auto:false,readPages:[],...loadJSON(PREF_KEY,{})};
  if(!['slow','normal','fast','instant'].includes(prefs.speed))prefs.speed='normal';
  prefs.auto=false; // Never resume automated page turns without a fresh user action.
  let history=loadJSON(LOG_KEY,[]);
  if(!Array.isArray(history))history=[];
  history=history.slice(-100);
  let currentReadKey='',fullyVisible=true,typingTimer=null,autoTimer=null;
  const savePrefs=()=>{try{localStorage.setItem(PREF_KEY,JSON.stringify({...prefs,auto:false,readPages:prefs.readPages.slice(-3000)}))}catch{}};
  const saveHistory=()=>{try{localStorage.setItem(LOG_KEY,JSON.stringify(history.slice(-100)))}catch{}};
  function cancelTimers(){if(typingTimer!==null)clearInterval(typingTimer);if(autoTimer!==null)clearTimeout(autoTimer);typingTimer=autoTimer=null}
  function setAuto(on){prefs.auto=!!on;$('autoBtn')?.setAttribute?.('aria-pressed',String(prefs.auto));if($('autoBtn'))$('autoBtn').textContent=`AUTO：${prefs.auto?'ON':'OFF'}`;if(!on&&autoTimer!==null){clearTimeout(autoTimer);autoTimer=null}else if(on)queueAuto()}
  function remember(who,text){
    if(!text)return;
    const last=history[history.length-1];
    if(last?.who===who&&last?.text===text&&last?.scene===state.scene)return;
    history.push({who:who||'地の文',text,scene:state.scene});
    if(history.length>100)history.shift();
    saveHistory();
  }
  function readCurrent(){
    fullyVisible=true;
    if(currentReadKey&&!prefs.readPages.includes(currentReadKey)){
      prefs.readPages.push(currentReadKey);
      if(prefs.readPages.length>3000)prefs.readPages.splice(0,prefs.readPages.length-3000);
      savePrefs();
    }
    queueAuto();
  }
  function queueAuto(){
    if(autoTimer!==null){clearTimeout(autoTimer);autoTimer=null}
    if(!prefs.auto||!fullyVisible||modal||$('nextWrap').classList.contains('hidden'))return;
    if(typeof setTimeout!=='function')return;
    const length=($('line').textContent||'').length;
    autoTimer=setTimeout(()=>{autoTimer=null;if(!modal&&prefs.auto)advance(true)},Math.min(9000,1200+length*65));
  }
  function revealNow(){
    if(fullyVisible)return false;
    if(typingTimer!==null){clearInterval(typingTimer);typingTimer=null}
    $('line').textContent=transient?.fullText||$('line').textContent;
    readCurrent();
    return true;
  }
  function renderText(text,who,readKey=''){
    cancelTimers();currentReadKey=readKey;fullyVisible=true;
    const full=String(text);
    $('speaker').textContent=who;
    remember(who,full);
    if(!full||prefs.speed==='instant'||typeof window==='undefined'||typeof setInterval!=='function'){
      $('line').textContent=full;readCurrent();return;
    }
    fullyVisible=false;transient={fullText:full};
    const units=Array.from(full),delay={slow:62,normal:28,fast:8}[prefs.speed]||28;
    let position=0;$('line').textContent='';
    typingTimer=setInterval(()=>{
      position=Math.min(units.length,position+1);
      $('line').textContent=units.slice(0,position).join('');
      if(position===units.length){clearInterval(typingTimer);typingTimer=null;readCurrent()}
    },delay);
  }
  function historyModal(){
    setAuto(false);
    const body=history.slice().reverse().map(entry=>`<div class="history-entry"><span class="history-who">${esc(entry.who)}</span>${esc(entry.text)}</div>`).join('');
    openPanel(`<h2>会話の履歴</h2><div class="history-list">${body||'<p>まだ記録はありません。</p>'}</div>`,'history');
  }
  const inspectId = key => `${state.scene}:${key}`;
  // Story-gated targets (including candy, the finger and radio) remain unmarked
  // until their actual conversation is completed; their later uses stay discoverable.
  const staticInspections = new Set(['register','hibachi','ramune','shopback','lantern','flowers','storeback','pot','karaoke','glass','surgerybed','parklight','parkpuddle','parkbin','parkbench','makeup','rena','clinicprice','prostheticleg','medicalnotes','stamp','citymap','eye']);
  function inspectComplete(key,scene=state.scene){
    if(key.startsWith('go:'))return;
    state.inspected ||= {};
    state.inspected[`${scene}:${key}`]=true;
    saveSilent();
  }
  const flag = name => !!state.flags[name];
  const mark = name => {state.flags[name]=true;saveSilent()};
  const has = id => state.items.includes(id);
  const add = id => {if(!has(id))state.items.push(id);saveSilent()};
  const remove = id => {state.items=state.items.filter(x=>x!==id);saveSilent()};
  function setNext(label){const button=$('nextBtn');button.textContent=label.includes('閉じる')?'閉じる ×':label.includes('駄菓子屋')?'駄菓子屋へ ›':'次へ ›';button.dataset.glyph=label.includes('閉じる')?'×':'›'}
  const scenes = {
    prologue:['鼬窟','この街では、壊れたものが人の姿をして歩いている。'],
    map:['鼬窟',''],
    shop:['お辰の駄菓子屋','砂糖と機械油の匂いが、同じ店に満ちている。'],
    stall:['マサルの屋台','大鍋の湯気の向こうで、古いラジオが鳴っている。雑音に混じる女の歌声が一瞬だけ鮮明になり、すぐにかすれた。千夜はカウンターの端に目を向けた。'],
    warehouse:['鴨下の倉庫','紙と金属に、名前と値段がつけられる場所。'],
    snack:['スナック〈白露〉','桃色の光が古い壁紙を染めている。'],
    clinic:['人体改造クリニック','冷たい蛍光灯の下に、義肢が並んでいる。'],
    park:['小さな公園','青白い蛍光灯と、雨に濡れたベンチ。']
  };
  // The percentages are tied to the existing illustrated backgrounds, not to an invisible grid.
  const H = {
    prologue:[],
    shop:[['お辰',42,19,17,45,'tatsu'],['飴の瓶',7,25,10,19,'candy'],['義指',79,70,11,15,'finger'],['レジ',26,59,16,24,'register'],['火鉢',74.5,48,11.5,17,'hibachi'],['ラムネ瓶',22.4,44,5,24,'ramune'],['紙袋・伝票',60,58,17,30,'parcel'],['奥の作業場',61,14,7,22,'shopback']],
    map:[['お辰の駄菓子屋',7,64,17,17,'go:shop'],['マサルの屋台',84,59,11,18,'go:stall'],['鴨下の倉庫',78,7,16,19,'go:warehouse'],['スナック〈白露〉',25.5,23.7,9,13,'go:snack'],['人体改造クリニック',46,75,10,16,'go:clinic'],['小さな公園',43,39,16,18,'go:park']],
    stall:[['マサル',34.5,18,26,54,'masaru'],['大鍋',16.5,38,19,24,'pot'],['ラーメン',56.5,62.5,16.5,17,'ramen'],['ラジオ',87.5,10,10.5,13,'radioTune'],['赤い提灯',70,20,6,18,'lantern']],
    warehouse:[['鴨下',37.5,16,25,76,'kamoshita'],['義眼',21.5,68,9,11,'eye'],['再刻印装置',83.5,29,14,42,'stamp'],['都市地図',3.5,7,16,42,'citymap'],['伝票台',27.5,33,11.5,14,'ledger'],['医療用保管箱',70,53,12.5,14,'medicalcase'],['倉庫の奥',65,14,13,35,'storeback']],
    snack:[['化粧ポーチ',10,46,10,15,'makeup'],['Re:naのポスター',55,8,11,29,'rena'],['カラオケ機',72,22,16,37,'karaoke'],['グラス',5.5,51,6,12,'glass'],['ミコ姐',39,22,17,71,'miko'],['カウンターの花',22.5,24,9,18,'flowers']],
    clinic:[['料金表',2.5,10,13,28,'clinicprice'],['手術台',20,42,33,23,'surgerybed'],['義足',89,18,9.5,48,'prostheticleg'],['診療記録',15,56,10,8,'medicalnotes'],['ヤブ先生',51.5,23,24,72,'yabu']],
    park:[['蛍光灯',65,3,21,16,'parklight'],['ゴミ箱',84,54,10,24,'parkbin'],['水たまり',63,78,19,15,'parkpuddle'],['ベンチ',24,52,38,31,'parkbench'],['あかり',36,27,16,51,'akari'],['携帯ラジオ',43,44,7,10,'akariradio']]
  };
  const introPages = [
    "この街では、壊れたものが人の姿をして歩いている。",
    "鼬窟《いたちくつ》――都市の片隅に見捨てられ、行き場を失った建物たちが、互いに寄りかかるようにひしめく一画。",
    "光化学スモッグに陽は翳り、折り重なる屋根の下には薄闇が澱んでいる。軒先には義体の部品が日用品と並び、継ぎ接ぎだらけの身体が狭い路地を行き交う。どこまでが生身で、どこからが機械なのか。そんなことを気に留める者は、もういなかった。",
    "そんな鼬窟で暮らす者のひとりに、千夜がいた。幼い頃にお辰に拾われ、この街で育った。今では駄菓子屋の手伝いや、表には出せない荷物の配達をしながら日々を過ごしている。",
    "錆びた屋根も、入り組んだ路地も、そこに暮らす人々も、千夜にとっては当たり前の日常だった。"
  ];
  const notes = {
    ramune:'青いガラスの奥に裸電球が歪んで映っている。瓶の口には古い傷がある。昔、誰かが無理にビー玉を取り出そうとしたのだろう。お辰に見つかれば、ひどく叱られたに違いない。',
    pot:'湯の表面が白く泡立っている。麺を上げるたび、義手の関節が低く鳴った。マサルは音がするたび、ほんの少し手首の角度を変えている。壊れた道具に、人間の方が合わせているようだった。',
    karaoke:'古い画面には、光だらけの都市が映っている。窓も道路も、ここよりずっと明るい。こんな場所を毎晩眺めていたら、自分のいる街が嫌になる人間もいるのかもしれない。',
    glass:'氷はすっかり小さくなっている。縁には口紅が残り、底には薄い酒が溜まっていた。楽しむための酒だったのか、忘れるための酒だったのか、千夜には分からない。',
    surgerybed:'留め具には、何度も取り外した跡がある。白い布の下から古い金属が覗いている。ここで身体を変えた人間は、起き上がったとき、最初に何を確かめるのだろう。',
    parklight:'青白い光が街の夜を四角く切り取っている。ここだけが特別明るいわけではない。ただ、他の明かりが遠くにあるせいで、ひどく目立っていた。',
    parkpuddle:'水たまりには建物の窓明かりと蛍光灯が映っている。千夜が足を動かすと、二つの光は一緒に砕けた。',
    parkbin:'錆びた金網の底に、雨を吸った紙くずが貼りついている。誰かにとって不要だったものが、誰にも拾われずに残っていた。ここでは、捨てられたものがすべて使い直されるわけではないらしい。'
  };
  function saveSilent(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}}
  function show(text='',who='',readKey=''){
    $('line').classList.remove('intro-full-text');
    $('app').classList.toggle('dialogue-active',Boolean(text));
    renderText(text,who,readKey);
    $('choices').innerHTML='';
    $('nextWrap').classList.toggle('hidden',!text);
    setNext(state.dialogue?'次へ ▶':'閉じる ×');
    $('skipBtn').hidden=!state.dialogue;
    queueAuto();
  }
  function showIntro(){
    setAuto(false);cancelTimers();
    const text=introPages.join('\n');
    show(text,'','intro:full');revealNow();
    currentReadKey='intro:full';fullyVisible=true;
    $('line').classList.add('intro-full-text');
    $('skipBtn').hidden=true;
    $('chapterText').textContent='PROLOGUE';
    $('questShort').textContent='鼬窟';
    setNext('駄菓子屋へ ▶');
    $('nextWrap').classList.remove('hidden');
    $('line').scrollTop=0;
    document.querySelector('.log').scrollTop=0;
  }
  function advanceIntro(){finishIntro()}
  function finishIntro(){
    state.introDone=true;
    state.scene='shop';
    state.visited.shop=true;
    state.introIndex=introPages.length-1;
    saveSilent();render();short('奥では、お辰が義指を磨いている。');
  }
  function short(text,who='',observeKey=''){
    if(state.dialogue)return;
    show(text,who);
    // Keep the original inspection prose visible; the optional action merely
    // offers a clear way into the already-existing close observation panel.
    if(observeKey){
      const b=document.createElement('button');
      b.type='button';b.className='choice observe-followup';
      b.textContent=observeKey==='register'?'レジを操作する ›':observeKey==='prostheticleg'?'義足を組み立てる ›':'詳しく観察する ›';b.setAttribute('aria-label',observeKey==='register'?'レジを操作する':observeKey==='prostheticleg'?'義足を組み立てる':'詳しく観察する');
      b.onclick=()=>{if(modal||state.dialogue)return;setAuto(false);if(observeKey==='register')registerModal();else if(observeKey==='prostheticleg')legPuzzleModal();else observeObject(observeKey)};
      $('choices').appendChild(b);
    }
  }
  function event(id,lines){
    if(state.dialogue)return;
    // Character conversations use spoken lines only; exploration prose and the prologue remain intact.
    const spoken=lines.filter(line=>line.who!=='地の文');
    state.dialogue={id,index:0,lines:spoken,origin:state.scene};
    saveSilent();displayPage();
  }
  function displayPage(){
    const d=state.dialogue;if(!d)return;
    const e=d.lines[d.index];if(!e){finishEvent();return}
    show(e.text,e.who,`event:${d.id}:${d.index}`);
    setNext(d.index===d.lines.length-1?'閉じる ×':'次へ ▶');
    saveSilent();
  }
  function advance(fromAuto=false){
    if(modal)return;
    if(!fromAuto)setAuto(false);
    if(revealNow())return;
    if(state.scene==='prologue'&&!state.introDone){advanceIntro();return}
    if(!state.dialogue){show('');return}
    state.dialogue.index++;
    if(state.dialogue.index>=state.dialogue.lines.length)finishEvent();else displayPage();
  }
  function finishEvent(skipped=false){
    const id=state.dialogue?.id;if(!id)return;
    const exploredByDialogue=state.dialogue?.exploreKey;
    const origin=state.dialogue?.origin;
    state.dialogue=null;
    $('skipBtn').hidden=true;
    // Skipping completes the story event, but does not claim it was inspected/read.
    if(exploredByDialogue&&!skipped)inspectComplete(exploredByDialogue,origin);
    switch(id){
      case 'otatsu':mark('otatsu_intro_done');state.stage=10;break;
      case 'masaru':mark('masaru_intro_done');break;
      case 'ramen':mark('ate_ramen');break;
      case 'radio':mark('heard_rena_radio');break;
      case 'batteryHint':mark('battery_spotted');break;
      case 'battery':if(!flag('battery_taken')&&!flag('battery_given'))add('battery');mark('battery_spotted');mark('battery_taken');break;
      case 'miko':mark('miko_intro_done');break;
      case 'mikoLater':mark('miko_after_delivery_done');break;
      case 'yabu':mark('yabu_intro_done');break;
      case 'yabuStamp':mark('yabu_stamp_talk_done');break;
      case 'delivery':remove('parcel');remove('slip');add('receipt');mark('delivery_complete');state.stage=30;break;
      case 'kamoStamp':mark('kamoshita_stamp_talk_done');break;
      case 'akari':mark('met_akari');mark('akari_battery_weak');if(state.stage>=30)state.stage=40;break;
      case 'batteryGive':remove('battery');mark('battery_given');state.selected=null;break;
      case 'candyGive':remove('candy');mark('candy_given');state.selected=null;break;
      case 'candyEat':remove('candy');mark('candy_eaten');state.selected=null;break;
      case 'candyTake':add('candy');break;
      case 'return':remove('receipt');state.stage=50;state.finished=true;mark('returned_to_otatsu');break;
      case 'masaruLater':mark('masaru_after_akari_done');break;
      case 'ramenInvite':mark('invited_akari_to_ramen');break;
    }
    saveSilent();render();
    if(id==='otatsu')short('紙袋と伝票を受け取ろう。');
    else if(id==='delivery')short('受領印が押された。公園の方から、遠いラジオの音がする。');
    else if(id==='radio')short('古いラジオのそばには、使いかけの部品や小さな箱が置かれている。もう少し調べてみてもよさそうだ。');
    else if(id==='akari')short('雨は少し弱まっていた。帰れば、お辰がまだ起きているだろう。');
    else if(id==='battery')showBatteryAcquired();
    else if(id==='candyTake')showCandyAcquired();
    else if(id==='batteryGive')lyricsModal();
    else if(id==='return')endingChoiceA();
    else if(id==='aApproach')endingSequence('A');
    else if(id==='ramenInvite')event('bApproach',[page('','ラジオから流れていた歌が終わっても、あかりはしばらく黙っていた。千夜がラーメンに誘うと、あかりは弾むように立ち上がった。二人は濡れた路地を、マサルの屋台へ向かって歩き出す。')]);
    else if(id==='bApproach')endingSequence('B');
    else show('');
  }
  function canSee(key){if(key==='miko'||key==='yabu')return state.stage>=10;if(key==='akari'||key==='akariradio')return state.stage>=30;if(key==='parcel')return state.stage<=10 || (state.stage===20&&(!has('parcel')||!has('slip')));return true}
  function render(){
    const [title]=scenes[state.scene];$('scene').className='scene '+state.scene+(state.scene==='clinic'&&flag('clinic_leg_puzzle_complete')?' clinic-leg-complete':'');
    const visible={otatsuSprite:false,shopCounterForeground:false,parcelSprite:state.scene==='shop'&&state.stage<=10&&!has('parcel'),masaruSprite:state.scene==='stall',kamoshitaSprite:state.scene==='warehouse',mikoSprite:state.scene==='snack'&&state.stage>=10,yabuSprite:state.scene==='clinic'&&state.stage>=10,akariSprite:state.scene==='park'&&state.stage>=30};
    for(const [id,on] of Object.entries(visible))$(id).classList.toggle('hidden',!on);
    $('sceneTitle').textContent=title;$('sceneChapter').textContent='鼬窟';
    $('sceneStatus').textContent=state.stage===0?'日暮れ':state.stage<30?'配達中':state.stage<40?'夜の帰り道':state.stage<50?'帰路':'仕事終わり';
    $('chapterText').textContent='';
    $('questShort').textContent=state.stage===0?'':state.stage<20?'':state.stage<30?'荷物を届ける':state.stage<40?'':state.stage<50?'受領伝票を返す':'';
    $('itemCount').textContent=state.items.length;
    updateUseMode();
    const prompt=$('interactionPrompt');if(prompt)prompt.hidden=true;
    document.querySelector('.scene-note').textContent='';
    $('hotspots').innerHTML='';
    $('hotspots').classList.toggle('assist-on',assistOn);
    $('assistBtn')?.setAttribute?.('aria-pressed',String(assistOn));
    for(const [name,x,y,w,h,key] of H[state.scene]){
      if(!canSee(key))continue;
      const b=document.createElement('button');
      b.className='hotspot '+(state.scene==='map'?'map-entry':state.scene+'-target')+(key.startsWith('go:')?' destination':'');
      b.style.cssText=`left:${x}%;top:${y}%;width:${w}%;height:${h}%;`;
      b.innerHTML=`<span class="symbol"></span><span class="name">${esc(name)}</span><span class="hint"></span>`;
      b.dataset.soundKey=key;
      if(state.inspected?.[inspectId(key)])b.classList.add('inspected');
      b.setAttribute('aria-label',name);
      if(state.scene==='map'&&state.stage>=30&&key==='go:park')b.classList.add('story-pulse');
      b.onclick=()=>act(key);$('hotspots').appendChild(b);
    }
    const isIntro=state.scene==='prologue'&&!state.introDone;
    $('mapBtn').disabled=state.scene==='map'||isIntro;
    $('itemsBtn').disabled=isIntro;
    $('questBtn').disabled=isIntro;
  }
  function go(destination){
    setAuto(false);cancelTimers();
    if(state.scene==='prologue'&&!state.introDone)return;
    if(!scenes[destination])return;
    state.selected=null;updateUseMode();
    state.scene=destination;state.visited[destination]=true;render();
    if(state.pending&&state.pending.origin===destination){state.dialogue=state.pending;state.pending=null;displayPage();saveSilent();return}
    if(destination==='map')show('');
    else if(destination==='snack'&&state.stage===0)short('店には誰もいない。飲みかけのグラスと、開いた化粧ポーチが残されている。');
    else if(destination==='clinic'&&state.stage===0)short('奥から金属を削る音が聞こえる。医者はまだ手が離せないらしい。');
    else if(destination==='park'&&state.stage<30)short('濡れたベンチには誰もいない。青白い蛍光灯が空いた座面を照らしている。');
    else if(destination==='park'&&!flag('met_akari'))short('青白い灯りの下、セーラー服の少女が古いラジオを胸に抱いている。');
    else short(scenes[destination][1]);
    saveSilent();
  }
  function returnMap(){modal='';closePanel();if(state.dialogue){state.pending=state.dialogue;state.dialogue=null;saveSilent()}go('map')}
  function resumeScene(){if(state.scene==='prologue'&&!state.introDone)showIntro();else if(state.dialogue)displayPage();else short(scenes[state.scene][1])}
  // Story events are defined independently of the clickable map geometry.
  function otatsu(){
    if(state.stage===50){endingChoiceA();return}
    if(state.stage>=30&&has('receipt')){
      event('return',[narration('火鉢の炭は小さくなっていた。お辰はまだ義指を磨いている。千夜が戸を開けると、お辰は振り返らずに口を開いた。'),...p('お辰','……帰ったのかい。随分と道草を食ったもんだね'),...p('千夜','ちゃんと届けたよ。ほら、受領印'),...p('お辰','見れば分かるよ。あんたが真っ直ぐ帰ってくるほど、面白みのない子じゃないってこともね'),...p('千夜','鴨下、今週中に上物をまとめろってさ'),narration('お辰の手が止まる。'),...p('お辰','……昔から、人に頼むときだけは景気のいい男だよ'),...p('千夜','断れねぇのか'),...p('お辰','断るのは簡単さ。そのあと誰が困るかを考えなきゃいいんだからね'),...p('千夜','……面倒くせぇ商売だな'),...p('お辰','あたしも、もう少し楽な仕事がしたかったよ。……それで、ほかには？'),...p('千夜','……別に'),...p('お辰','そうかい。じゃあ、無理に聞かないよ。話したくなったら話しな'),narration('千夜は火鉢のそばに座る。お辰は義指を持ち上げ、一度だけ曲げた。関節は滑らかに動いた。'),...p('お辰','ほら。まだ働ける。あんたも、もう少し働きな'),...p('千夜','帰ってきたばっかだろ'),...p('お辰','配達は終わったさ。でも奥の解体はこれからだよ。……見習いなら、見るのも仕事だ')]);return;
    }
    if(flag('otatsu_intro_done')){
      if(state.stage===50)short('お辰は火箸で灰を返している。「……今日はもう休みな。仕事は明日もあるんだから」','お辰');
      else if(state.stage>=30)short('「受領印はもらったんだろうね。……少し休んでおいで。今夜はもう急ぐ仕事もないさ」','お辰');
      else if(!has('parcel'))short('「袋を忘れて、何を届ける気だい。台の上を見な」','お辰');
      else if(!has('slip'))short('「紙一枚でも、ないと困る世の中なんだよ。伝票を持っていきな」','お辰');
      else short('「何をうろうろしてるんだい。鴨下を待たせると、あいつはその分だけ喋るよ」','お辰');return;
    }
    event('otatsu',[narration('鼬窟の日暮れは早い。配管が軋み、どこかで鍋が鳴る。お辰の店には砂糖と機械油の匂いが満ちていた。'),...p('お辰','……来たね。戸を開けたら、まず言うことがあるだろうに'),...p('千夜','おはよう'),...p('お辰','聞こえたよ。死人を起こすみたいな声だねぇ。ちゃんと寝たのかい'),...p('千夜','寝たよ。婆さんこそ、その指、まだいじってんのか'),...p('お辰','まだ、じゃないよ。今日も、だ。昨日直したところが今日まで持つとは限らないからね'),...p('千夜','買い替えた方が早いだろ'),...p('お辰','そりゃ、あんたが買ってくれるならね。……ほら、この関節。前の持ち主がずいぶん酷使したんだろうさ。捨てるにゃ早すぎる'),...p('千夜','物好きだな'),...p('お辰','そうだよ。あんたを拾ったときから、あたしゃ物好きさ'),narration('千夜が黙ると、お辰は何事もなかったように紙袋を指した。'),...p('お辰','鴨下のところへ持っていきな。いつもの倉庫だよ'),...p('千夜','またあいつかよ'),...p('お辰','そんな顔するんじゃないよ。あたしだって好きで付き合ってるわけじゃないんだから'),...p('千夜','じゃあ断れよ'),...p('お辰','断って済む商売ばかりなら、こんな年まで働いてないさ。……伝票も忘れるんじゃないよ。表だけ見て仕事をした気になるんじゃない'),...p('千夜','分かってる'),...p('お辰','その口が一番信用ならないねぇ。……鴨下が何を言っても、真に受けるんじゃないよ。あいつは、人の欲しがる言葉をよく知ってる'),...p('千夜','別に、欲しいもんなんかねぇよ'),...p('お辰','……そうだといいけどね')]);
  }
  function masaru(){
    if(flag('met_akari')&&!flag('masaru_after_akari_done')){event('masaruLater',[...p('マサル','……まだ腹減ってんのか'),...p('千夜','違ぇよ。さっきのラジオ、何時までやってんだ'),...p('マサル','……さあな。気になるなら、自分で聴いてけ'),...p('千夜','別に、あたしが聴きたいわけじゃねぇよ'),...p('マサル','……そうか')]);return}
    if(flag('masaru_intro_done')){short('マサルは顎だけで挨拶した。「……鍋の火を見るだけなら、金は取らねぇ」','マサル');return}
    const courier=state.stage>=10;
    event('masaru',[narration('鍋が煮える音が路地の雨音をかき消している。安物の義手が柄杓を握り、湯気の向こうでマサルが顔を上げた。'),...p('マサル','……なんだ。腹減ったのか'),...p('千夜','客に向かって、なんだはねぇだろ'),...p('マサル','金は'),...p('千夜','ない'),...p('マサル','なら、客じゃねぇな'),...p('千夜','相変わらず愛想の悪い店だな'),...p('マサル',courier?'愛想で腹は膨れねぇ。……婆さんの使いか':'愛想で腹は膨れねぇ。……まあ座れ'),...(courier?[...p('千夜','分かるのかよ'),...p('マサル','その袋、もう何度も見た。お前の顔より覚えてる'),...p('千夜','ひでぇな')]:[]),narration('マサルは義手で麺を引き上げる。関節が一度だけ引っかかった。'),...p('千夜','……腕、大丈夫か'),...p('マサル','動いてる'),...p('千夜','そういうことじゃねぇよ'),...p('マサル','なら、どういうことだ'),...p('千夜','……別に'),...p('マサル','だったら、黙って座ってろ'),narration('しばらくして、カウンターに丼が置かれる。'),...p('千夜','頼んでねぇぞ'),...p('マサル','余りもんだ。捨てるのも面倒でな'),...p('千夜','そんなに余るなら、作りすぎんなよ'),...p('マサル','お前が来ると思ってなかったからな'),...p('千夜','……嘘つけ'),...p('マサル','伸びるぞ')]);
  }
  function miko(){
    if(flag('miko_intro_done')){
      if(flag('delivery_complete')&&!flag('miko_after_delivery_done')){event('mikoLater',[...p('ミコ姐','また来たの？　あんた、うちの常連になりたいわけ？'),...p('千夜','鴨下のところから帰る途中だよ'),...p('ミコ姐','ああ、あの人。……あんまり真面目に話聞かない方がいいよ。聞いてるうちに、何でも買える気になっちゃうから'),...p('千夜','何か買ったのかよ'),...p('ミコ姐','……買えなかったものの方が、多いかな。ほら、そういう顔しない。せっかく可愛い顔してんだから')]);return}
      short('ミコ姐は金属の指先を撫でた。「なに、また覗きに来たの？　ただで飲めるのはお茶までよ」','ミコ姐');return;
    }
    event('miko',[narration('桃色の光が古い壁紙を照らしている。ミコ姐は鏡の前で、金属製の指先の位置を直していた。'),...p('ミコ姐','あら、千夜じゃん。どうしたの、こんなところに。迷子？'),...p('千夜','違ぇよ。ちょっと覗いただけ'),...p('ミコ姐','なーんだ。客なら一杯くらい奢らせようと思ったのに'),...p('千夜','客でも奢らせるのかよ'),...p('ミコ姐','商売上手って言って。……あ、そこ座んないで。さっきの客がこぼしたから'),...p('千夜','拭けばいいだろ'),...p('ミコ姐','拭いたわよ。三回も。匂いは取れないの。……こういうの、慣れると自分じゃ分かんなくなるのよね'),narration('ミコ姐は指先の義体を曲げる。'),...p('ミコ姐','ねえ、あんたさ。外に出たいとか思わないの？'),...p('千夜','別に。ここで困ってねぇし'),...p('ミコ姐','……そっか。いいね、そういうの'),...p('千夜','何が'),...p('ミコ姐','帰る場所があるってこと。あたしなんか、この店が家なんだか職場なんだか、とっくに分かんなくなっちゃった'),...p('千夜','二十歳だろ。まだ若ぇじゃん'),...p('ミコ姐','ちょっと、そこだけ覚えてんじゃないわよ。……ま、ありがと。慰め方は下手だけどね'),narration('ミコ姐は笑ってみせる。その笑顔は、鏡に向かって何度も練習したもののように見えた。')]);
  }
  function yabu(){
    if(flag('yabu_intro_done')){
      if(flag('look_stamp')&&!flag('yabu_stamp_talk_done')){event('yabuStamp',[...p('千夜','……番号を替えた部品って、普通に使えんのか'),...p('ヤブ先生','番号で神経がつながるなら、俺の仕事も楽になる'),...p('千夜','じゃあ、何で替えるんだよ'),...p('ヤブ先生','紙の上じゃ、別物にしたいんだろう。身体は紙の通りには動かんがな')]);return}
      short('ヤブ先生は器具の先を布で拭った。「治すものがないなら帰れ。ここは見世物小屋じゃない」','ヤブ先生');return;
    }
    event('yabu',[narration('消毒液の奥に、熱した金属の匂いがある。棚には義肢が並び、ヤブ先生は作業用の器具を片手に千夜を見た。'),...p('ヤブ先生','患者か'),...p('千夜','違う。ちょっと見てただけだ'),...p('ヤブ先生','見物料は取っていない。出ていけ'),...p('千夜','ずいぶん愛想がねぇな'),...p('ヤブ先生','愛想で神経はつながらん。……そこを触るな。消毒したばかりだ'),narration('千夜は棚の義足を見る。'),...p('千夜','これ、いくらすんだ'),...p('ヤブ先生','お前の小遣いで買うものじゃない'),...p('千夜','小遣いじゃねぇよ。稼いでんだ'),...p('ヤブ先生','なら、なおさら大切に使え。金は、身体を取り替えても戻ってこん'),...p('千夜','でも、取り替えりゃ動くようになるんだろ'),...p('ヤブ先生','動くさ。動いたあと、どう生きるかまでは俺の仕事じゃない'),...p('千夜','……冷てぇ医者だな'),...p('ヤブ先生','温かい言葉で治るなら、俺も楽ができる。……お前は今の足で帰れ。まだ使える')]);
  }
  function kamoshita(){
    // Repair saves made when the paper bag and delivery slip were two separate pickups.
    if(has('parcel')&&!has('slip')&&!flag('delivery_complete')){add('slip');state.stage=20;saveSilent()}
    if(state.stage<20){short('鴨下は扇子を開いた。「おや、手ぶらかい。商売かい、世間話かい？　どっちも料金は相談に乗るよ」','鴨下');return}
    if(flag('delivery_complete')){
      if(flag('look_stamp')&&!flag('kamoshita_stamp_talk_done')){event('kamoStamp',[...p('鴨下','おや、機械が気になるかい。君もなかなか目が高いねぇ'),...p('千夜','……名前を消して、楽しいかよ'),...p('鴨下','楽しくはないさ。でも、名前が残ってちゃ困る人間もいるんだよ。売る方にも、買う方にもね'),...p('千夜','……ふーん'),...p('鴨下','その顔。婆さんが若いころにそっくりだ')]);return}
      short('鴨下は帳面をめくる。「婆さんによろしく。商売はね、顔を見せるところから始まるのさ」','鴨下');return;
    }
    event('delivery',[narration('再刻印装置が低く唸っている。鴨下は扇子で首筋をあおぎながら、千夜を見つけると商売用の笑みを浮かべた。'),...p('鴨下','おやおや。お辰のところの千夜ちゃんじゃないか。よく来たねぇ、わざわざこんな湿っぽいところまで'),...p('千夜','荷物。受け取れよ'),...p('鴨下','おっと、急ぐねぇ。挨拶も値段のうちだよ。もっとも、君から挨拶料を取ったら婆さんに叱られそうだ'),...p('千夜','じゃあ黙って受け取れ'),...p('鴨下','はいはい。……ほう、いい重さだ。婆さん、相変わらず手を抜かないねぇ'),narration('鴨下は伝票を裏返す。'),...p('鴨下','同じ部品でも、番号一つで値段が変わる。面白いもんだよ。昨日まで誰かの使い古しだったものが、今日からは立派な商品になる'),...p('千夜','中身は変わんねぇだろ'),...p('鴨下','そう、中身はね。そこに気づくとは、千夜ちゃんも商売の才能がある。……ただし、世の中は中身より札を信じるんだ。名前のついてないものには、値段もつけられない'),...p('千夜','くだらねぇな'),...p('鴨下','くだらないと思えるうちは幸せだよ。紙一枚に泣かされたことがないってことだからね'),narration('鴨下の笑顔は変わらなかった。'),...p('鴨下','ところで千夜ちゃん。君、自分の名前がどこに登録されてるか知ってるかい？'),...p('千夜','……仕事と関係ねぇだろ'),...p('鴨下','そうとも。関係ない話だから、ただで聞いてるんだよ。仕事なら料金をいただかなくちゃ'),...p('千夜','回りくどいんだよ'),...p('鴨下','いやあ、商売人ってのはね、相手が何を知らないかを知るのが仕事なのさ。……安心しなよ。君の値段をつけようって話じゃない。まだね'),narration('千夜は受領済みの伝票を奪うように受け取った。'),...p('鴨下','婆さんによろしく。上物の件、今週中に頼むって伝えておくれ'),...p('千夜','自分で言えよ'),...p('鴨下','君には運ぶ仕事があるだろう？　働けるうちが花だよ。……ま、婆さんには昔から頭が上がらなくてね'),...p('千夜','嘘くせぇ'),...p('鴨下','はは。そこは信じてくれてもいいんだけどなぁ')]);
  }
  function akari(){
    if(flag('met_akari')){if(flag('battery_given'))endingChoiceB();else short('あかりはラジオを抱き直した。「ねえ、千夜。……もう少しだけ、ここにいてもいい？」','あかり');return}
    event('akari',[narration('雨が細くなっていた。青白い蛍光灯の下、セーラー服の少女が一人、古いラジオを胸に抱えている。雑音に埋もれた歌声を、少女は懸命に聴こうとしていた。'),...p('千夜','……こんな時間に、何してんだ'),...p('あかり','あ、びっくりした。……ねえ、このラジオ、聴こえる？　Re:naの歌が流れてるの。さっきまで、もう少しちゃんと入ってたんだけど……'),...p('千夜',flag('heard_rena_radio')?'……Re:naって、さっき屋台でも言ってたな':'……よく分かんねぇな'),...p('あかり','そっか。ここ、少しだけ電波が届くの。だから、いつも探してるんだ。いちばんよく聴こえる場所'),...p('あかり','……あれ。また音が小さくなった。つまみは動かしてないのに'),...p('千夜','……電波だけじゃねぇだろ。電池もへたってんじゃねぇの'),...p('あかり','えっ、電池？　電波が悪いんだとばっかり……。でも替えなんて持ってないよ'),...p('千夜','試さなきゃ分かんねぇけどな'),...p('千夜','そんなに聴きてぇのか'),...p('あかり','うん。……向こうで歌ってる人の声が、ここまで来るんだよ。すごくない？'),narration('千夜は青白い蛍光灯を見上げる。'),...(flag('look_city_map')?[narration('鴨下の壁に貼られた地図には、外へ続く赤い線があった。紙の上では、あんなに簡単そうだった。')]:[]),...p('あかり','ねえ、あなた、この辺の人？'),...p('千夜','見た通り'),...p('あかり','そっか。……私は、あかり。あかりっていうの'),...p('千夜','……千夜'),...p('あかり','千夜。夜が入ってるんだ。……いい名前だね'),...p('千夜','普通だろ'),...p('あかり','そうかな。私は好き。……あ、ごめん。初めて会ったのに、勝手なこと言って'),narration('雨粒が蛍光灯を横切った。'),...p('千夜','……濡れるぞ'),...p('あかり','うん。もうちょっとだけ。歌が終わるまで、ここにいたいの')]);
  }
  function itemEvent(kind){
    if(kind==='candyEat'){remove('candy');mark('candy_eaten');state.selected=null;short('飴を口に入れると、思っていたよりずっと甘かった。');saveSilent();return}
    if(kind==='candyGive')event(kind,[...p('千夜','……食うか'),...p('あかり','え、いいの？'),...p('千夜','婆さんにもらった。別に、あたしが食わなきゃいけないもんじゃねぇし'),...p('あかり','……ありがと。なんだか、もらってばっかりだね'),...p('千夜','別に。安もんだよ'),...p('あかり','そういうことじゃないよ'),narration('あかりは包み紙を丁寧に開き、飴を口に入れる。'),...p('あかり','……甘い'),...p('千夜','飴だからな'),...p('あかり','うん。……なんか、久しぶり')]);
    if(kind==='batteryGive')event(kind,[...p('千夜','……電池、替えてみるか'),...p('あかり','え、持ってるの？'),...p('千夜','屋台の親父に押しつけられた。使えるかは知らねぇぞ'),...p('あかり','やってみたい。……だめだったら、ちゃんと返すから'),...p('千夜','いらねぇって。返されても困る'),narration('電池を交換すると雑音が一瞬途切れ、遠くから歌声が流れてきた。「空のない街でも、声はまだ遠くへ行ける――」'),...p('あかり','……聴こえた。今、ちゃんと聴こえたよね？'),...p('千夜','……ああ。ちょっとだけな'),...p('あかり','ちょっとでも、嬉しい。ありがとう、千夜')]);
  }
  function offerBatteryExchange(){
    if(!has('battery')||!flag('met_akari')||flag('battery_given'))return;
    openPanel('<h2>あかりの携帯ラジオ</h2><p>歌声が細く途切れる。持っている乾電池を試せそうだ。</p><div class="panel-actions"><button class="actionbtn primary" id="exchangeBattery">電池を交換する</button><button class="actionbtn" id="leaveBattery">そのままにする</button></div>');
    $('exchangeBattery').onclick=()=>{if(state.dialogue||flag('battery_given')||!has('battery'))return;closePanel();state.selected=null;saveSilent();accent('akariradio','radio');if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound('akariradio');itemEvent('batteryGive')};
    $('leaveBattery').onclick=()=>{state.selected=null;closePanel();saveSilent()};
  }
  function activeItem(target){
    const id=state.selected;if(!id)return false;
    if(id==='battery'&&state.scene==='park'&&target==='akariradio'&&flag('met_akari')){offerBatteryExchange();return true}
    if(id==='battery'&&state.scene==='park'&&target==='akariradio'&&!flag('met_akari')){short('……まずは、あいつに声をかけてみるか。','千夜');updateUseMode();saveSilent();return true}
    if(id==='candy'&&state.scene==='park'&&(target==='akari'||target==='akariradio')&&flag('met_akari')){itemEvent('candyGive');return true}
    short('……ここで使うものじゃねぇな。','千夜');updateUseMode();saveSilent();return true;
  }
  const ACCENTS={finger:'glint',eye:'glint',stamp:'glint',prostheticleg:'glint',radio:'radio',akariradio:'radio',parklight:'lamp',lantern:'lamp',karaoke:'lamp'};
  function accent(key,kind=ACCENTS[key]){
    if(!kind||(typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches))return;
    const target=[...(document.querySelectorAll?.('#hotspots .hotspot')||[])].find(b=>b.dataset.soundKey===key);
    const stage=document.querySelector('.stage'),layer=$('effectLayer');if(!target||!stage||!layer)return;
    const a=target.getBoundingClientRect(),b=stage.getBoundingClientRect();
    const flash=document.createElement('span');flash.className=`object-accent accent-${kind}`;
    flash.style.cssText=`left:${a.left-b.left}px;top:${a.top-b.top}px;width:${a.width}px;height:${a.height}px`;
    layer.appendChild(flash);flash.addEventListener('animationend',()=>flash.remove(),{once:true});if(typeof setTimeout==='function')setTimeout(()=>flash.remove(),800);
  }
  function updateUseMode(){
    const id=state.selected;if(id&&!has(id))state.selected=null;
    const badge=$('useMode');if(!badge)return;
    badge.hidden=!state.selected;
    if(state.selected&&badge.querySelector){badge.querySelector('.use-mode-name').textContent=`${ITEM_LABEL[state.selected]||'品物'}を使用中`;badge.querySelector('.use-mode-help').textContent='対象を選んで使用';}
  }
  // The register is a reversible, story-neutral toy; no flags, items or quest state change.
  function registerModal(){
    if(state.scene!=='shop'||state.dialogue||state.selected)return;
    let digits='',drawer=0;
    const positions=[['7',33.4,19.6],['8',51.1,19.6],['9',68.4,19.6],['4',32.3,38.4],['5',51.3,38.4],['6',69.2,38.4],['1',31.5,57.6],['2',51.3,57.6],['3',71.1,57.6],['0',43.1,78.6],['00',65.8,78.6]];
    function paint(){
      const image=drawer===2?'assets/otatsu_register_drawer_contents.webp':drawer===1?'assets/otatsu_register_drawer_open.webp':'assets/otatsu_register_keypad_closeup.png';
      const buttons=drawer?'':positions.map(([n,x,y])=>`<button type="button" class="register-key" data-register-digit="${n}" style="left:${x}%;top:${y}%" aria-label="${n}を入力"></button>`).join('');
      openPanel(`<div class="object-inspector register-inspector"><p class="journal-kicker">OBJECT / OBSERVATION</p><h2>古い卓上レジ</h2><div class="register-image-wrap"><img src="${image}" alt="${drawer===2?'小銭、紙片と飴玉のある引き出し':drawer?'開いた古いレジ':'レジの数字操作盤'}">${buttons}${drawer?'':`<output class="register-readout" aria-live="polite">${esc(digits||'0')}</output>`}</div><p class="object-detail">${drawer===2?'小銭と折り畳まれた紙片。端には古い飴玉が一つ残っている。':drawer?'引き出しが、重い金属音を立てて開いた。':'使い込まれたキーには手垢が染みている。'}</p><div class="object-controls">${drawer===1?'<button class="actionbtn" id="registerInside">中身を見る</button>':''}${drawer?'<button class="actionbtn" id="registerClose">引き出しを閉じる</button>':'<button class="actionbtn" id="registerOpen">引き出しを開く</button>'}<button class="actionbtn" id="registerExit">戻る</button></div></div>`,'inspection');
      const sound=()=>{if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound('register')};
      document.querySelectorAll('[data-register-digit]').forEach(button=>button.onclick=()=>{digits=(digits+button.dataset.registerDigit).slice(-7);const readout=document.querySelector('.register-readout');if(readout)readout.textContent=digits;button.classList.add('pressed');if(typeof setTimeout==='function')setTimeout(()=>button.classList.remove('pressed'),130);sound()});
      if($('registerOpen'))$('registerOpen').onclick=()=>{drawer=1;sound();paint()};
      if($('registerInside'))$('registerInside').onclick=()=>{drawer=2;sound();paint()};
      if($('registerClose'))$('registerClose').onclick=()=>{drawer=0;sound();paint()};
      $('registerExit').onclick=$('closeModal').onclick=()=>{closePanel()};
    }
    paint();
  }
  function showCandyAcquired(alreadyOwned=false){
    if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound('candy');
    openPanel(`<div class="candy-acquired"><p class="journal-kicker">${alreadyOwned?'IN YOUR POCKET':'ITEM FOUND'}</p><img src="./assets/otatsu_candy_wrapped_teal.webp" alt="包み紙にくるまれた琥珀色の飴玉"><h2>${alreadyOwned?'手元の飴玉':'飴玉を手に入れた'}</h2><p>${alreadyOwned?'さっき手に入れた飴玉が、包み紙の中で光っている。':'持ち物に追加された。'}</p><div class="panel-actions"><button class="actionbtn" id="candyAcquiredClose">戻る</button></div></div>`,'inventory');
    $('candyAcquiredClose').onclick=closePanel;
  }
  function showBatteryAcquired(){
    if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound('battery');
    openPanel('<div class="candy-acquired"><p class="journal-kicker">ITEM FOUND</p><img src="assets/masaru_radio_d_cell_battery.webp" alt="古い乾電池"><h2>乾電池を手に入れた</h2><p>持ち物に追加された。</p><div class="panel-actions"><button class="actionbtn" id="batteryAcquiredClose">戻る</button></div></div>','inventory');
    $('batteryAcquiredClose').onclick=closePanel;
  }
  // Self-contained optional puzzle; only the completed flag is persisted.
  function legPuzzleModal(){
    if(state.scene!=='clinic'||flag('clinic_leg_puzzle_complete')||state.dialogue||state.selected)return;
    const pieces=[
      {id:'thigh',name:'太ももの外装',image:'assets/clinic_leg_thigh.webp',x:51,y:19},
      {id:'knee',name:'膝関節ユニット',image:'assets/clinic_leg_knee.webp',x:54,y:37},
      {id:'shin',name:'すねの駆動部',image:'assets/clinic_leg_shin.webp',x:53,y:60},
      {id:'foot',name:'足首・足部',image:'assets/clinic_leg_foot.webp',x:46,y:85}
    ];
    const fixed=new Set();let selected='',hint=false,message='部品を選び、輪郭の対応する位置に置いてください。';
    const sound=()=>{if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound('prostheticleg')};
    function place(id){
      if(fixed.has(id))return;
      fixed.add(id);selected='';hint=false;sound();
      if(fixed.size===pieces.length){
        mark('clinic_leg_puzzle_complete');render();message='部品がかみ合い、義足はひとつの形になった。膝の関節が、かすかに音を立てる。';
      }else message=pieces.find(p=>p.id===id).name+'が、かちりと収まった。';
      paint();
    }
    function paint(){
      const complete=flag('clinic_leg_puzzle_complete');
      if(complete){
        openPanel('<div class="leg-puzzle complete"><p class="journal-kicker">ASSEMBLY / COMPLETE</p><h2>義足の組み立て</h2><div class="leg-finished"><img src="assets/clinic_leg_finished.webp" alt="組み上がった義足"></div><p class="object-detail">部品がかみ合い、義足はひとつの形になった。膝の関節が、かすかに音を立てる。</p><div class="object-controls"><button class="actionbtn" id="legExit">クリニックへ戻る</button></div></div>','inspection');
        $('legExit').onclick=$('closeModal').onclick=closePanel;return;
      }
      const slots=pieces.map(p=>`<button type="button" class="leg-slot${fixed.has(p.id)?' is-fixed':''}${hint&&!fixed.has(p.id)?' show-hint':''}${selected===p.id?' selected-slot':''}" data-leg-slot="${p.id}" style="left:${p.x}%;top:${p.y}%" aria-label="${p.name}の配置位置">${fixed.has(p.id)?`<img src="${p.image}" alt="">`:''}<span>${fixed.has(p.id)?'✓':hint&&!fixed.has(p.id)?p.name:''}</span></button>`).join('');
      const tray=pieces.map(p=>`<button type="button" class="leg-piece${fixed.has(p.id)?' is-fixed':''}${selected===p.id?' is-selected':''}" data-leg-piece="${p.id}" ${fixed.has(p.id)?'disabled':''}><img src="${p.image}" draggable="false" alt=""><span>${p.name}</span></button>`).join('');
      openPanel(`<div class="leg-puzzle"><p class="journal-kicker">OBJECT / ASSEMBLY</p><h2>義足の組み立て <small>${fixed.size} / 4</small></h2><div class="leg-puzzle-layout"><div class="leg-board" id="legBoard"><img class="leg-board-art" src="assets/clinic_leg_board.png" alt="義足の輪郭が描かれた組み立て台">${slots}</div><div class="leg-tray"><p>部品</p><div class="leg-piece-list">${tray}</div></div></div><p class="object-detail" aria-live="polite" id="legMessage">${message}</p><div class="object-controls"><button class="actionbtn" id="legHint">ヒント</button><button class="actionbtn" id="legExit">戻る</button></div></div>`,'inspection');
      $('legExit').onclick=$('closeModal').onclick=closePanel;
      $('legHint').onclick=()=>{hint=!hint;paint()};
      document.querySelectorAll('[data-leg-slot]').forEach(button=>{
        button.onclick=()=>{const id=button.dataset.legSlot;if(fixed.has(id))return;if(selected===id)place(id);else{message='部品の形が合わないようだ。';selected='';paint()}};
      });
      document.querySelectorAll('[data-leg-piece]').forEach(button=>{
        const id=button.dataset.legPiece;let drag=null;
        button.onclick=()=>{if(fixed.has(id))return;selected=id;message=pieces.find(p=>p.id===id).name+'を選択中。台の輪郭をタップしてください。';paint()};
        button.onpointerdown=e=>{if(fixed.has(id)||e.button!==undefined&&e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};button.setPointerCapture?.(e.pointerId)};
        button.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(dx,dy)>8)drag.moved=true;if(drag.moved)button.style.transform=`translate(${dx}px,${dy}px) scale(1.04)`;};
        button.onpointerup=e=>{
          if(!drag||drag.id!==e.pointerId)return;
          const moved=drag.moved;drag=null;button.style.transform='';button.releasePointerCapture?.(e.pointerId);
          if(!moved)return;
          const target=[...document.querySelectorAll('[data-leg-slot]')].find(slot=>{if(slot.dataset.legSlot!==id)return false;const r=slot.getBoundingClientRect();return e.clientX>=r.left-15&&e.clientX<=r.right+15&&e.clientY>=r.top-15&&e.clientY<=r.bottom+15});
          if(target)place(id);else{selected='';message='位置が違うようだ。もう一度試そう。';paint()}
        };
        button.onpointercancel=()=>{drag=null;button.style.transform=''};
      });
    }
    paint();
  }
  // Independent touchable-object layer. Geometry and optional illustration paths
  // live here; later assets can replace the CSS placeholder without rewriting events.
  const OBJECTS={
    candy:{name:'琥珀色の飴玉',kind:'candy',image:'assets/otatsu_candy_wrapped_teal.webp',backImage:'assets/otatsu_candy_unwrapped_flat_paper.webp',scale:1,min:.8,max:2.4,detail:'お辰が持たせた小さな飴玉。まだ包み紙にくるまっている。'},
    slip:{name:'手書き伝票',kind:'paper',image:'assets/kamashita_delivery_front.png',backImage:'assets/kamashita_delivery_back.png',scale:1,min:.8,max:2.4,detail:'表は菓子、裏には義体部品の内訳が書かれている。'},
    receipt:{name:'受領済み伝票',kind:'paper',image:'assets/kamashita_delivery_front.png',backImage:'assets/kamashita_delivery_back.png',scale:1,min:.8,max:2.4,detail:'鴨下の受領印が押された薄い紙。'},
    finger:{name:'義指',kind:'finger',image:'assets/otatsu_prosthetic_finger_base.webp',partImage:'assets/otatsu_prosthetic_finger_tip.webp',scale:1,min:.7,max:2.2,detail:'人差し指ほどの小さな義指。何度も油を差した跡があり、金属の表面は部分的に磨り減っている。'},
    eye:{name:'義眼',kind:'eye',image:'assets/clinic_prosthetic_eye_closeup.webp',scale:1,min:.8,max:3,detail:'青い虹彩の義眼が布の上に一つだけ置かれている。'},
    radio:{name:'古いラジオ',kind:'radio',image:'assets/masaru_radio_body.webp',partImage:'assets/masaru_radio_tuning_knob.webp',scale:1,min:.8,max:2.2,detail:'古いラジオのつまみは、回すたびに小さく引っかかる。'},
    karaoke:{name:'カラオケ機',kind:'karaoke',image:'assets/shiratsuyu_karaoke_control_panel.png',scale:1,min:.8,max:2.4,detail:'古い画面には、光だらけの都市が映っている。'},
    syntheticHand:{name:'人工皮膚の手',kind:'synthetic-hand',image:'assets/kamashita_synthetic_hand_front_young_v2.webp',backImage:'assets/kamashita_synthetic_hand_back_young_v2.webp',scale:1,min:.8,max:2.4,detail:'人間の手と見分けがつかないほど精巧な人工皮膚だ。爪の形まで丁寧に作られている。'}
  };
  const interactionCount=key=>Number(state.interactions?.[`${state.scene}:${key}`]||0);
  const recordInteraction=key=>{state.interactions||={};const id=`${state.scene}:${key}`;state.interactions[id]=(state.interactions[id]||0)+1;saveSilent()};
  function discoveryNote(message){const hint=$('discoveryNote');if(!hint)return;hint.textContent=message;hint.hidden=false;hint.classList.remove('discovery-appear');void hint.offsetWidth;hint.classList.add('discovery-appear');if(typeof clearTimeout==='function')clearTimeout(discoveryNote.timer);if(typeof setTimeout==='function')discoveryNote.timer=setTimeout(()=>hint.hidden=true,2400)}
  function observeObject(key,option={}){
    const data=OBJECTS[key];if(!data||((state.dialogue||state.selected)&&!option.allowDuringDialogue))return;
    let zoom=data.scale,back=false,lit=false,tune=50,flexed=false,panX=0,panY=0,entered='',lastKey='',karaokePlaying=false,karaokeMessage='';
    const paper=key==='slip'||key==='receipt',candy=key==='candy';
    const karaokeButtons=[
      ...[0,1].flatMap((row)=>[0,1,2,3,4].map((col)=>({label:String(row===0?1+col:(6+col)%10),x:14.6+col*8.5,y:33.5+row*20.8}))),
      {label:'▶',x:58.4,y:33.5},{label:'■',x:67.5,y:33.5},
      {label:'◀◀',x:58.4,y:54.3},{label:'▶▶',x:67.5,y:54.3},
      {label:'▲',x:14.6,y:75},{label:'▼',x:25,y:75},
      {label:'|◀',x:36.5,y:75},{label:'▶|',x:47.5,y:75},
      {label:'Ⅱ',x:58.4,y:75},{label:'●',x:67.5,y:75}
    ];
    // All positions are image-relative percentages, so zooming keeps hitboxes aligned.
    function art(){
      if(paper)return `<div class="paper-image-wrap"><img class="object-art-paper${back?' paper-face-back':''}" src="${back?data.backImage:data.image}" alt="伝票の${back?'裏':'表'}面">${key==='receipt'&&!back?'<span class="receipt-stamp">受領済</span>':''}</div>`;
      if(candy)return `<img class="object-art-single candy-art" src="${back?data.backImage:data.image}" alt="${back?'開いた包み紙と飴玉':'包まれた飴玉'}">`;
      if(key==='syntheticHand')return `<img class="object-art-single synthetic-hand-art" src="${back?data.backImage:data.image}" alt="${back?'人工皮膚の手のひら側':'人工皮膚の手の爪側'}">`;
      if(key==='finger')return `<div class="object-art-frame finger-frame"><img class="art-base" src="${data.image}" alt="義指の本体"><button type="button" id="fingerTouch" class="finger-touch" aria-label="義指の関節を動かす"><img class="art-finger-tip${flexed?' is-flexed':''}" src="${data.partImage}" alt="義指の可動関節"></button></div>`;
      if(key==='radio')return `<div class="object-art-frame radio-frame"><img class="art-base" src="${data.image}" alt="ラジオ本体"><button type="button" id="radioTouch" class="radio-touch" aria-label="ラジオのつまみを回す"><img class="art-radio-knob" style="--knob-angle:${(tune-50)*2.2}deg" src="${data.partImage}" alt="回転するつまみ"></button></div>`;
      if(key==='karaoke')return `<div class="object-art-frame karaoke-frame"><img class="art-base" src="${data.image}" alt="カラオケ操作盤">${karaokeButtons.map((b,i)=>`<button class="karaoke-touch${lastKey===b.label?' is-pressed':''}" data-press="${i}" style="left:${b.x}%;top:${b.y}%" aria-label="${b.label}ボタン" type="button"></button>`).join('')}</div>`;
      return `<img class="object-art-single" src="${data.image}" alt="${esc(data.name)}">`;
    }
    const play=which=>{if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound(which)};
    const KARAOKE_TITLES={'001':'夜霧の街角','002':'ネオンの向こう側','003':'帰らぬ灯'};
    const karaokeAudio=()=>typeof window!=='undefined'?window.ItachikutsuAudio:null;
    const press=label=>{
      lastKey=label;lit=!lit;
      const audio=karaokeAudio();
      if(/^\d$/.test(label)){
        if(karaokePlaying){audio?.stopKaraoke?.();karaokePlaying=false}
        entered=(entered+label).slice(-3);karaokeMessage='';
      }else if(label==='■'||label==='Ⅱ'){
        audio?.stopKaraoke?.();karaokePlaying=false;karaokeMessage='停止しました';
      }else if(label==='▶'){
        const id=entered.padStart(3,'0');
        if(KARAOKE_TITLES[id]&&audio?.playKaraoke?.(id)){
          entered=id;karaokePlaying=true;karaokeMessage='再生中';
        }else{karaokeMessage='001〜003から選んでください';karaokePlaying=false}
      }else if(['▶▶','▶|','▲'].includes(label)){
        audio?.stopKaraoke?.();karaokePlaying=false;
        entered=String((Number(entered)||0)%3+1).padStart(3,'0');karaokeMessage='';
      }else if(['◀◀','|◀','▼'].includes(label)){
        audio?.stopKaraoke?.();karaokePlaying=false;
        entered=String(((Number(entered)||2)+1)%3+1).padStart(3,'0');karaokeMessage='';
      }
      play('karaoke');paint();
    };
    const flex=()=>{flexed=!flexed;play('finger');paint()};
    const tuneTo=value=>{tune=Math.max(0,Math.min(100,Math.round(value/5)*5));play('radio');const knob=document.querySelector('.art-radio-knob');knob?.style?.setProperty?.('--knob-angle',`${(tune-50)*2.2}deg`);const slider=$('objectTune');if(slider)slider.value=tune};
    function paint(){
      openPanel(`<div class="object-inspector" data-object="${key}"><p class="journal-kicker">OBJECT / OBSERVATION</p><h2>${esc(data.name)}</h2><div class="object-view" data-kind="${data.kind}" style="--object-scale:${zoom};--object-x:${panX}px;--object-y:${panY}px"><div class="object-visual${flexed?' is-flexed':''}${lit?' is-lit':''}${back?' is-back':''}">${art()}</div></div><p class="object-detail">${esc(key==='syntheticHand'&&back?'手首の内側には、機械的な接続端子が覗いている。どれほど人間に似せても、そこだけは機械のままだった。':option.message||data.detail)}</p>${key==='karaoke'?`<div class="karaoke-playback" aria-live="polite"><span id="karaokeTrack">${entered?`${entered} ${KARAOKE_TITLES[entered]||''}`:'番号を入力してください'}</span><span id="karaokeStatus">${karaokeMessage}</span><span class="karaoke-meter${karaokePlaying?' is-playing':''}" id="karaokeMeter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div><p class="karaoke-readout">${entered?`入力番号：${entered}`:'001〜003を入力'}</p>`:''}${paper||key==='syntheticHand'?'<div class="panel-actions"><button class="actionbtn" id="objectFlip">'+(back?'表を見る':'裏返す')+'</button></div>':''}${key==='finger'?'<div class="panel-actions"><button class="actionbtn" id="objectFlex">関節を動かす</button></div>':''}${key==='radio'?`<label class="object-range">つまみを回す <input id="objectTune" type="range" min="0" max="100" step="5" value="${tune}"></label>`:''}${key==='karaoke'?'<div class="panel-actions"><button class="actionbtn" id="objectPress">選曲ボタン</button></div>':''}<div class="object-controls"><button class="actionbtn" id="objectSmaller">−</button><button class="actionbtn" id="objectReset">原寸</button><button class="actionbtn" id="objectLarger">＋</button><button class="actionbtn" id="objectExit">戻る</button></div></div>`,'inspection');
      if(candy){const actions=document.createElement('div');actions.className='panel-actions';actions.innerHTML=`<button class="actionbtn" id="candyUnwrap">${back?'包みを戻す':'包みを開いて見る'}</button>`;document.querySelector('.object-controls').before(actions)}
      if(key==='radio'){const actions=document.createElement('div');actions.className='panel-actions';actions.innerHTML='<button class="actionbtn" id="radioListen">ラジオの音を聴く</button>';document.querySelector('.object-controls').appendChild(actions);$('radioListen').onclick=()=>{closePanel();act('radio')}}
      $('objectExit').onclick=()=>{if(key==='karaoke'){karaokeAudio()?.stopKaraoke?.();karaokeAudio()?.onKaraokeState?.(null)}closePanel();if(option.backToItems)itemsModal()};
      $('objectSmaller').onclick=()=>{zoom=Math.max(data.min,Math.round((zoom-.2)*10)/10);paint()};
      $('objectLarger').onclick=()=>{zoom=Math.min(data.max,Math.round((zoom+.2)*10)/10);paint()};
      $('objectReset').onclick=()=>{zoom=data.scale;panX=0;panY=0;paint()};
      if(paper||key==='syntheticHand')$('objectFlip').onclick=()=>{back=!back;if(back&&key==='slip'&&!flag('slip_back_read')){mark('slip_back_read');discoveryNote('依頼帳に記録した')}if(back&&key==='syntheticHand'&&!flag('synthetic_hand_terminal_seen')){mark('synthetic_hand_terminal_seen');discoveryNote('手首の接続端子を確認した')}if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound('slip');paint()};
      if(candy)$('candyUnwrap').onclick=()=>{back=!back;play('candy');paint()};
      if(key==='finger'){$('objectFlex').onclick=flex;$('fingerTouch').onclick=flex}
      if(key==='karaoke'){
        $('objectPress').onclick=()=>press('▶');
        document.querySelectorAll('.karaoke-touch').forEach(el=>el.onclick=()=>press(karaokeButtons[Number(el.dataset.press)].label));
        karaokeAudio()?.onKaraokeState?.(info=>{
          karaokePlaying=!!info.playing;
          if(!karaokePlaying&&karaokeMessage==='再生中')karaokeMessage='再生終了';
          const status=$('karaokeStatus');if(status)status.textContent=karaokeMessage;
          $('karaokeMeter')?.classList?.toggle?.('is-playing',karaokePlaying);
        });
      }
      if(key==='radio'){$('objectTune').oninput=e=>tuneTo(Number(e.target.value));const knob=$('radioTouch');knob.onclick=()=>tuneTo(tune+10);knob.onpointerdown=e=>{if(e.button!==undefined&&e.button!==0)return;e.stopPropagation?.();knob.setPointerCapture?.(e.pointerId);knob.dataset.startX=String(e.clientX);knob.dataset.startTune=String(tune)};knob.onpointermove=e=>{if(!knob.hasPointerCapture?.(e.pointerId))return;tuneTo(Number(knob.dataset.startTune)+(e.clientX-Number(knob.dataset.startX))/3)};knob.onpointerup=e=>knob.releasePointerCapture?.(e.pointerId)}
      // Pan an enlarged observation with mouse or touch, without moving the UI.
      const visual=document.querySelector('.object-visual');
      if(visual){let drag=null;visual.onpointerdown=e=>{if(e.target.closest?.('button'))return;if(zoom<=1)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY};visual.setPointerCapture?.(e.pointerId)};visual.onpointermove=e=>{if(!drag||drag.id!==e.pointerId)return;panX=Math.max(-180,Math.min(180,drag.px+e.clientX-drag.x));panY=Math.max(-180,Math.min(180,drag.py+e.clientY-drag.y));visual.style.setProperty('--object-x',`${panX}px`);visual.style.setProperty('--object-y',`${panY}px`)};visual.onpointerup=e=>{drag=null;visual.releasePointerCapture?.(e.pointerId)};visual.onpointercancel=()=>{drag=null}}
      $('closeModal').onclick=$('objectExit').onclick;
    }
    paint();
  }
  function puddleRipple(){const target=[...document.querySelectorAll('#hotspots .hotspot')].find(b=>b.dataset.soundKey==='parkpuddle');const layer=$('effectLayer'),stage=document.querySelector('.stage');if(!target||!stage||!layer||typeof window==='undefined'||window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)return;const a=target.getBoundingClientRect(),b=stage.getBoundingClientRect(),wave=document.createElement('span');wave.className='puddle-wave';wave.style.cssText=`left:${a.left-b.left+a.width/2}px;top:${a.top-b.top+a.height/2}px`;layer.appendChild(wave);wave.addEventListener('animationend',()=>wave.remove(),{once:true});if(typeof setTimeout==='function')setTimeout(()=>wave.remove(),1400)}
  function medicalCaseModal(){
    if(state.scene!=='warehouse')return;
    if(!flag('medical_case_opened')){mark('medical_case_opened');discoveryNote('医療用保管箱を開いた')}
    openPanel(`<div class="medical-case-inspector"><p class="journal-kicker">WAREHOUSE / MEDICAL CASE</p><h2>医療用保管箱</h2><div class="medical-case-art"><img id="medicalCaseImage" src="assets/kamashita_medical_case_closed.webp" alt="閉じた医療用保管箱"><button type="button" id="medicalCaseHand" class="medical-hand-touch" aria-label="人工皮膚の手を観察" hidden></button></div><p id="medicalCaseCaption">金属の留め具が小さく鳴った。</p><div class="panel-actions"><button class="actionbtn" id="medicalCaseExit">戻る</button></div></div>`,'inspection');
    if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound('finger');
    let timer=null,active=true;
    const stop=()=>{active=false;if(timer!==null&&typeof clearTimeout==='function')clearTimeout(timer)};
    const reveal=()=>{if(!active||$('overlay')?.classList?.contains('hidden'))return;const img=$('medicalCaseImage');if(!img)return;img.src='assets/kamashita_medical_case_open_young_hand_v2.webp';img.alt='人工皮膚の手が収められた開いた保管箱';$('medicalCaseHand').hidden=false;$('medicalCaseCaption').textContent='柔らかな布の上に、人間のものと見まがう手が収められている。';};
    if(typeof setTimeout==='function')timer=setTimeout(reveal,650);else reveal();
    $('medicalCaseHand').onclick=()=>{stop();if(!flag('synthetic_hand_examined')){mark('synthetic_hand_examined');discoveryNote('人工皮膚の手を観察した')}closePanel();observeObject('syntheticHand')};
    $('medicalCaseExit').onclick=$('closeModal').onclick=()=>{stop();closePanel()};
  }
  function act(key){
    if(modal||state.dialogue)return;
    setAuto(false);
    if(key.startsWith('go:')){state.selected=null;updateUseMode();saveSilent();go(key.slice(3));return}
    if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound(key);
    if(state.selected&&activeItem(key))return;
    accent(key);
    const discoveredBefore={...state.flags};
    switch(key){
      case 'tatsu':otatsu();break;
      case 'masaru':masaru();break;
      case 'miko':miko();break;
      case 'yabu':yabu();break;
      case 'kamoshita':kamoshita();break;
      case 'ledger':if(flag('delivery_complete')&&has('receipt'))observeObject('receipt');else kamoshita();break;
      case 'akari':akari();break;
      case 'parcel':
        if(state.stage===0){short('菓子の袋に見えるが、中には冷たい金属が収まっている。まず、お辰の話を聞こう。');break}
        if(!has('parcel')||!has('slip')){add('parcel');add('slip');short('ベビーカステラの紙袋と手書き伝票を受け取った。菓子にしては硬いものが袋の底で触れ合った。');}
        if(has('parcel')&&has('slip'))state.stage=20;render();saveSilent();break;
      case 'register':registerModal();break;
      case 'medicalcase':medicalCaseModal();break;
      case 'candy':
        if(!flag('look_candy'))mark('look_candy');
        // Touching the jar awards the one original candy directly. Never
        // replenish it after it has been eaten or gifted on a saved game.
        if(!has('candy')&&!flag('candy_eaten')&&!flag('candy_given')){add('candy');mark('candy_taken');$('itemCount').textContent=state.items.length;saveSilent();showCandyAcquired()}
        else if(has('candy'))showCandyAcquired(true);
        else short('ガラス瓶の底に、飴玉が残っている。砂糖が裸電球の光を返していた。');break;
      case 'finger':
        accent(key,'joint');
        {const message=state.stage>=40?'義指が小さく曲がる。朝には引っかかっていた関節が、今は滑らかに動いていた。お辰は得意そうな顔をしない。':flag('look_stamp')?'鴨下なら、この指にも新しい番号を打つのだろう。お辰は前の持ち主の癖を残したまま直していた。同じ部品を扱っていても、二人の見ているものは違うらしい。':'人差し指ほどの小さな義指。何度も油を差した跡があり、金属の表面は部分的に磨り減っている。新品にはない、人間の手に似た不揃いさがあった。';mark('look_finger');recordInteraction(key);observeObject('finger',{message})}break;
      case 'hibachi':short(state.stage>=30?'炭は小さくなったが、灰の下に赤い火が残っている。お辰は火箸で一度だけ灰を返した。':'炭が赤く燃えている。お辰はこの火を消さない。店の客が途絶えても、修理の仕事は終わらないからだ。');break;
      case 'shopback':short('奥の作業場には、瓶や工具が青い明かりの下に並んでいる。油を拭った布が一枚、戸口に掛けられていた。店先の甘い匂いは、ここまでは届かない。');break;
      case 'lantern':short('路地に面した赤い提灯が、熱い湯気に揺れている。煤けた紙の継ぎ目から灯りが漏れ、雨に濡れた壁をぼんやり染めていた。');break;
      case 'flowers':short('カウンターに生けられた小さな花。花弁の端は乾きかけているのに、水だけは新しい。誰かが今夜も替えたのだろう。');break;
      case 'storeback':short('鴨下の背後には、青い灯りの残る倉庫の奥が続いている。積まれた木箱には番号しかなく、何が入っているのかは書かれていない。向こうで金属の触れ合う音がした。');break;
      case 'ramen':
        if(!flag('masaru_intro_done'))short('湯気の立つ醤油ラーメン。マサルに何を言われるか分からない。');
        else if(!flag('ate_ramen'))event('ramen',[narration('丼の中で醤油色のスープが揺れている。千夜は箸を取ると、しばらく喋らずに食べ続けた。マサルはそれを急かさない。'),...p('千夜','……いただきます'),...p('マサル','……ああ')]);
        else short('空の丼には、まだ醤油の香りが残っていた。');break;
      case 'radioTune':
        // Directly advance the story through the first two radio inspections.
        // After receiving the battery, the original tuning inspector remains available.
        if(flag('battery_taken')||flag('battery_given')){observeObject('radio');break}
      case 'radio':
        if(!flag('heard_rena_radio'))event('radio',[page('ラジオ','……今夜の特集は、Re:na。新曲からお届けします……空のない街でも、声はまだ遠くへ行ける――'),...p('千夜','……何だよ、いいところで'),...p('マサル','聴いてたのか'),...p('千夜','別に。勝手に切れただけだろ'),...p('マサル','そりゃ悪かったな。ラジオに言っとく')]);
        else if(!flag('battery_taken')&&!flag('battery_given'))event('battery',[
          ...(!flag('battery_spotted')?[...p('マサル','……ラジオが気になるのか。さっきから妙に見てるな'),...p('千夜','音、途中で切れただろ。電池か？'),...p('マサル','こいつは配線が怪しい。……替えの乾電池なら、横の箱に一本転がってるがな'),...p('千夜','使わねぇのかよ'),...p('マサル','このラジオには合わねぇ。捨てるのも面倒でな')]:[]),
          narration('ラジオの隣に古い乾電池が転がっている。表面の文字はほとんど消えているが、まだ使えるようだった。'),...p('千夜','これ、まだ使えんのか'),...p('マサル','たぶんな。うちのラジオにゃ合わねぇ'),...p('千夜','捨てりゃいいだろ'),...p('マサル','婆さんに聞かせてやりてぇ台詞だな。持ってけ')]);
        else if(has('battery'))short('古いラジオから、途切れ途切れに街のニュースが聞こえてくる。替えの乾電池は、もうポケットの中にある。','','radio');
        else short('古いラジオから、途切れ途切れに街のニュースが聞こえてくる。','','radio');break;
      case 'makeup':mark('look_makeup');short(flag('miko_intro_done')?'化粧は顔を飾るためだけのものではない。この店では、疲れていない顔を作るためにも使うのだろう。':'使いかけの口紅が何本も並んでいる。色は違うのに、どれも同じくらい減っていた。');break;
      case 'rena':mark('look_rena_poster');short(flag('heard_rena_radio')?'Re:na。さっき屋台のラジオで聞いた名前だ。声は雑音に隠れていたのに、顔だけはこんなにはっきり見える。':'壁の女は欠点のない顔で笑っている。街のどこにもいない種類の人間に見えた。');break;
      case 'clinicprice':mark('look_clinic_prices');short('声帯チップ交換、48,000。顔面皮膜補正、72,000。感情波安定化補助、15,000。分割払いの利息についても細かな字で書かれている。'+(flag('look_makeup')?' ミコ姐は口紅で顔を作っていた。ここでは顔そのものを作り替える。':'') );break;
      case 'prostheticleg':
        if(flag('clinic_leg_puzzle_complete'))short('部品が組み上がった義足が、棚の明かりを受けている。膝の関節は静かに収まっていた。');
        else{mark('look_prosthetic_leg');legPuzzleModal()}
        recordInteraction(key);break;
      case 'medicalnotes':short(state.stage<10?'机に古い記録が重ねられている。名前の部分には紙が被せてあった。千夜は誰のものか確かめずに離れた。':'「……そこは見せもんじゃない。人の身体のことは、本人が話すまで知らん顔をしてやれ」','ヤブ先生');break;
      case 'stamp':mark('look_stamp');short('金属に刻まれた番号を削り、新しい番号を打つための機械。床には細かな削り屑が落ちている。昨日までの名前を消し、新しい名前を与える仕事だ。');break;
      case 'citymap':mark('look_city_map');short('壁には古い都市地図が貼られている。鼬窟は地図の端に小さく描かれていた。外の都市まで道路が伸びている。紙の上では、どこへ行くのも簡単そうだった。');break;
      case 'eye':{const message='青い虹彩の義眼が布の上に一つだけ置かれている。昔は何を見ていた目なのだろう。'+(flag('look_finger')?' この目にも前の持ち主の癖が残っているのだろうか。':'');mark('look_eye');recordInteraction(key);observeObject('eye',{message})}break;
      case 'parklight':mark('look_park_light');short(notes.parklight);break;
      case 'parkbench':short(state.stage>=30?'ベンチの木材が、誰かの重みを受けて小さく軋んでいる。':'古い木の表面には雨が細い筋を作っている。誰かが座るたびに軋みそうなベンチだった。');break;
      case 'parkpuddle':puddleRipple();short(notes.parkpuddle);recordInteraction(key);break;
      case 'karaoke':recordInteraction(key);observeObject('karaoke');break;
      case 'akariradio':
        if(!flag('met_akari'))short('少女はラジオに耳を澄ませている。先に声をかけた方がよさそうだ。');
        else if(flag('battery_given'))lyricsModal();
        else if(has('battery'))offerBatteryExchange();
        else short('つまみの周りは擦り減り、裏蓋には何度も開け閉めした跡がある。つまみは動いていないのに音が痩せ、歌声が消えかける。電池も弱っているのかもしれない。');break;
      default:short(notes[key]||'');break;
    }
    // Only a completed dialogue (or a genuinely static inspection) is recorded.
    // A blocked/gated object never becomes permanently unavailable.
    if(state.dialogue)state.dialogue.exploreKey=key;
    else if(staticInspections.has(key))inspectComplete(key);
    const found={look_eye:'義眼について記録した',look_finger:'義指について記録した',look_stamp:'再刻印装置について記録した',look_city_map:'都市地図について記録した',look_clinic_prices:'料金表について記録した'};
    for(const [name,label] of Object.entries(found))if(!discoveredBefore[name]&&flag(name)){discoveryNote(label);break}
    saveSilent();
  }
  const ITEM_LABEL={parcel:'ベビーカステラの紙袋',slip:'手書き伝票',receipt:'受領済み伝票',candy:'琥珀色の飴玉',battery:'古い乾電池'};
  const ITEM_IMAGE={parcel:'assets/otatsu-parcel-bag.webp',slip:'assets/kamashita_delivery_front.png',receipt:'assets/kamashita_delivery_front.png',candy:'assets/otatsu_candy_wrapped_teal.webp',battery:'assets/masaru_radio_d_cell_battery.webp'};
  const ITEM_DESC={parcel:'「ベビーカステラ」と印刷された紙袋。金属がかすかに鳴る。',slip:'表は菓子、裏には義体部品の内訳が書かれている。',receipt:'鴨下の受領印が押された薄い紙。',candy:'お辰が持たせた小さな飴玉。まだ包み紙にくるまっている。',battery:'マサルの屋台でもらった替えの乾電池。まだ使えそうだ。小型のラジオなどに入れられる。'};
  function openPanel(inner,kind=''){setAuto(false);cancelTimers();modal='open';$('overlay').classList.remove('hidden','title-screen','ending-open','ending-a-open','ending-b-open');$('modalContent').dataset.panelKind=kind;$('modalContent').innerHTML=`<button class="smallbtn modalclose" id="closeModal" aria-label="閉じる">×</button>${inner}`;$('closeModal').onclick=closePanel}
  function closePanel(){const offerRamen=lyricsVisible&&state.scene==='park'&&flag('battery_given')&&!state.dialogue;if(lyricsVisible){if(typeof window!=='undefined')window.ItachikutsuAudio?.stopSong();lyricsVisible=false;$('overlay').classList.remove('lyrics-open')}modal='';$('overlay').classList.add('hidden');$('overlay').classList.remove('title-screen','ending-open','ending-a-open','ending-b-open');if(offerRamen)endingChoiceB()}
  const SONG_LYRICS=[
    '割れたショーウィンドウにネオンが散って笑う。\nひび割れた未来でも、今は眩しすぎて。\n触れたら切れる光の粒、指先から零れてもいい。\n壊れるほどに、自由を信じたい。',
    'ガラスの夜に踊れ。砕けるまで構わない。\n痛みより強いリズム、この瞬間だけ生きたい。\nガラスの夜に踊れ。夢が血に変わるまで、\n声を枯らし叫んで、光の中で消えたい。',
    '流れるテールライトが星座みたいに繋がる。\n止まらない心拍を、街に刻みつけて。\n触れたら消える泡のように、永遠は望まなくていい。\n壊れるほどに、輝きを選びたい。',
    '眠らない街で、誰かを探す。\n届かない光でも、触れたいと願う。\n──砕けてもいい、光の中で踊るだけ。'
  ];
  function lyricsModal(){
    openPanel(`<div class="song-card"><p class="song-card-kicker">RE:NA / ON THE AIR</p><h2>ガラスの夜に踊れ</h2><p class="song-credit">作詞・作曲：Re:na</p>${SONG_LYRICS.map(verse=>`<p class="song-verse">${esc(verse)}</p>`).join('')}</div>`);
    lyricsVisible=true;
    $('closeModal').onclick=event=>{event?.stopPropagation?.();closePanel()};
    $('overlay').classList.add('lyrics-open');
    if(typeof window!=='undefined')window.ItachikutsuAudio?.playSong();
  }
  function itemsModal(){
    let html='<div class="journal-head"><span class="journal-emblem">▣</span><div><p class="journal-kicker">CHIYA / INVENTORY</p><h2>持ち物</h2></div></div><div class="itemlist">';
    for(const id of state.items)html+=`<button class="item" data-item="${id}"><span class="item-token"><img src="${ITEM_IMAGE[id]}" alt="" loading="lazy"></span>${esc(ITEM_LABEL[id])}<span>${esc(ITEM_DESC[id])}</span></button>`;
    html+='</div>'+(state.items.length?'<p>品物を選ぶと、調べたり使ったりできる。</p>':'<p>ポケットには何も入っていない。</p>');openPanel(html,'inventory');
    document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>itemDetail(b.dataset.item));
  }
  function itemDetail(id){
    if(typeof window!=='undefined')window.ItachikutsuAudio?.playObjectSound(id);
    if(id==='slip'||id==='receipt'){observeObject(id,{backToItems:true});return}
    const canUse=id==='candy'||id==='battery';
    openPanel(`<h2>${esc(ITEM_LABEL[id])}</h2><p>${esc(ITEM_DESC[id])}</p><div class="panel-actions">${canUse?`<button class="actionbtn primary" id="useItem">${id==='candy'?'誰かに渡す':'使う'}</button>`:''}${id==='candy'?'<button class="actionbtn" id="eatItem">食べる</button>':''}<button class="actionbtn" id="backItems">持ち物へ戻る</button></div>`,'inventory');
    $('backItems').onclick=itemsModal;
    if(canUse)$('useItem').onclick=()=>{state.selected=id;closePanel();updateUseMode();short(id==='battery'?'公園のラジオに使えそうだ。':'誰かに渡せるかもしれない。');saveSilent()};
    if(id==='candy')$('eatItem').onclick=()=>{closePanel();itemEvent('candyEat')};
  }
  function questModal(){
    const quest=state.stage===0?'お辰の話を聞く':state.stage<20?'紙袋と伝票を受け取る':state.stage<30?'鴨下の倉庫へ届ける':state.stage<40?'受領伝票を持ち帰る':state.stage<50?'お辰に受領伝票を返す':'今日の仕事は終わった';
    const hint=state.stage===0?'駄菓子屋の店主は、何か仕事を用意しているようだ。':state.stage<20?'店先に用意された荷物を確かめよう。':state.stage<30?'倉庫の主人なら荷物の行き先を知っている。':state.stage<50?'受領印のある伝票を、お辰に見せよう。':'仕事はひと区切り。まだ街を歩いてもいい。';
    const completed=[];
    if(flag('delivery_complete'))completed.push('鴨下への届け物');
    if(flag('returned_to_otatsu'))completed.push('お辰への配達報告');
    const memories=[['medical_case_opened','医療用保管箱を開いた'],['synthetic_hand_examined','人工皮膚の手を観察した'],['synthetic_hand_terminal_seen','手首の接続端子を確認した'],['look_finger','お辰は古い義指を直している'],['slip_back_read','紙袋の中身は菓子ではない'],['heard_rena_radio','屋台でRe:naの歌が流れた'],['ate_ramen','マサルにラーメンをごちそうになった'],['look_makeup','〈白露〉では笑顔も仕事になる'],['look_rena_poster','Re:naのポスターを見た'],['look_clinic_prices','身体を変えるには高い金がかかる'],['look_stamp','再刻印装置は識別番号を変える'],['look_city_map','外の都市と鼬窟を結ぶ道を見た'],['look_park_light','公園の青白い蛍光灯'],['met_akari','公園であかりと出会った'],['akari_battery_weak','あかりのラジオは電池が弱っているらしい'],['battery_spotted','マサルの屋台には替えの電池がある'],['battery_taken','マサルから替えの電池をもらった'],['battery_given','あかりのラジオを直した'],['candy_given','あかりに飴玉を渡した'],['ending_a_seen','ENDING A「解体」を見届けた'],['ending_b_seen','ENDING B「ありふれた日々」を見届けた']].filter(([key])=>flag(key));
    openPanel(`<div class="journal-head"><span class="journal-emblem">▤</span><div><p class="journal-kicker">HANDWRITTEN RECORD</p><h2>依頼帳</h2></div></div><h3>現在の目的</h3><p>${esc(quest)}</p><h3>次の行動のヒント</h3><p>${esc(hint)}</p><div class="journal-status">配達：${flag('delivery_complete')?'完了':'未完了'}　／　報告：${state.finished?'完了':'未完了'}</div><h3>完了した依頼</h3>${completed.length?'<ul>'+completed.map(s=>`<li>${esc(s)}</li>`).join('')+'</ul>':'<p>まだ記録はありません。</p>'}<h3>見聞きしたこと</h3>${memories.length?'<ul>'+memories.map(([,s])=>`<li>${esc(s)}</li>`).join('')+'</ul>':'<p>まだ何も書かれていない。</p>'}`,'journal');
  }
  const ENDINGS = {
    A:{title:'解体',flag:'ending_a_seen',pages:[
      '解体台の前で、千夜は小さな金属の指関節を見つめていた。',
      '天井には三つの裸電球。冷たい白光がコンクリートの壁を照らし、湿った空気には鉄と薬品の臭気が漂っている。台の上には分解途中の義体が横たわり、剥き出しになった人工筋肉から透明な潤滑液が滴っていた。',
      '先ほどまで、その指は誰かの身体に繋がっていた。\n千夜が手の中の部品を傾けると、磨かれた爪の表面に自分の顔がかすかに映る。額に張りついた髪も、油に汚れた頬も、歪んだ金属の中ではひどく曖昧だった。',
      '背後では年配の作業員が、外した部品を仕分けている。\n《都市流通》《部品再生》《処分待ち》\n金属片が箱の底に落ちるたび、乾いた響きが室内を渡った。壁際の端末には、短い文字列が並んでいる。',
      '《適合B級》《再刻印可》《識別痕なし》\n最後の項目に、千夜の視線が留まった。\n識別痕なし。\nかつて誰のものだったのか、それを知る手がかりはもう残されていない。名前を失った部品は、いずれ別の身体に組み込まれ、また誰かの指として動き始めるのだろう。',
      '千夜は金属の爪を、親指の腹でそっと撫でた。\nそのとき、背後の扉がわずかに開いた。隙間から赤い光が差し込み、床に細長い筋を描く。戸口にはお辰が立っていた。',
      '「……どうだい。少しは目が慣れたかね」\n千夜は振り返らず、手元の部品を眺めたまま答える。\n「……まだ、よく見えねぇ」\nお辰は小さく鼻を鳴らした。笑ったようにも、ため息をついたようにも聞こえた。\n「それでいいのさ。慣れるんじゃないよ。慣れたら壊れる」',
      '年老いた声が、金属の匂いの中に静かに沈んだ。お辰は台の上に残された義体へ目を向けた。その皺の深い顔には、いつもの商売人めいた笑みがない。\n「どれだけ綺麗に磨いたってね、誰かの一部だったことまで消しちゃいけないよ」',
      '千夜は答えず、手の中の指関節をもう一度傾けた。爪の縁に残された小さな傷が、白い光を受けて浮かび上がった。'
    ]},
    B:{title:'ありふれた日々',flag:'ending_b_seen',pages:[
      'マサルの屋台には、まだ明かりが灯っていた。\n雨上がりの路地を抜け、千夜と暁里が暖簾をくぐる。煮立ったスープの匂いが湿った空気に混じり、冷えた頬を撫でた。鍋の前に立っていたマサルは、二人の顔を交互に見て、わずかに眉を上げる。',
      '「……おいおい、今日は連れがいるのか」\n「醤油、二つ」\n千夜が短く告げると、マサルは呆れたように鼻を鳴らした。\n「聞いちゃいねぇな。まあいい、そこ座ってろ」\n暁里が小さく笑う。千夜は構わずカウンターに腰を下ろし、濡れた袖口を払った。',
      'マサルはそれ以上何も聞かず、鍋に向き直った。湯の中で麺がほぐれ、白い湯気が裸電球の光を曇らせる。義手が鍋の縁に触れるたび、かすかな金属の響きがした。やがて、二杯のラーメンが並んだ。',
      '千夜はさっさと箸を割り、麺をすすり始める。暁里は丼から立ちのぼる湯気を眺め、それから隣の横顔に目を向けた。\n「……何だよ。食わねぇのか」\n「ううん、食べる」\n暁里も箸を取った。熱い麺を少しずつ口に運ぶと、目元がふわりと緩む。',
      '「……おいしい。あったかいね」\n「そりゃ、ラーメンだからな」\n暁里は小さく笑った。千夜は何も言わず、残った麺をすすった。',
      'カウンターの端には、古い携帯ラジオが置かれている。さっきまで流れていたRe:naの歌は、もう聞こえない。今は鍋の煮える気配と、ときおり触れ合う食器の響きばかりが、狭い屋台を満たしていた。',
      '暁里はラジオに一度だけ目をやると、再び千夜の方を向いた。\n「……ねえ、また来てもいいかな。こうして、二人で」\n千夜は麺をすすり、ゆっくりと飲み込んだ。\n「……好きにしろよ。別に、減るもんじゃねぇし」\n暁里は一瞬きょとんとして、それから嬉しそうに笑った。',
      '頭上の裸電球が、二人の横顔を橙色に照らしていた。路地の向こうでは誰かが怒鳴り、古い配管からは相変わらず水が滴っている。'
    ]}
  };
  function endingChoiceA(){
    openPanel('<p class="eyebrow">届け物の報告を終えた</p><h2>奥の部屋で、解体が始まる。</h2><p>お辰は作業場の方へちらりと目を向けた。</p><div class="panel-actions"><button class="actionbtn primary" id="endA">奥の解体室へ行く</button><button class="actionbtn" id="endWalk">まだ街を歩く</button></div>');
    $('endA').onclick=()=>{closePanel();event('aApproach',[page('','“解体”の作業が始まる合図だった。お辰は視線を上げずに言う。'),...p('お辰','行ってみな。見習いなら、目で覚えな。'),page('','千夜は無言でうなずき、奥の部屋へ向かう。提灯の赤が背に映り、扉の隙間で揺れた。一歩、闇に吸い込まれる。')])};$('endWalk').onclick=()=>{closePanel();go('map')};
  }
  function endingChoiceB(){
    setAuto(false);
    show('あかりは、もう音のしないラジオを大切そうに抱えている。');
    revealNow();
    $('nextWrap').classList.add('hidden');
    $('choices').innerHTML='<button type="button" class="choice ramen-invite-choice" id="endB">ラーメンに誘う</button><button type="button" class="choice ramen-invite-choice" id="endWalk">もう少し街を歩く</button>';
    $('endB').onclick=()=>{if(modal||state.dialogue)return;show('');event('ramenInvite',[...p('千夜','……腹、減ったな。ラーメンでも食うか。おごってやるよ'),...p('あかり','えっ、いいの？　会ったばかりなのに、悪いよ'),...p('千夜','別に。嫌ならいいけど'),...p('あかり','嫌じゃない！　……じゃあ、お言葉に甘えちゃおうかな')])};
    $('endWalk').onclick=()=>{if(modal||state.dialogue)return;show('');go('map')};
  }
  function recollectionList(){
    syncEndings();recollectionActive=true;
    const entries=['A','B'].map(type=>unlockedEndings[type]
      ? `<button class="recollection-entry" data-replay="${type}"><span>ENDING ${type}</span><strong>${esc(ENDINGS[type].title)}</strong><small>読み返す ›</small></button>`
      : `<div class="recollection-entry is-locked" aria-label="未到達の結末"><span>ENDING ${type}</span><strong>？？？</strong><small>まだ記録されていない</small></div>`).join('');
    openPanel(`<div class="recollection-gallery"><p class="journal-kicker">REMEMBRANCE</p><h2>回想</h2><p>一度見届けた結末を読み返せる。</p><div class="recollection-list">${entries}</div><button class="actionbtn" id="recallToTitle">タイトルへ戻る</button></div>`,'recollection');
    document.querySelectorAll('[data-replay]').forEach(b=>b.onclick=()=>endingSequence(b.dataset.replay,0,true));
    $('recallToTitle').onclick=()=>{recollectionActive=false;title()};$('closeModal').onclick=()=>{recollectionActive=false;title()};
  }
  function endingSequence(type,index=0,replay=false){
    const ending=ENDINGS[type];if(!ending)return;
    const last=index===ending.pages.length-1;
    openPanel(`<div class="ending-novel ending-${type.toLowerCase()}">${!last?'<button class="quiet-skip ending-skip" id="endingSkip" aria-label="残りのエンディングをスキップ">SKIP »</button>':''}<p class="eyebrow">ENDING ${type} / ${esc(ending.title)}</p><div class="ending-still" role="img" aria-label="${esc(ending.title)}のスチル"><span>ENDING ${type}<small>スチル準備中</small></span></div><p class="ending-novel-copy">${esc(ending.pages[index])}</p><div class="panel-actions"><button class="actionbtn primary" id="endingNext">${last?'閉じる ×':'次へ ›'}</button><button class="actionbtn" id="endWalk">${replay?'回想一覧へ':'街へ戻る'}</button></div></div>`);
    $('overlay').classList.add('ending-open',`ending-${type.toLowerCase()}-open`);
    if(!last)$('endingSkip').onclick=()=>endingSequence(type,ending.pages.length-1,replay);
    $('endingNext').onclick=()=>{if(!last){endingSequence(type,index+1,replay);return}if(replay){recollectionList();return}mark(ending.flag);unlockedEndings[type]=true;persistEndings();closePanel();go('map')};
    $('endWalk').onclick=()=>{if(replay){recollectionList();return}closePanel();go('map')};
    if(replay)$('closeModal').onclick=recollectionList;
  }
  function save(){saveSilent();openPanel('<div class="journal-head"><span class="journal-emblem">◇</span><div><p class="journal-kicker">RECORD SAVED</p><h2>記録を残した</h2></div></div><p>街を歩いた道と、交わした言葉をこのブラウザに保存した。</p><p>次はタイトルの「続きから」で再開できる。</p>','save')}
  function load(){try{const saved=JSON.parse(localStorage.getItem(KEY));if(!saved||saved.version!==3||!scenes[saved.scene]||!Array.isArray(saved.items))throw Error('invalid');state={...initial(),...saved,flags:saved.flags||{},visited:saved.visited||{},inspected:saved.inspected||{}};syncEndings();if(has('parcel')&&!has('slip')&&!flag('delivery_complete')){add('slip');state.stage=20}if(state.dialogue){state.dialogue.lines=state.dialogue.lines.filter(line=>line.who!=='地の文');state.dialogue.index=Math.min(state.dialogue.index,Math.max(0,state.dialogue.lines.length-1))}saveSilent();closePanel();render();resumeScene()}catch{openPanel('<h2>保存データがありません</h2><p>読み込めるVer.3.0の記録がありません。</p>')}}
  function confirmReset(){openPanel('<h2>はじめから</h2><p>Ver.3.0の現在の進行が失われます。やり直しますか？　以前の試作版の保存データは残ります。</p><div class="panel-actions"><button class="actionbtn primary" id="resetYes">はじめから</button><button class="actionbtn" id="resetNo">やめる</button></div>');$('resetYes').onclick=()=>{state=initial();saveSilent();closePanel();render();show('奥では、お辰が義指を磨いている。');};$('resetNo').onclick=closePanel}
  function title(){const saved=!!localStorage.getItem(KEY);const old=REVIEW&&!!localStorage.getItem('itachikutsu-story-v3');if(saved){const record=loadJSON(KEY,null);if(record?.flags)for(const type of ['A','B'])if(record.flags[`ending_${type.toLowerCase()}_seen`])unlockedEndings[type]=true;persistEndings()}
    openPanel(`<div class="title-layout"><span class="title-rule"></span><h1 class="title-main">鼬窟</h1><div class="title-reading">いたちくつ</div><div class="title-sub">千夜の棲む街</div><p class="title-copy">壊れていたって、生きていける。</p><div class="title-actions"><button class="actionbtn primary" id="newStart">はじめる</button>${saved?'<button class="actionbtn" id="continue">続きから</button>':''}<button class="actionbtn" id="openRecollection">回想</button>${old?'<button class="actionbtn" id="copyOldSave">Ver.87の記録をコピーして試す</button>':''}</div><div class="title-footnote">© 2026 Tomoru Kuze${REVIEW?' / 検証版':''}</div></div>`);$('overlay').classList.add('title-screen');$('openRecollection').onclick=recollectionList;$('newStart').onclick=()=>{recollectionActive=false;state=initial();history=[];saveHistory();saveSilent();closePanel();render();showIntro()};if(saved)$('continue').onclick=load;if(old)$('copyOldSave').onclick=()=>{try{const source=JSON.parse(localStorage.getItem('itachikutsu-story-v3'));if(source?.version!==3||!scenes[source.scene]||!Array.isArray(source.items))throw Error('invalid');localStorage.setItem(KEY,JSON.stringify(source));load()}catch{openPanel('<h2>記録を読み込めませんでした</h2><p>元の記録は変更していません。</p>')}}}
  $('nextBtn').onclick=advance;
  $('skipBtn').onclick=()=>{if(modal)return;setAuto(false);cancelTimers();if(state.scene==='prologue'&&!state.introDone)finishIntro();else if(state.dialogue)finishEvent(true)};
  $('assistBtn').onclick=()=>{if(modal)return;assistOn=!assistOn;render()};
  $('historyBtn').onclick=()=>{if(modal)return;historyModal()};
  $('autoBtn').onclick=()=>{if(modal)return;if(!fullyVisible)revealNow();setAuto(!prefs.auto)};
  $('textSpeed').value=prefs.speed;
  $('textSpeed').onchange=()=>{prefs.speed=$('textSpeed').value;savePrefs();if(!fullyVisible)revealNow()};
  // Move all reading controls into one compact top-bar menu. The separate
  // read-skip button is redundant with the story SKIP action.
  const readingToggle=document.createElement('button');readingToggle.id='readingSettingsBtn';readingToggle.type='button';readingToggle.className='smallbtn reading-menu-button';readingToggle.textContent='表示・操作';readingToggle.setAttribute('aria-expanded','false');readingToggle.setAttribute('aria-controls','readingPanel');
  const readingPanel=document.createElement('section');readingPanel.id='readingPanel';readingPanel.className='reading-panel';readingPanel.hidden=true;readingPanel.setAttribute('aria-label','表示と操作の設定');readingPanel.innerHTML='<strong>表示・操作</strong>';
  $('historyBtn').textContent='会話履歴を見る';readingPanel.appendChild($('historyBtn'));
  $('autoBtn').textContent=`AUTO：${prefs.auto?'ON':'OFF'}`;readingPanel.appendChild($('autoBtn'));
  const speedLabel=document.createElement('label');speedLabel.textContent='文字速度';speedLabel.setAttribute('for','textSpeed');speedLabel.appendChild($('textSpeed'));readingPanel.appendChild(speedLabel);
  $('readingTools').classList.add('hidden');$('readSkipBtn')?.remove?.();document.querySelector('.topbar .actions').appendChild(readingToggle);document.querySelector('.topbar').appendChild(readingPanel);
  const closeReading=()=>{readingPanel.hidden=true;readingToggle.setAttribute('aria-expanded','false')};
  readingToggle.onclick=()=>{readingPanel.hidden=!readingPanel.hidden;readingToggle.setAttribute('aria-expanded',String(!readingPanel.hidden))};
  const openHistory=$('historyBtn').onclick;$('historyBtn').onclick=()=>{closeReading();openHistory()};
  document.addEventListener('click',e=>{if(!e.target.closest?.('#readingPanel,#readingSettingsBtn'))closeReading()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeReading()});
  document.querySelector('.log').onclick=()=>{if(!$('nextWrap').classList.contains('hidden'))advance()};
  $('mapBtn').onclick=()=>{if(!modal)returnMap()};
  $('itemsBtn').onclick=()=>{if(!modal)itemsModal()};$('questBtn').onclick=()=>{if(!modal)questModal()};$('saveBtn').onclick=()=>{if(!modal)save()};
  const effectLayer=document.createElement('div');effectLayer.id='effectLayer';document.querySelector('.stage').appendChild(effectLayer);
  const useMode=document.createElement('div');useMode.id='useMode';useMode.hidden=true;useMode.innerHTML='<span class="use-mode-name"></span><small class="use-mode-help"></small><button type="button" id="cancelUse">やめる ×</button>';document.querySelector('.stage').appendChild(useMode);
  const discovery=document.createElement('div');discovery.id='discoveryNote';discovery.hidden=true;discovery.setAttribute('aria-live','polite');document.querySelector('.stage').appendChild(discovery);
  const prompt=document.createElement('button');prompt.id='interactionPrompt';prompt.type='button';prompt.hidden=true;document.querySelector('.stage').appendChild(prompt);prompt.onclick=()=>{if(state.scene==='stall')observeObject('radio',{allowDuringDialogue:true})};
  // Touching the still outside the dialogue panel dismisses it immediately.
  // Capture runs before the hotspot's click handler, so one tap both dismisses
  // a short inspection and activates the chosen object. Story dialogue pages
  // are retained as pending instead of silently discarding narrative progress.
  document.querySelector('.stage').addEventListener?.('click',()=>{
    if(modal||!$('app').classList.contains('dialogue-active'))return;
    // The prologue has no exploration view to return to: an outside tap
    // advances the prose instead of making its continuation inaccessible.
    if(state.scene==='prologue'&&!state.introDone){advanceIntro();return}
    if(state.dialogue){state.pending=state.dialogue;state.dialogue=null;saveSilent()}
    show('');
  },true);
  $('cancelUse').onclick=()=>{state.selected=null;updateUseMode();saveSilent()};
  // A conversation is resumed from its saved page after returning to the same character's room.
  document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(recollectionActive&&modal){recollectionList();return}if(modal==='open'&&!$('overlay').classList.contains('ending-open'))closePanel();else if(state.selected&&!modal){state.selected=null;updateUseMode();saveSilent()}});
  render();show('');title();
})();
