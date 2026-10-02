// アプリのUI制御・タイマー処理

let audioCtx = null;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// iOS/Android向け:最初のタッチ/クリックでAudioContextを解放しておく
function unlockAudio() {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") {
    ctx.resume();
  }
  // 無音バッファを再生してiOSのオーディオロックを解除
  const buf = ctx.createBuffer(1, 1, ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}
document.addEventListener("touchstart", unlockAudio, { once: true });
document.addEventListener("click", unlockAudio, { once: true });

function playSound(fn) {
  const ctx = getAudioCtx();
  if (ctx.state === "running") {
    fn(ctx);
  } else {
    ctx.resume().then(() => fn(ctx));
  }
}

function beep(freq = 880, duration = 0.2) {
  playSound(ctx => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.4, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.01);
  });
}

// リアルなボクシングベル音
// 実際のベルは基音に非整数倍音が重なる。ボクシングベルは約500Hz基音+金属的高倍音
function gong() {
  playSound(ctx => {
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.9, now);
    master.connect(ctx.destination);

    // 金属打音(ノイズバースト):ベルを叩いた瞬間の「カン」という衝撃音
    const noiseLen = Math.floor(ctx.sampleRate * 0.08);
    const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) nd[i] = (Math.random() * 2 - 1);
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    noiseSrc.connect(noiseGain);
    noiseGain.connect(master);
    noiseSrc.start(now);

    const partials = [
      { freq: 500,  vol: 1.0,  decay: 4.0 },
      { freq: 1155, vol: 0.6,  decay: 3.2 },
      { freq: 1862, vol: 0.4,  decay: 2.5 },
      { freq: 2700, vol: 0.25, decay: 1.8 },
      { freq: 3520, vol: 0.15, decay: 1.2 },
      { freq: 4800, vol: 0.08, decay: 0.7 },
    ];

    partials.forEach(({ freq, vol, decay }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(master);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      osc.start(now);
      osc.stop(now + decay + 0.05);
    });
  });
}

// HIITの短い開始音(ゴングだと20秒サイクルには長すぎるため)
function hiitStartTone() {
  beep(1046, 0.25);
}

// 音声アナウンス:スマホ対応(voices非同期ロード考慮)
function announce(text, onEnd) {
  if (!window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }
  window.speechSynthesis.cancel();

  const speak = () => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = "ja-JP";
    utter.rate = 0.85;
    utter.pitch = 1.05;
    utter.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang.startsWith("ja") && !v.name.includes("Google"))
                   || voices.find(v => v.lang.startsWith("ja"));
    if (jaVoice) utter.voice = jaVoice;
    if (onEnd) {
      utter.onend = onEnd;
      utter.onerror = onEnd;
    }
    window.speechSynthesis.speak(utter);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    speak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      speak();
    };
    setTimeout(speak, 500);
  }
}

// 読み上げ用に記号だけ整えて自然な文にする
function toSpeechText(str) {
  return str
    .replace(/※.*/g, "")
    .replace(/[（(]/g, "、")
    .replace(/[）)]/g, "。")
    .replace(/[:：]/g, "、")
    .replace(/[①②③④⑤]/g, "")
    .replace(/[→]/g, "から")
    .replace(/\s+/g, " ")
    .trim();
}

let currentMenu = null;

function rowIdFor(item) {
  return `${item.kind}-row-${item.round}`;
}

