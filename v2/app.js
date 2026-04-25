const CONFIG = {
  baseURL: 'https://planter.103.74.92.75.nip.io',
  username: 'cam',
  password: 'CamAccess2026',
  apiKey: 'change_me',
  cameraHost: 'https://cam.103.74.92.75.nip.io'
};

const qs=(id)=>document.getElementById(id);
const fmt=(n,d=1)=> Number.isFinite(Number(n))?Number(n).toFixed(d):'—';
const auth=()=> 'Basic '+btoa(`${CONFIG.username}:${CONFIG.password}`);

let charts={};

async function jget(url){
  const r=await fetch(url,{headers:{Authorization:auth(),Accept:'application/json'}});
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function postCommand(action,payload={}){
  const r=await fetch(`${CONFIG.baseURL}/api/command?api_key=${CONFIG.apiKey}`,{
    method:'POST',headers:{Authorization:auth(),'Content-Type':'application/json'},
    body:JSON.stringify({device:'planter-esp8266-pot1',action,...payload})
  });
  if(!r.ok) throw new Error(`HTTP ${r.status}`);
}

function updateCamera(){
  const img=qs('camImg');
  img.src=`${CONFIG.cameraHost}/capture?t=${Date.now()}`;
}

async function setLight(v){
  const val=Math.max(0,Math.min(255,Number(v)||0));
  await fetch(`${CONFIG.cameraHost}/control?var=led_intensity&val=${val}`,{mode:'no-cors'});
  qs('lightVal').textContent=String(val);
  qs('lightSlider').value=String(val);
}

function drawChart(id,label,labels,data,color){
  if(charts[id]) charts[id].destroy();
  charts[id]=new Chart(qs(id),{type:'line',data:{labels,datasets:[{label,data,borderColor:color,tension:.35,fill:false}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{display:false}}}});
}

function ruTrigger(r){
  const map={
    heartbeat:'Периодическое обновление',manual_start:'Ручной запуск полива',manual_stop:'Ручная остановка полива',
    manual_timeout_stop:'Остановка по таймеру',auto_start_low_moisture:'Автозапуск: низкая влажность',
    auto_stop_target_reached:'Автостоп: достигнута цель',auto_stop_safety_timeout:'Автостоп: лимит времени',
    auto_mode_enabled:'Включён режим Авто',manual_mode_enabled:'Включён режим Ручной',boot:'Перезапуск устройства'
  };
  return map[r]||r||'—';
}

async function refresh(){
  const latest=await jget(`${CONFIG.baseURL}/api/latest`);
  const p=(latest.pots&&latest.pots[0])||{};
  qs('kMoisture').textContent=`${fmt(p.moisture_pct,1)}%`;
  qs('kAirT').textContent=`${fmt(p.air_temp_c,1)}°C`;
  qs('kAirH').textContent=`${fmt(p.air_humidity_pct,1)}%`;
  qs('kRaw').textContent=p.soil_raw ?? '—';
  qs('kTrigger').textContent=ruTrigger(p.trigger_reason);

  const m=Math.max(0,Math.min(100,Number(p.moisture_pct)||0));
  const ah=Math.max(0,Math.min(100,Number(p.air_humidity_pct)||0));
  const at=Math.max(0,Math.min(100,((Number(p.air_temp_c)||0)+10)*2)); // -10..40 => 0..100
  const pump=p.pump_on?100:0;
  qs('barMoisture').style.width=`${m}%`; qs('txtMoisture').textContent=`${m.toFixed(0)}%`;
  qs('barAirHum').style.width=`${ah}%`; qs('txtAirHum').textContent=`${ah.toFixed(0)}%`;
  qs('barAirTemp').style.width=`${at}%`; qs('txtAirTemp').textContent=`${fmt(p.air_temp_c,1)}°C`;
  qs('barPump').style.width=`${pump}%`; qs('txtPump').textContent=p.pump_on?'ON':'OFF';

  qs('pillMode').textContent=`🤖 Режим: ${p.mode||'—'}`;
  qs('pillPump').textContent=`💧 Насос: ${(p.pump_on?'ВКЛ':'ВЫКЛ')}`;

  const events=await jget(`${CONFIG.baseURL}/api/events?hours=24`);
  qs('events').innerHTML=(events.items||[]).slice(0,8).map(x=>`<div class='ev'>${new Date(x.ts).toLocaleString('ru-RU')} — <b>${ruTrigger(x.trigger_reason)}</b> • ${fmt(x.moisture_pct,1)}%</div>`).join('') || 'Нет событий';

  const hist=await jget(`${CONFIG.baseURL}/api/history?hours=24`);
  const pts=hist.points||[];
  const labels=pts.map(x=>new Date(x.ts).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}));
  drawChart('chartTemp','T',labels,pts.map(x=>Number(x.air_temp_c)||null),'#f97316');
  drawChart('chartMoist','M',labels,pts.map(x=>Number(x.moisture_pct)||null),'#0ea5e9');
  drawChart('chartAirH','H',labels,pts.map(x=>Number(x.air_humidity_pct)||null),'#22c55e');

  try {
    // 1) Backend weather
    const w=await jget(`${CONFIG.baseURL}/api/weather`);
    const c=w.current||{};
    qs('weatherNow').textContent=`🌡 ${c.temperature_2m ?? '—'}°C   💧 ${c.relative_humidity_2m ?? '—'}%   💨 ${c.wind_speed_10m ?? '—'} м/с   🌧 ${c.precipitation ?? '—'} мм`;
  } catch {
    try {
      // 2) Fallback direct Open-Meteo
      const r=await fetch('https://api.open-meteo.com/v1/forecast?latitude=55.9657&longitude=37.7658&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation', {cache:'no-store'});
      if(!r.ok) throw new Error('open-meteo');
      const w=await r.json();
      const c=w.current||{};
      qs('weatherNow').textContent=`🌡 ${c.temperature_2m ?? '—'}°C   💧 ${c.relative_humidity_2m ?? '—'}%   💨 ${c.wind_speed_10m ?? '—'} м/с   🌧 ${c.precipitation ?? '—'} мм`;
    } catch {
      qs('weatherNow').textContent='Погода временно недоступна';
    }
  }

  try{
    const r=await fetch(`${CONFIG.cameraHost}/capture?t=${Date.now()}`);
    qs('pillCam').textContent=`🎥 Камера: ${r.ok?'онлайн':'оффлайн'}`;
  } catch { qs('pillCam').textContent='🎥 Камера: оффлайн'; }
}

function bind(){
  qs('btnReconnect').onclick=updateCamera;
  qs('btnOpenStream').onclick=()=>window.open(`${CONFIG.cameraHost}/stream`,'_blank');
  qs('btnAuto').onclick=()=>postCommand('set_mode',{mode:'AUTO'}).then(refresh);
  qs('btnManual').onclick=()=>postCommand('set_mode',{mode:'MANUAL'}).then(refresh);
  qs('btnPumpOn').onclick=()=>postCommand('pump_start',{duration_s:8}).then(refresh);
  qs('btnPumpOff').onclick=()=>postCommand('pump_stop').then(refresh);
  qs('light0').onclick=()=>setLight(0);
  qs('light50').onclick=()=>setLight(128);
  qs('light100').onclick=()=>setLight(255);
  qs('lightSlider').onchange=(e)=>setLight(e.target.value);
}

bind();
updateCamera();
refresh();
setInterval(updateCamera,1200);
setInterval(refresh,15000);
