// ── HTR Radio Player ─────────────────────────────────────────
'use strict';

const audio = document.getElementById('main-audio');
let stations = [];
let currentStationIdx = 0;
let currentTrackIdx   = 0;
let isPlaying         = false;
let shuffleOrder      = [];
let shufflePos        = 0;
let playingIntro      = false;
let duration          = 0;
let progressDragging  = false;

// ── Load data ─────────────────────────────────────────────────
fetch('radio-data.json?cb=' + Date.now())
  .then(r => r.json())
  .then(data => {
    stations = data.stations || [];
    buildStationStrip();
    buildStationGrid();
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

  if (tracks.length > 0) {
    loadTrack(autoplay);
  }
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

  // The Hits — play random intro clip first if available
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
  // iOS fix
  audio.removeAttribute('crossorigin');
  audio.load();
  const p = audio.play();
  if (p) p.then(() => { isPlaying = true; updatePlayBtn(); })
              .catch(() => { isPlaying = false; updatePlayBtn(); });
}

audio.addEventListener('ended', () => {
  if (playingIntro) {
    // Intro done — play the actual song
    playingIntro = false;
    hideCasey();
    const track = getTrack();
    if (track) {
      audio.src = track.audio;
      audio.load();
      playAudio();
    }
    return;
  }
  nextTrack();
});

audio.addEventListener('timeupdate', () => {
  if (!progressDragging) updateProgress();
});

audio.addEventListener('loadedmetadata', () => {
  duration = audio.duration || 0;
  updateDuration();
});

audio.addEventListener('durationchange', () => {
  duration = audio.duration || 0;
  updateDuration();
});

// ── Playback controls ─────────────────────────────────────────
function togglePlay() {
  if (audio.paused) {
    playAudio();
  } else {
    audio.pause();
    isPlaying = false;
    updatePlayBtn();
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

// ── Progress bar ──────────────────────────────────────────────
const progressBar = document.getElementById('np-progress-bar');
const fill        = document.getElementById('np-fill');
const thumb       = document.getElementById('np-thumb');

function updateProgress() {
  if (!duration) return;
  const pct = (audio.currentTime / duration) * 100;
  fill.style.width  = pct + '%';
  thumb.style.left  = pct + '%';
  document.getElementById('np-elapsed').textContent = fmt(audio.currentTime);
}

function updateDuration() {
  document.getElementById('np-duration').textContent = fmt(duration);
}

function fmt(s) {
  if (!isFinite(s) || s <= 0) return '--:--';
  return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

progressBar?.addEventListener('click', e => {
  if (!duration) return;
  const r = progressBar.getBoundingClientRect();
  audio.currentTime = ((e.clientX - r.left) / r.width) * duration;
});

progressBar?.addEventListener('mousedown', () => progressDragging = true);
document.addEventListener('mouseup', () => progressDragging = false);
progressBar?.addEventListener('mousemove', e => {
  if (!progressDragging || !duration) return;
  const r = progressBar.getBoundingClientRect();
  audio.currentTime = Math.max(0, Math.min(1, (e.clientX-r.left)/r.width)) * duration;
});

// ── UI updates ────────────────────────────────────────────────
function updatePlayBtn() {
  const btn = document.getElementById('btn-play');
  btn.querySelector('.play-icon').style.display  = isPlaying ? 'none' : 'block';
  btn.querySelector('.pause-icon').style.display = isPlaying ? 'block' : 'none';
  btn.classList.toggle('playing', isPlaying);
}

function updateTrackUI(track) {
  setText('np-track',  track.title   || '—');
  setText('np-artist', track.artist  || '');
  setText('np-album',  track.album   || '');
  const art = document.getElementById('np-art');
  if (track.cover) {
    art.src = track.cover;
  } else {
    art.src = '';
    art.style.background = getStation()?.color || '#1c1a18';
  }
}

function updateStationUI(st) {
  setText('np-station-name', st.shortName || st.name);
  const dot = document.getElementById('np-dot');
  dot.style.background = st.color;
  dot.style.boxShadow  = `0 0 6px ${st.glow}`;
}

function updateBgArt(src) {
  document.getElementById('bg-art').style.backgroundImage = src ? `url("${src}")` : 'none';
}

function updateAccentColor(color) {
  if (!color) return;
  document.documentElement.style.setProperty('--accent', color);
  // glow is accent at 35% opacity
  const r = parseInt(color.slice(1,3),16);
  const g = parseInt(color.slice(3,5),16);
  const b = parseInt(color.slice(5,7),16);
  document.documentElement.style.setProperty('--glow', `rgba(${r},${g},${b},0.35)`);
}

function updateActiveStation() {
  // Strip buttons
  document.querySelectorAll('.strip-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === currentStationIdx);
  });
  // Grid cards
  document.querySelectorAll('.station-card').forEach((card, i) => {
    card.classList.toggle('active', i === currentStationIdx);
  });
}

function showCasey() { document.getElementById('np-casey').classList.add('visible'); }
function hideCasey() { document.getElementById('np-casey').classList.remove('visible'); }
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// ── Station strip (Now Playing tab) ──────────────────────────
const STATION_ICONS = {
  'lone-star':       '🤠',
  'skyline-fm':      '🌃',
  'sunset-boulevard':'🌅',
  'voltage':         '⚡',
  'velvet-lounge':   '🎷',
  'spirit-radio':    '✝️',
  'neon-nights':     '🪩',
  'horizon':         '🌌',
  'retro-gold':      '🎸',
  'lucas-harlow':    '🎹',
  'htr-top-20':      '🏆',
  'the-hits':        '⭐',
  'back-porch':      '🪑',
  'benders-search':  '🔍',
  'new-releases':    '🆕',
};

function buildStationStrip() {
  const strip = document.getElementById('np-stations-strip');
  strip.innerHTML = stations.map((st, i) => `
    <button class="strip-btn ${i===0?'active':''}" onclick="switchStation(${i})"
            title="${st.name}" style="background:${st.color}22;border-color:${st.color}33">
      <div class="strip-placeholder" style="color:${st.color}">
        ${STATION_ICONS[st.id] || '📻'}
      </div>
    </button>
  `).join('');
}

// ── Station grid (Stations tab) ───────────────────────────────
function buildStationGrid() {
  const grid = document.getElementById('stations-grid');
  grid.innerHTML = stations.map((st, i) => `
    <div class="station-card ${i===0?'active':''}" onclick="stationCardClick(${i})">
      <div class="station-card-art" style="background:linear-gradient(135deg,${st.color}44,${st.color}11)"></div>
      <div class="station-card-placeholder">
        <div class="station-card-placeholder-inner">
          <div class="placeholder-color" style="background:${st.color}"></div>
          <div class="placeholder-icon">${STATION_ICONS[st.id] || '📻'}</div>
        </div>
      </div>
      <div class="station-card-overlay"></div>
      <div class="station-card-badge"></div>
      <div class="station-card-body">
        <div class="station-card-name">${st.name}</div>
        <div class="station-card-genre">${st.genre}</div>
        <div class="station-card-playing" id="card-playing-${i}">
          ${st.tracks?.length ? `▶ ${st.tracks[0]?.title || '—'}` : 'No tracks assigned'}
        </div>
      </div>
    </div>
  `).join('');
}

function stationCardClick(i) {
  switchStation(i);
  // Switch back to Now Playing view
  setTimeout(() => showView('nowplaying'), 200);
}

// ── View switching ────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.getElementById('tab-' + name)?.classList.add('active');
}

function openStations()  { showView('stations'); }
function closeStations() { showView('nowplaying'); }
