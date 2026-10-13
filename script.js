const scene = document.querySelector('#scene');
const container = document.querySelector('#lamps');
const lightSwitch = document.querySelector('#light-switch');
const switchImage = document.querySelector('#switch-image');
const status = document.querySelector('#status');
const panel = document.querySelector('#story-panel');
const title = document.querySelector('#story-title');
const story = document.querySelector('#story-text');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let isOn = false, previousTime = null, frameId = null, elapsed = 0;
let pointer = null, focused = null, hoverStarted = 0;
const MAX_LAMPS = 7;
const GAP = 36;
// 所有灯都有独立 DOM 和固定轨道，排队入场不会替换另一盏灯的图片。
const lamps = lampSettings.map(settings => {
  const element = document.createElement('div');
  element.className = 'lamp';
  element.setAttribute('aria-hidden', 'true');
  element.style.setProperty('--x', `${settings.x}%`);
  element.style.setProperty('--size', `${settings.size}vmin`);
  element.style.zIndex = settings.layer;
  const image = document.createElement('img');
  image.src = `images/${settings.image}`;
  image.alt = '';
  element.append(image); container.append(element);
  return { settings, element, image, active: false, progress: 0 };
});
// 两侧分别穿插变色灯与文字灯，再左右交替排队。
function interleaveSide(left) {
  const side = lamps.filter(l => (l.settings.x < 50) === left);
  const colors = side.filter(l => l.settings.color);
  const texts = side.filter(l => !l.settings.color);
  const result = [];
  const total = side.length;
  let usedColors = 0;
  for (let i = 0; i < total; i++) {
    const colorDue = Math.round((i + 1) * colors.length / total) > usedColors;
    if (colorDue) { result.push(colors[usedColors++]); }
    else result.push(texts.shift());
  }
  return result;
}
const leftQueue = interleaveSide(true), rightQueue = interleaveSide(false);
const queue = [];
while (leftQueue.length || rightQueue.length) {
  if (leftQueue.length) queue.push(leftQueue.shift());
  if (rightQueue.length) queue.push(rightQueue.shift());
}
// 初次开灯左右各三盏，分布在下、中、上三个高度。
for (let i = 0; i < 6; i++) {
  const lamp = queue.shift(); lamp.active = true; lamp.progress = .22 + Math.floor(i / 2) * .25;
}
const lastEntered = { true: false, false: false };
function clearFocus() {
  if (focused) { focused.element.classList.remove('glowing'); focused.element.style.zIndex = focused.settings.layer; }
  focused = null; panel.hidden = true;
  scene.style.removeProperty('--hover-background');
}
function renderLamps() {
  lamps.forEach(lamp => {
    const height = lamp.element.offsetHeight || scene.clientHeight * .4;
    const y = scene.clientHeight + 15 - lamp.progress * (scene.clientHeight + height + 30);
    lamp.element.style.transform = `translate3d(-50%, ${y}px, 0)`;
    lamp.element.style.visibility = isOn && lamp.active ? 'visible' : 'hidden';
    lamp.element.style.opacity = isOn && lamp.active ? '1' : '0';
  });
}
function contains(lamp, point) {
  if (!lamp.active || !point) return false;
  const rect = lamp.image.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  const x = (point.x - rect.left) / rect.width, y = (point.y - rect.top) / rect.height;
  if (x < 0 || x >= 1 || y < 0 || y >= 1) return false;
  // 离线预存 alpha 蒙版：直接打开 HTML 也能避开 PNG 的透明留白。
  const mask = hitMasks[lamp.settings.id];
  return !!mask && mask.rows[Math.floor(y * mask.height)][Math.floor(x * mask.width)] === '1';
}
// 保留原背景的渐变位置，以灯的发光色替换下方主色。
function lampGradient(color) {
  const value = color.replace('#', '');
  const channels = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
  const tint = amount => `rgb(${channels.map(c => Math.round(c + (255-c)*amount)).join(', ')})`;
  return `linear-gradient(to bottom, #fff 0%, ${tint(.86)} 28%, ${tint(.42)} 65%, ${color} 100%)`;
}
function updateHover(now) {
  if (!pointer || !isOn) { clearFocus(); return; }
  const switchRect = lightSwitch.getBoundingClientRect();
  const onSwitch = pointer.x >= switchRect.left && pointer.x <= switchRect.right && pointer.y >= switchRect.top && pointer.y <= switchRect.bottom;
  const hit = [...lamps].reverse().sort((a,b) => Number(b.element.style.zIndex)-Number(a.element.style.zIndex)).find(lamp => !(onSwitch && Number(lamp.element.style.zIndex) < 2) && contains(lamp,pointer));
  // 计时阶段始终以实际前景为准；达到暂停阈值后才锁定。
  const locked = focused && now-hoverStarted >= 200 && contains(focused,pointer);
  if (!locked && hit !== focused) {
    clearFocus();
    if (hit) { focused = hit; hoverStarted = now; }
  }
  if (!focused) return;
  if (now-hoverStarted >= 200) focused.element.style.zIndex = 5;
  if (now-hoverStarted >= 500) {
    focused.element.classList.add('glowing');
    const settings = focused.settings;
    if (settings.color) scene.style.setProperty('--hover-background', lampGradient(settings.color));
    title.textContent = settings.title; story.textContent = settings.story;
    title.hidden = !settings.title; story.hidden = !settings.story;
    panel.hidden = !!settings.color || !(settings.title || settings.story);
  }
}
function animate(now) {
  if (!isOn) return;
  const seconds = previousTime === null ? 0 : Math.min((now-previousTime)/1000,.05);
  previousTime = now; elapsed += seconds;
  updateHover(now);
  if (!reducedMotion.matches) {
    // 每盏灯独立移动；只有鼠标悬停的灯暂停。
    lamps.forEach(lamp => {
      if (!lamp.active || (lamp === focused && now-hoverStarted >= 200)) return;
      lamp.progress += seconds / lamp.settings.duration;
      if (lamp.progress >= 1) { lamp.active = false; lamp.progress = 0; queue.push(lamp); }
    });
    renderLamps();
    // 两侧独立补位：接近离开画面的灯不占用补位名额。
    for (const left of [true, false]) {
      const sideLamps = lamps.filter(l => l.active && (l.settings.x < 50) === left);
      const present = sideLamps.filter(l => {
        const r = l.image.getBoundingClientRect();
        return r.bottom > Math.min(r.height * .45, scene.clientHeight * .15);
      });
      if (present.length >= 3) continue;
      const candidates = queue.filter(l => (l.settings.x < 50) === left);
      const colorCount = present.filter(l => l.settings.color).length;
      const preferColor = colorCount === 0 || (colorCount < present.length / 2 && !lastEntered[left]);
      const incoming = candidates.find(l => !!l.settings.color === preferColor) || candidates[0];
      if (!incoming) continue;
      const rect = incoming.image.getBoundingClientRect();
      const room = sideLamps.every(other => {
        const r = other.image.getBoundingClientRect();
        return rect.left >= r.right + GAP || rect.right + GAP <= r.left || r.bottom + GAP < scene.clientHeight + 15;
      });
      if (room) {
        queue.splice(queue.indexOf(incoming),1);
        incoming.active = true; incoming.progress = 0;
        lastEntered[left] = !!incoming.settings.color;
      }
    }
  }
  renderLamps(); frameId = requestAnimationFrame(animate);
}
function setPower(on) {
  if (on) closeInfo(false);
  isOn = on; clearFocus();
  scene.classList.toggle('is-on', on);
  lightSwitch.setAttribute('aria-checked', String(on));
  lightSwitch.setAttribute('aria-label', on ? '关闭灯' : '打开灯');
  switchImage.src = `images/switch-${on ? 'on' : 'off'}.png`;
  status.textContent = on ? '灯已打开' : '灯已关闭';
  if (frameId !== null) cancelAnimationFrame(frameId);
  previousTime = null; frameId = null;
  renderLamps(); if (on) frameId = requestAnimationFrame(animate);
}
scene.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  pointer = { x: event.clientX, y: event.clientY };
});
scene.addEventListener('pointerleave', () => { pointer = null; clearFocus(); });
window.addEventListener('blur', () => { pointer = null; clearFocus(); });
// 用户点击时合成短促机械开关声，无需额外音频文件。
let switchAudio = null;
function playSwitchClick(on) {
  try {
    const AudioEngine = window.AudioContext || window.webkitAudioContext;
    if (!AudioEngine) return;
    switchAudio ||= new AudioEngine();
    const ctx = switchAudio;
    const sound = () => {
      const start = ctx.currentTime;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * .045), ctx.sampleRate);
      const samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * .006));
      const noise = ctx.createBufferSource(); noise.buffer = buffer;
      const filter = ctx.createBiquadFilter(); filter.type = 'highpass'; filter.frequency.value = 900;
      const gain = ctx.createGain(); gain.gain.value = .22;
      noise.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
      noise.start(start);
      const tone = ctx.createOscillator(); tone.type = 'triangle';
      tone.frequency.setValueAtTime(on ? 1250 : 950, start);
      tone.frequency.exponentialRampToValueAtTime(280, start + .025);
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(.075, start);
      envelope.gain.exponentialRampToValueAtTime(.001, start + .035);
      tone.connect(envelope); envelope.connect(ctx.destination);
      tone.start(start); tone.stop(start + .04);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
      tone.onended = () => { tone.disconnect(); envelope.disconnect(); };
    };
    if (ctx.state === 'suspended') ctx.resume().then(sound).catch(() => {});
    else if (ctx.state === 'running') sound();
  } catch (_) { /* 音频不可用时，开关继续正常工作。 */ }
}
lightSwitch.addEventListener('click', () => { playSwitchClick(!isOn); setPower(!isOn); });
window.addEventListener('resize', renderLamps);
reducedMotion.addEventListener('change', renderLamps);
lamps.forEach(lamp => lamp.image.addEventListener('load', renderLamps));
renderLamps();

const infoButton = document.querySelector('#info-button');
const infoOverlay = document.querySelector('#info-overlay');
const infoPanel = document.querySelector('#info-panel');
function closeInfo(restoreFocus = true) {
  infoOverlay.hidden = true;
  infoButton.setAttribute('aria-expanded', 'false');
  lightSwitch.inert = false;
  if (restoreFocus) infoButton.focus();
}
infoButton.addEventListener('click', () => {
  if (isOn) return;
  infoOverlay.hidden = false;
  infoButton.setAttribute('aria-expanded', 'true');
  lightSwitch.inert = true;
  infoPanel.focus();
});
infoOverlay.addEventListener('click', event => {
  if (event.target === infoOverlay) closeInfo();
});
infoOverlay.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeInfo();
  if (event.key === 'Tab') { event.preventDefault(); infoPanel.focus(); }
});