// ── HTR Radio Player v3 ─────────────────────────────────────
'use strict';

const audio = document.getElementById('main-audio');
let stations       = [];
let currentStationIdx = 0;
let currentTrackIdx   = 0;
let isPlaying         = false;
let shuffleOrder      = [];
let shufflePos        = 0;
let playingIntro      = false;
let duration          = 0;
let progressDragging  = false;

const IS_DESKTOP = () => window.innerWidth >= 768;

// ── Load data ─────────────────────────────────────────────────
fetch('radio-data.json?cb=' + Date.now())
  .then(r => r.json())
  .then(data => {
    stations = data.stations || [];
    buildMobileStrip();
    buildMobileGrid();
    buildDesktopGrid();
    applyStationArt();
    loadStation(0, false);
  })
  .catch(err => console.error('Failed to load radio-data.json:', err));

// ── Shuffle ───────────────────────────────────────────────────
function buildShuffle(len) {
  const arr = Array.from({length: len}, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Station management ────────────────────────────────────────
function loadStation(idx, autoplay) {
  currentStationIdx = idx;
  const st = stations[idx];
  if (!st) return;

  const tracks = st.tracks || [];
  shuffleOrder = buildShuffle(tracks.length);
  shufflePos   = 0;
  currentTrackIdx = shuffleOrder[0] ?? 0;

  updateStationUI(st);
  updateAccentColor(st.color);
  updateActiveStation();

  if (tracks.length > 0) loadTrack(autoplay);
}

function switchStation(idx) {
  if (idx === currentStationIdx) { togglePlay(); return; }
  const wasPlaying = isPlaying;
  audio.pause();
  isPlaying = false;
  loadStation(idx, wasPlaying);
}

function getStation() { return stations[currentStationIdx]; }
function getTracks()  { return getStation()?.tracks || []; }
function getTrack()   { return getTracks()[currentTrackIdx]; }

// ── Track management ──────────────────────────────────────────
function loadTrack(autoplay) {
  const track = getTrack();
  if (!track) return;

  playingIntro = false;
  hideCasey();
  updateTrackUI(track);
  updateBgArt(track.cover);

  const st = getStation();
  if (st.djIntros && track.introClips && track.introClips.length > 0) {
    const clip = track.introClips[Math.floor(Math.random() * track.introClips.length)];
    playingIntro = true;
    showCasey();
    audio.src = clip;
    audio.load();
    if (autoplay) playAudio();
  } else {
    audio.src = track.audio;
    audio.load();
    if (autoplay) playAudio();
  }
}

function playAudio() {
  audio.removeAttribute('crossorigin');
  audio.load();
  const p = audio.play();
  if (p) p.then(() => {
    isPlaying = true;
    updatePlayBtn();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
  }).catch(() => {
    isPlaying = false;
    updatePlayBtn();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  });
}

audio.addEventListener('ended', () => {
  if (playingIntro) {
    playingIntro = false;
    hideCasey();
    const track = getTrack();
    if (track) { audio.src = track.audio; audio.load(); playAudio(); }
    return;
  }
  nextTrack();
});

// ── Stall / error recovery ────────────────────────────────────
let stallTimer = null;
let lastTime   = 0;
let stallCount = 0;

function resetStallTimer() {
  clearTimeout(stallTimer);
  if (!isPlaying) return;
  stallTimer = setTimeout(() => {
    // If currentTime hasn't moved and we're supposed to be playing — stalled
    if (isPlaying && Math.abs(audio.currentTime - lastTime) < 0.1 && !audio.paused) {
      stallCount++;
      console.warn('HTR Radio: stall detected — skipping track', stallCount);
      nextTrack();
    }
    lastTime = audio.currentTime;
    resetStallTimer();
  }, 8000);
}

audio.addEventListener('playing',  () => { stallCount = 0; lastTime = audio.currentTime; resetStallTimer(); });
audio.addEventListener('waiting',  () => resetStallTimer());
audio.addEventListener('stalled',  () => { console.warn('HTR Radio: stalled event'); if (isPlaying) { setTimeout(() => nextTrack(), 3000); } });
audio.addEventListener('error',    () => { console.warn('HTR Radio: audio error — skipping'); if (isPlaying) { setTimeout(() => nextTrack(), 1500); } });
audio.addEventListener('pause',    () => clearTimeout(stallTimer));
audio.addEventListener('emptied',  () => clearTimeout(stallTimer));

audio.addEventListener('timeupdate', () => { if (!progressDragging) updateProgress(); });
audio.addEventListener('loadedmetadata', () => { duration = audio.duration || 0; updateDuration(); });
audio.addEventListener('durationchange',  () => { duration = audio.duration || 0; updateDuration(); });

// ── Playback controls ─────────────────────────────────────────
function togglePlay() {
  if (audio.paused) {
    playAudio();
  } else {
    audio.pause();
    isPlaying = false;
    updatePlayBtn();
    if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  }
}

function nextTrack() {
  const tracks = getTracks();
  if (!tracks.length) return;
  shufflePos = (shufflePos + 1) % shuffleOrder.length;
  if (shufflePos === 0) shuffleOrder = buildShuffle(tracks.length);
  currentTrackIdx = shuffleOrder[shufflePos];
  loadTrack(isPlaying);
}

function prevTrack() {
  const tracks = getTracks();
  if (!tracks.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  shufflePos = (shufflePos - 1 + shuffleOrder.length) % shuffleOrder.length;
  currentTrackIdx = shuffleOrder[shufflePos];
  loadTrack(isPlaying);
}

// ── Artist link ───────────────────────────────────────────────
function goToArtist() {
  const track = getTrack();
  if (!track?.artistId) return;
  window.open(`https://${track.artistId}.hellotexasrecords.com`, '_blank');
}

// ── Progress bar ──────────────────────────────────────────────
function wireProgress(barId, fillId, thumbId, elapsedId) {
  const bar   = document.getElementById(barId);
  const fill  = document.getElementById(fillId);
  const thumb = document.getElementById(thumbId);
  if (!bar) return;
  bar.addEventListener('click', e => {
    if (!duration) return;
    const r = bar.getBoundingClientRect();
    audio.currentTime = ((e.clientX - r.left) / r.width) * duration;
  });
  bar.addEventListener('mousedown', () => progressDragging = true);
  bar.addEventListener('mousemove', e => {
    if (!progressDragging || !duration) return;
    const r = bar.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * duration;
  });
}
document.addEventListener('mouseup', () => progressDragging = false);

wireProgress('np-progress-bar',  'np-fill',  'np-thumb',  'np-elapsed');
wireProgress('dnp-progress-bar', 'dnp-fill', 'dnp-thumb', 'dnp-elapsed');

function updateProgress() {
  if (!duration) return;
  const pct = (audio.currentTime / duration) * 100;
  ['np-fill','dnp-fill'].forEach(id => { const el = document.getElementById(id); if(el) el.style.width = pct+'%'; });
  ['np-thumb','dnp-thumb'].forEach(id => { const el = document.getElementById(id); if(el) el.style.left = pct+'%'; });
  setText('np-elapsed',  fmt(audio.currentTime));
  setText('dnp-elapsed', fmt(audio.currentTime));
}

function updateDuration() {
  setText('np-duration',  fmt(duration));
  setText('dnp-duration', fmt(duration));
}

function fmt(s) {
  if (!isFinite(s) || s <= 0) return '--:--';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

// ── UI updates ────────────────────────────────────────────────
function updatePlayBtn() {
  // Mobile
  const mb = document.getElementById('btn-play');
  if (mb) {
    mb.querySelector('.play-icon').style.display  = isPlaying ? 'none'  : 'block';
    mb.querySelector('.pause-icon').style.display = isPlaying ? 'block' : 'none';
    mb.classList.toggle('playing', isPlaying);
  }
  // Desktop
  const db = document.getElementById('dnp-btn-play');
  if (db) {
    db.querySelector('.play-icon').style.display  = isPlaying ? 'none'  : 'block';
    db.querySelector('.pause-icon').style.display = isPlaying ? 'block' : 'none';
    db.classList.toggle('playing', isPlaying);
  }
}

function updateTrackUI(track) {
  // Mobile
  setText('np-track',  track.title  || '—');
  setText('np-artist', track.artist || '');
  setText('np-album',  track.album  || '');
  const ma = document.getElementById('np-art');
  if (ma) ma.src = track.cover || '';

  // Desktop
  setText('dnp-track',  track.title  || '—');
  setText('dnp-artist', track.artist || '');
  setText('dnp-album',  track.album  || '');
  const da = document.getElementById('dnp-art');
  if (da) da.src = track.cover || '';

  // Update "now playing" text in active station card (desktop)
  const nowEl = document.getElementById(`dsg-now-${currentStationIdx}`);
  if (nowEl) nowEl.textContent = '▶ ' + (track.title || '—');

  // Media Session API
  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  track.title  || 'HTR Radio',
      artist: track.artist || 'Hello Texas Records',
      album:  track.album  || (getStation()?.name || 'HTR Radio'),
      artwork: track.cover ? [
        { src: track.cover, sizes: '512x512', type: 'image/png' },
        { src: track.cover, sizes: '256x256', type: 'image/png' },
      ] : [{ src: 'https://raw.githubusercontent.com/SteveP999/hello-texas-records/main/htr-logo.png', sizes:'512x512', type:'image/png' }]
    });
    navigator.mediaSession.setActionHandler('play',          () => { playAudio(); isPlaying = true;  updatePlayBtn(); });
    navigator.mediaSession.setActionHandler('pause',         () => { audio.pause(); isPlaying = false; updatePlayBtn(); });
    navigator.mediaSession.setActionHandler('nexttrack',     () => nextTrack());
    navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack());
    navigator.mediaSession.setActionHandler('stop',          () => { audio.pause(); isPlaying = false; updatePlayBtn(); });
  }
}