function buildSection(title, items, className) {
  const wrap = document.createElement("div");
  wrap.className = "menu-section";

  const h = document.createElement("h3");
  h.className = "menu-section-title";
  h.textContent = title;
  wrap.appendChild(h);

  const table = document.createElement("table");
  table.className = `menu-table ${className}`;
  table.innerHTML = `
    <thead>
      <tr><th>#</th><th>内容</th><th>時間</th></tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");
  items.forEach(item => {
    const tr = document.createElement("tr");
    tr.id = rowIdFor(item);
    tr.innerHTML = `
      <td>${item.round}</td>
      <td>${item.content}</td>
      <td>${item.duration}</td>
    `;
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  const tableWrap = document.createElement("div");
  tableWrap.className = "menu-table-wrap";
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);
  return wrap;
}

function renderMenu(menu, level, style) {
  const container = document.getElementById("menuResult");
  container.innerHTML = "";

  const heading = document.createElement("h2");
  heading.textContent = level.startsWith("beginner")
    ? `${LEVEL_LABELS[level]} のメニュー`
    : `${LEVEL_LABELS[level]} × ${STYLE_LABELS[style]} のメニュー`;
  container.appendChild(heading);

  const focus = document.createElement("p");
  focus.className = "level-focus";
  focus.textContent = `今日の課題: ${menu.timing.focus}｜シャドー ${formatDuration(menu.timing.shadow)} / 休 ${formatDuration(menu.timing.shadowRest)}｜筋トレ ${formatDuration(menu.timing.hiit)} / 休 ${formatDuration(menu.timing.hiitRest)}`;
  container.appendChild(focus);

  container.appendChild(buildSection("🥊 シャドーボクシング 5R", menu.rounds, "shadow-table"));
  container.appendChild(buildSection(`💪 筋トレ (${formatDuration(menu.timing.hiit)} / 休${formatDuration(menu.timing.hiitRest)} × 8種目)`, menu.hiit, "hiit-table"));

  // 開始位置の選択肢を再構築
  const startRoundSelect = document.getElementById("startRoundSelect");
  startRoundSelect.innerHTML = "";
  menu.rounds.forEach((r, i) => {
    const opt = document.createElement("option");
    opt.value = `shadow:${i}`;
    opt.textContent = `シャドー 第${r.round}R`;
    startRoundSelect.appendChild(opt);
  });
  menu.hiit.forEach((h, i) => {
    const opt = document.createElement("option");
    opt.value = `hiit:${i}`;
    opt.textContent = `筋トレ ${h.round}種目目`;
    startRoundSelect.appendChild(opt);
  });

  // 今日のテクニック
  if (typeof getDailyTip === "function") {
    const tip = getDailyTip();
    const tipCard = document.createElement("div");
    tipCard.className = "tip-card";
    tipCard.innerHTML = `
      <div class="tip-header">💡 今日のテクニック</div>
      <div class="tip-category">${tip.category}</div>
      <div class="tip-text">${tip.text}</div>
    `;
    container.appendChild(tipCard);
  }

  // コーチ新座宏のYouTube参照
  const ytCard = document.createElement("div");
  ytCard.className = "coach-video-card";
  ytCard.innerHTML = `
    <div class="coach-video-text">🎥 詳しい打ち方は新座宏コーチのYouTubeで解説中</div>
    <a class="coach-video-link" href="https://www.youtube.com/@%E6%96%B0%E5%BA%A7%E5%AE%8F" target="_blank" rel="noopener">YouTubeで見る →</a>
  `;
  container.appendChild(ytCard);

  // 技術ライブラリ（索引）
  if (typeof getTipsByGroup === "function") {
    const lib = document.createElement("div");
    lib.className = "tech-library";
    lib.innerHTML = '<div class="tech-library-title">📖 技術ライブラリ</div>';
    getTipsByGroup().forEach(g => {
      const section = document.createElement("div");
      section.className = "tech-group";
      const btn = document.createElement("button");
      btn.className = "tech-group-btn";
      btn.textContent = g.group;
      btn.setAttribute("aria-expanded", "false");
      const content = document.createElement("div");
      content.className = "tech-group-content";
      content.hidden = true;
      g.tips.forEach(t => {
        const item = document.createElement("div");
        item.className = "tech-tip-item";
        item.innerHTML = `<span class="tech-tip-cat">${t.category}</span><p class="tech-tip-text">${t.text}</p>`;
        content.appendChild(item);
      });
      btn.addEventListener("click", () => {
        const open = !content.hidden;
        content.hidden = open;
        btn.setAttribute("aria-expanded", String(!open));
        btn.classList.toggle("open", !open);
      });
      section.appendChild(btn);
      section.appendChild(content);
      lib.appendChild(section);
    });
    container.appendChild(lib);
  }

  document.getElementById("timerSection").style.display = "block";
  document.getElementById("startTimerBtn").disabled = false;
}

// 前回選んだレベル・スタイルを復元
(function restoreSelections() {
  try {
    const level = localStorage.getItem("shadow.level");
    const style = localStorage.getItem("shadow.style");
    if (level && document.querySelector(`#levelSelect option[value="${level}"]`)) {
      document.getElementById("levelSelect").value = level;
    }
    if (style && document.querySelector(`#styleSelect option[value="${style}"]`)) {
      document.getElementById("styleSelect").value = style;
    }
  } catch (e) { /* プライベートモード等でlocalStorage不可なら黙って無視 */ }
})();

function updateStyleAvailability() {
  document.getElementById("styleSelect").disabled =
    document.getElementById("levelSelect").value.startsWith("beginner");
}
document.getElementById("levelSelect").addEventListener("change", updateStyleAvailability);
updateStyleAvailability();