function updateStationUI(st) {
  // Mobile pill
  setText('np-station-name', st.shortName || st.name);
  const md = document.getElementById('np-dot');
  if (md) { md.style.background = st.color; md.style.boxShadow = `0 0 6px ${st.glow}`; }

  // Desktop station bar
  setText('dnp-station-name-d', st.name || '');
  setText('dnp-station-genre-d', st.genre || '');
  const dd = document.getElementById('dnp-dot-d');
  if (dd) { dd.style.background = st.color; dd.style.boxShadow = `0 0 6px ${st.glow}`; }
  const sa = document.getElementById('dnp-station-art');
  if (sa) { sa.src = st.art || ''; sa.style.display = st.art ? 'block' : 'none'; }

  // Desktop sub header
  setText('dsg-sub', st.name || '');
}

function updateBgArt(src) {
  document.getElementById('bg-art').style.backgroundImage = src ? `url("${src}")` : 'none';
}

function updateAccentColor(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--accent', color);
  const r = parseInt(color.slice(1,3),16);
  const g = parseInt(color.slice(3,5),16);
  const b = parseInt(color.slice(5,7),16);
  document.documentElement.style.setProperty('--glow', `rgba(${r},${g},${b},0.35)`);
}

function updateActiveStation() {
  // Mobile strip
  document.querySelectorAll('.strip-btn').forEach((btn, i) => btn.classList.toggle('active', i === currentStationIdx));
  // Mobile grid
  document.querySelectorAll('.station-card').forEach((card, i) => card.classList.toggle('active', i === currentStationIdx));
  // Desktop grid
  document.querySelectorAll('.dsg-card').forEach((card, i) => card.classList.toggle('active', i === currentStationIdx));
}

function showCasey() {
  document.getElementById('np-casey')?.classList.add('visible');
  document.getElementById('dnp-casey')?.classList.add('visible');
}
function hideCasey() {
  document.getElementById('np-casey')?.classList.remove('visible');
  document.getElementById('dnp-casey')?.classList.remove('visible');
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ── Station ICONS ─────────────────────────────────────────────
const STATION_ICONS = {
  'lone-star':'🤠','skyline-fm':'🌃','sunset-boulevard':'🌅','voltage':'⚡',
  'velvet-lounge':'🎷','spirit-radio':'✝️','neon-nights':'🪩','horizon':'🌌',
  'retro-gold':'🎸','lucas-harlow':'🎹','htr-top-20':'🏆','the-hits':'⭐',
  'back-porch':'🪑','benders-search':'🔍','new-releases':'🆕',
};

// ── MOBILE STRIP ──────────────────────────────────────────────
function buildMobileStrip() {
  const strip = document.getElementById('np-stations-strip');
  if (!strip) return;
  strip.innerHTML = stations.map((st, i) => `
    <button class="strip-btn ${i===0?'active':''}" onclick="switchStation(${i})"
            title="${st.name}" id="strip-btn-${i}"
            style="background:${st.color}22;border-color:${st.color}33">
      <div class="strip-placeholder" id="strip-ph-${i}" style="color:${st.color}">${STATION_ICONS[st.id]||'📻'}</div>
    </button>
  `).join('');
}

// ── MOBILE GRID ───────────────────────────────────────────────
function buildMobileGrid() {
  const grid = document.getElementById('stations-grid');
  if (!grid) return;
  grid.innerHTML = stations.map((st, i) => `
    <div class="station-card ${i===0?'active':''}" onclick="stationCardClick(${i})">
      <div class="station-card-art" id="mcard-art-${i}"></div>
      <div class="station-card-placeholder" id="mcard-ph-${i}">
        <div class="station-card-placeholder-inner">
          <div class="placeholder-color" style="background:${st.color}"></div>
          <div class="placeholder-icon">${STATION_ICONS[st.id]||'📻'}</div>
        </div>
      </div>
      <div class="station-card-overlay"></div>
      <div class="station-card-badge"></div>
      <div class="station-card-body">
        <div class="station-card-name">${st.name}</div>
        <div class="station-card-genre">${st.genre}</div>
      </div>
    </div>
  `).join('');
}

// ── DESKTOP GRID ──────────────────────────────────────────────
function buildDesktopGrid() {
  const grid = document.getElementById('dsg-grid');
  if (!grid) return;
  grid.innerHTML = stations.map((st, i) => `
    <div class="dsg-card ${i===0?'active':''}" onclick="switchStation(${i})" id="dsg-card-${i}">
      <div class="dsg-card-art" id="dsg-art-${i}"></div>
      <div class="dsg-placeholder" id="dsg-ph-${i}">
        <div class="dsg-ph-color" style="background:${st.color}"></div>
        <div class="dsg-placeholder-icon">${STATION_ICONS[st.id]||'📻'}</div>
      </div>
      <div class="dsg-card-overlay"></div>
      <div class="dsg-card-active-overlay"></div>
      <div class="dsg-card-badge"></div>
      <div class="dsg-card-body">
        <div class="dsg-card-name">${st.name}</div>
        <div class="dsg-card-genre">${st.genre}</div>
        <div class="dsg-card-now" id="dsg-now-${i}"></div>
      </div>
    </div>
  `).join('');
}

// ── Apply station art images ───────────────────────────────────
function applyStationArt() {
  stations.forEach((st, i) => {
    if (!st.art) return;
    const setBg = (el, ph) => {
      if (!el) return;
      el.style.backgroundImage = `url('${st.art}')`;
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      if (ph) ph.style.display = 'none';
    };
    // Mobile strip
    const sb = document.getElementById(`strip-btn-${i}`);
    const sp = document.getElementById(`strip-ph-${i}`);
    if (sb) { sb.style.backgroundImage=`url('${st.art}')`;sb.style.backgroundSize='cover';sb.style.backgroundPosition='center';sb.style.borderColor=st.color+'88'; if(sp) sp.style.display='none'; }
    // Mobile card
    setBg(document.getElementById(`mcard-art-${i}`), document.getElementById(`mcard-ph-${i}`));
    // Desktop card
    setBg(document.getElementById(`dsg-art-${i}`),   document.getElementById(`dsg-ph-${i}`));
  });
}

// ── Mobile view switching ─────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.getElementById('tab-' + name)?.classList.add('active');
}
function openStations()  { showView('stations'); }
function closeStations() { showView('nowplaying'); }

function stationCardClick(i) {
  switchStation(i);
  setTimeout(() => showView('nowplaying'), 200);
}

// BroadcastChannel — stop radio if artist site starts playing
try {
  const bc = new BroadcastChannel('htr-audio');
  bc.onmessage = e => {
    if (e.data?.type === 'artist-play' && isPlaying) {
      audio.pause(); isPlaying = false; updatePlayBtn();
      if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    }
  };
  audio.addEventListener('play', () => bc.postMessage({ type: 'radio-play' }));
} catch(e) {}