document.getElementById("generateBtn").addEventListener("click", () => {
  const level = document.getElementById("levelSelect").value;
  const style = document.getElementById("styleSelect").value;
  try {
    localStorage.setItem("shadow.level", level);
    localStorage.setItem("shadow.style", style);
  } catch (e) { /* 保存できなくても動作に支障なし */ }
  currentMenu = generateMenu(level, style);
  renderMenu(currentMenu, level, style);
  resetTimerState();
});

// ===== タイマー =====
let timerSteps = null; // 平坦化したステップ配列
let stepIndex = 0;
let remaining = 0;
let stepEndAt = 0;     // 現ステップの終了時刻(実時刻基準でズレを防ぐ)
let timerInterval = null;

// ===== 画面スリープ防止(Wake Lock) =====
let wakeLock = null;

async function acquireWakeLock() {
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) {
    // 省電力モード等で拒否されることがある。タイマー自体は動くので無視
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && timerInterval) {
    acquireWakeLock();
  }
});

/**
 * メニューからタイマーのステップ列を組み立てる。
 * レベル別のシャドー5R → 筋トレ8種目
 */
function buildSteps(menu) {
  const steps = [];
  const timing = menu.timing;

  menu.rounds.forEach((r, i) => {
    steps.push({ type: "shadow", item: r, duration: timing.shadow });
    // 最終ラウンド後も筋トレへ移る前に休憩する
    steps.push({ type: "rest", restFor: "shadow", duration: timing.shadowRest });
  });

  menu.hiit.forEach((h, i) => {
    steps.push({ type: "hiit", item: h, duration: timing.hiit });
    if (i < menu.hiit.length - 1) {
      steps.push({ type: "rest", restFor: "hiit", duration: timing.hiitRest });
    }
  });

  return steps;
}

function resetTimerState() {
  clearInterval(timerInterval);
  timerInterval = null;
  releaseWakeLock();
  timerSteps = null;
  stepIndex = 0;
  remaining = 0;
  setProgress(0);
  document.getElementById("timerDisplay").textContent = "--:--";
  document.getElementById("timerDisplay").classList.remove("countdown-warning", "hiit-mode");
  document.getElementById("timerLabel").textContent = "準備中";
  document.getElementById("startTimerBtn").textContent = "開始";
  document.getElementById("startTimerBtn").disabled = !currentMenu;
  document.getElementById("startRoundSelect").disabled = false;
  document.querySelectorAll(".menu-table tbody tr").forEach(tr => tr.classList.remove("active-round"));
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// 現ステップ開始時のゴング/音+アナウンス
function announceStep(step, delayMs) {
  if (step.type === "shadow") {
    gong();
    const content = toSpeechText(step.item.content);
    setTimeout(() => announce(`${step.item.round}ラウンド。シャドーボクシング。${content}`), delayMs);
  } else if (step.type === "hiit") {
    hiitStartTone();
    const content = toSpeechText(step.item.content);
    setTimeout(() => announce(`${step.item.round}種目目。${content}`), 300);
  }
}

function startTimer() {
  if (!currentMenu) return;

  // iOSはユーザー操作内でspeechSynthesisを一度呼ばないと以降が動かない
  if (window.speechSynthesis) {
    const unlock = new SpeechSynthesisUtterance(" ");
    unlock.volume = 0;
    window.speechSynthesis.speak(unlock);
  }

  if (timerInterval) {
    // 一時停止:残り秒数を確定させて保持
    remaining = Math.max(0, Math.ceil((stepEndAt - Date.now()) / 1000));
    clearInterval(timerInterval);
    timerInterval = null;
    releaseWakeLock();
    document.getElementById("startTimerBtn").textContent = "再開";
    return;
  }

  if (!timerSteps) {
    timerSteps = buildSteps(currentMenu);

    const [kind, idxStr] = (document.getElementById("startRoundSelect").value || "shadow:0").split(":");
    const startItem = kind === "hiit"
      ? currentMenu.hiit[Number(idxStr)]
      : currentMenu.rounds[Number(idxStr)];
    const foundIndex = timerSteps.findIndex(s => s.item === startItem);
    stepIndex = foundIndex >= 0 ? foundIndex : 0;
    document.getElementById("startRoundSelect").disabled = true;

    remaining = timerSteps[stepIndex].duration;
    announceStep(timerSteps[stepIndex], 1500);
    updateTimerDisplay();
  }

  document.getElementById("startTimerBtn").textContent = "一時停止";
  // 実時刻基準の締切を設定(setIntervalの累積ズレを防ぐ)
  stepEndAt = Date.now() + remaining * 1000;
  timerInterval = setInterval(tick, 250);
  acquireWakeLock();
}

function tick() {
  const newRemaining = Math.ceil((stepEndAt - Date.now()) / 1000);
  if (newRemaining === remaining) return; // 秒が変わった時だけ処理
  remaining = newRemaining;

  if (remaining <= 0) {
    advanceStep();
    return;
  }

  // 残り3秒はカウントダウンビープ
  if (remaining <= 3) {
    beep(880, 0.15);
  }

  updateTimerDisplay();
}

// 次のシャドー/HIITステップを先読みしてアナウンス文を作る
function buildNextAnnounce(nextIndex) {
  for (let i = nextIndex; i < timerSteps.length; i++) {
    const s = timerSteps[i];
    if (s.type === "shadow") {
      return `${s.item.round}ラウンド。シャドーボクシング。${toSpeechText(s.item.content)}`;
    }
    if (s.type === "hiit") {
      return `${s.item.round}種目目。${toSpeechText(s.item.content)}`;
    }
  }
  return null;
}

function advanceStep() {
  if (stepIndex < timerSteps.length - 1) {
    stepIndex += 1;
    remaining = timerSteps[stepIndex].duration;
    stepEndAt = Date.now() + remaining * 1000;
    const curStep = timerSteps[stepIndex];

    if (curStep.type === "rest") {
      if (curStep.restFor === "hiit") {
        // 短い休憩なので次種目名を手短に予告
        beep(660, 0.15);
        const next = timerSteps[stepIndex + 1];
        if (next && next.type === "hiit") {
          setTimeout(() => announce(`休憩。次、${toSpeechText(next.item.content)}`), 200);
        }
      } else {
        gong();
        const msg = buildNextAnnounce(stepIndex + 1);
        if (msg) {
          setTimeout(() => announce(`インターバル。次は、${msg}`), 1500);
        }
      }
    } else {
      announceStep(curStep, 1000);
    }

    updateTimerDisplay();
  } else {
    // 全終了
    gong();
    clearInterval(timerInterval);
    timerInterval = null;
    releaseWakeLock();
    document.getElementById("timerLabel").textContent = "トレーニング終了！お疲れ様でした 🥊";
    document.getElementById("timerDisplay").textContent = "00:00";
    document.getElementById("timerDisplay").classList.remove("countdown-warning", "hiit-mode");
    document.getElementById("startTimerBtn").disabled = true;
    document.getElementById("startRoundSelect").disabled = false;
    setProgress(1);
    document.querySelectorAll(".menu-table tbody tr").forEach(tr => tr.classList.remove("active-round"));
  }
}

// 全体進捗バー(0〜1)を更新する
function setProgress(ratio) {
  const bar = document.getElementById("progressBar");
  const label = document.getElementById("progressLabel");
  if (!bar) return;
  bar.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  if (label) {
    if (timerSteps && ratio > 0 && ratio < 1) {
      const workSteps = timerSteps.filter(s => s.type !== "rest");
      const done = timerSteps.slice(0, stepIndex + 1).filter(s => s.type !== "rest").length;
      label.textContent = `進捗 ${done}/${workSteps.length}`;
    } else if (ratio >= 1) {
      label.textContent = "完了！";
    } else {
      label.textContent = "";
    }
  }
}

function updateTimerDisplay() {
  const step = timerSteps[stepIndex];
  const display = document.getElementById("timerDisplay");
  display.textContent = formatTime(remaining);
  display.classList.toggle("countdown-warning", remaining > 0 && remaining <= 3);
  display.classList.toggle("hiit-mode", step.type === "hiit");

  const stepFraction = step.duration > 0 ? 1 - remaining / step.duration : 0;
  setProgress((stepIndex + stepFraction) / timerSteps.length);

  document.querySelectorAll(".menu-table tbody tr").forEach(tr => tr.classList.remove("active-round"));

  if (step.type === "shadow") {
    document.getElementById("timerLabel").textContent = `第${step.item.round}ラウンド: シャドーボクシング`;
    document.getElementById(rowIdFor(step.item))?.classList.add("active-round");
  } else if (step.type === "hiit") {
    document.getElementById("timerLabel").textContent = `💪 筋トレ ${step.item.round}/8: ${step.item.content.split(":")[0]}`;
    document.getElementById(rowIdFor(step.item))?.classList.add("active-round");
  } else if (step.type === "rest") {
    document.getElementById("timerLabel").textContent = `休憩(${formatDuration(step.duration)})`;
  }
}

document.getElementById("startTimerBtn").addEventListener("click", startTimer);
document.getElementById("resetTimerBtn").addEventListener("click", () => {
  if (!currentMenu) return;
  resetTimerState();
});
