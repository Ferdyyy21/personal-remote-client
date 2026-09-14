const connectScreen = document.getElementById('connectScreen');
const remoteScreen = document.getElementById('remoteScreen');
const codeInput = document.getElementById('codeInput');
const connectBtn = document.getElementById('connectBtn');
const connectStatus = document.getElementById('connectStatus');
const video = document.getElementById('remoteVideo');
const touchSurface = document.getElementById('touchSurface');
const modePointerBtn = document.getElementById('modePointerBtn');
const modeTouchBtn = document.getElementById('modeTouchBtn');
const modeJoystickBtn = document.getElementById('modeJoystickBtn');
const leftJoystickEl = document.getElementById('leftJoystick');
const rightJoystickEl = document.getElementById('rightJoystick');
const keyboardBtn = document.getElementById('keyboardBtn');
const disconnectBtn = document.getElementById('disconnectBtn');
const leftClickBtn = document.getElementById('leftClickBtn');
const rightClickBtn = document.getElementById('rightClickBtn');
const hiddenInput = document.getElementById('hiddenInput');
const videoStatus = document.getElementById('videoStatus');

// STUN handles most home NATs. The turn: entries are a free public relay
// (Metered's Open Relay Project) used only as a fallback when a direct
// connection can't be established (e.g. some cellular/carrier NATs) —
// traffic through it stays DTLS/SRTP-encrypted end-to-end.
const ICE_SERVERS = [
  { urls: 'stun:stun.relay.metered.ca:80' },
  { urls: 'turn:global.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:global.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

let peer = null;
let conn = null;
let mode = 'pointer';
const POINTER_SENSITIVITY = 1.6;

const params = new URLSearchParams(location.search);
if (params.get('code')) codeInput.value = params.get('code');

function setConnectStatus(text, isError) {
  connectStatus.textContent = text || '';
  connectStatus.style.color = isError ? '#f07178' : '#7fd88f';
  videoStatus.hidden = false;
  videoStatus.textContent = text || '';
}

function showRemote() {
  connectScreen.hidden = true;
  remoteScreen.hidden = false;
}

function showConnect() {
  remoteScreen.hidden = true;
  connectScreen.hidden = false;
  video.srcObject = null;
}

function send(obj) {
  if (conn && conn.open) conn.send(obj);
}

function connect(code) {
  setConnectStatus('Connecting…');
  peer = new Peer({ debug: 1, config: { iceServers: ICE_SERVERS } });

  peer.on('open', (id) => {
    setConnectStatus('Signaling connected (' + id + '). Reaching PC…');
    conn = peer.connect(code, { reliable: true });

    conn.on('open', () => {
      setConnectStatus('Connected. Waiting for screen…');
    });

    conn.on('data', (data) => {
      if (data.type === 'info') {
        video.dataset.remoteWidth = data.width;
        video.dataset.remoteHeight = data.height;
      }
    });

    conn.on('close', () => {
      showConnect();
      setConnectStatus('Disconnected from PC.', true);
    });

    conn.on('error', (err) => {
      setConnectStatus('Connection error: ' + err, true);
    });

    // Report live WebRTC negotiation state so a stuck connection is visible
    // instead of silently hanging on "Connecting…".
    setTimeout(() => {
      const pc = conn.peerConnection;
      if (!pc) {
        setConnectStatus('No peerConnection formed for data channel', true);
        return;
      }
      const report = () => {
        if (conn.open) return;
        setConnectStatus('Reaching PC — ice:' + pc.iceConnectionState + ' conn:' + pc.connectionState + ' gathering:' + pc.iceGatheringState);
      };
      report();
      pc.addEventListener('iceconnectionstatechange', report);
      pc.addEventListener('connectionstatechange', report);
      pc.addEventListener('icegatheringstatechange', report);
    }, 300);
  });

  let videoAttached = false;
  function attachVideo(stream) {
    if (videoAttached) return;
    videoAttached = true;
    video.srcObject = stream;
    showRemote();
    videoStatus.hidden = false;
    videoStatus.textContent = 'Video attached, playing…';
    video.play().then(() => {
      videoStatus.textContent = 'Playing';
    }).catch((err) => {
      videoStatus.textContent = 'Tap here to start video (' + err.name + ')';
    });
  }

  peer.on('call', (call) => {
    videoAttached = false;
    try {
      call.answer();
    } catch (err) {
      setConnectStatus('Could not answer call: ' + err.message, true);
      return;
    }

    // PeerJS's own 'stream' event, when it fires.
    call.on('stream', (stream) => attachVideo(stream));
    call.on('error', (err) => setConnectStatus('Call error: ' + err, true));

    // Fallback: listen to the underlying WebRTC connection directly, in case
    // PeerJS's own 'stream' event doesn't fire even though media is flowing.
    const pc = call.peerConnection;
    if (pc) {
      pc.addEventListener('track', (e) => {
        const stream = e.streams[0] || new MediaStream([e.track]);
        attachVideo(stream);
      });
    }
  });

  peer.on('error', (err) => {
    setConnectStatus('Could not connect: ' + err.type, true);
  });
}

connectBtn.addEventListener('click', () => {
  const code = codeInput.value.trim();
  if (code.length !== 9) {
    setConnectStatus('Enter the 9-digit password from your PC', true);
    return;
  }
  connect(code);
});

video.addEventListener('playing', () => {
  videoStatus.hidden = true;
});

videoStatus.addEventListener('click', () => {
  video.play().then(() => {
    videoStatus.hidden = true;
  }).catch((err) => {
    videoStatus.textContent = 'Still blocked (' + err.name + ') — tap again';
  });
});

disconnectBtn.addEventListener('click', () => {
  if (conn) conn.close();
  if (peer) peer.destroy();
  showConnect();
  setConnectStatus('');
});

// ---- Explicit click buttons: click at wherever the remote cursor currently is ----
leftClickBtn.addEventListener('click', () => send({ type: 'click' }));
rightClickBtn.addEventListener('click', () => send({ type: 'rightClick' }));

// ---- Mode toggle ----
function setMode(newMode) {
  mode = newMode;
  modePointerBtn.classList.toggle('active', mode === 'pointer');
  modeTouchBtn.classList.toggle('active', mode === 'touch');
  modeJoystickBtn.classList.toggle('active', mode === 'joystick');
  leftJoystickEl.hidden = mode !== 'joystick';
  rightJoystickEl.hidden = mode !== 'joystick';
  if (mode !== 'joystick') {
    leftJoystick.reset();
    rightJoystick.reset();
  }
}
modePointerBtn.addEventListener('click', () => setMode('pointer'));
modeTouchBtn.addEventListener('click', () => setMode('touch'));
modeJoystickBtn.addEventListener('click', () => setMode('joystick'));

// ---- Keyboard toggle ----
keyboardBtn.addEventListener('click', () => {
  if (document.activeElement === hiddenInput) {
    hiddenInput.blur();
    keyboardBtn.classList.remove('active');
  } else {
    hiddenInput.value = '';
    hiddenInput.focus();
    keyboardBtn.classList.add('active');
  }
});
hiddenInput.addEventListener('blur', () => keyboardBtn.classList.remove('active'));

const SPECIAL_KEYS = new Set([
  'Backspace', 'Enter', 'Tab', 'Escape', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
]);

hiddenInput.addEventListener('keydown', (e) => {
  if (SPECIAL_KEYS.has(e.key)) {
    e.preventDefault();
    send({ type: 'key', key: e.key, action: 'press' });
  }
});

hiddenInput.addEventListener('input', (e) => {
  const text = e.data != null ? e.data : hiddenInput.value;
  if (text) send({ type: 'text', text });
  hiddenInput.value = '';
});

// ---- Touch surface: content-rect mapping for "Touch" mode ----
function getContentRect() {
  const rect = video.getBoundingClientRect();
  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const elRatio = rect.width / rect.height;
  const vRatio = vw / vh;
  let cw, ch, cx, cy;
  if (vRatio > elRatio) {
    cw = rect.width;
    ch = rect.width / vRatio;
    cx = rect.left;
    cy = rect.top + (rect.height - ch) / 2;
  } else {
    ch = rect.height;
    cw = rect.height * vRatio;
    cy = rect.top;
    cx = rect.left + (rect.width - cw) / 2;
  }
  return { cx, cy, cw, ch };
}

function toNormalized(clientX, clientY) {
  const { cx, cy, cw, ch } = getContentRect();
  const x = Math.min(Math.max((clientX - cx) / cw, 0), 1);
  const y = Math.min(Math.max((clientY - cy) / ch, 0), 1);
  return { x, y };
}

let touchActive = false;
let maxFingerCount = 0;
let anyMove = false;
let lastX = 0;
let lastY = 0;

touchSurface.addEventListener('touchstart', (e) => {
  e.preventDefault();
  maxFingerCount = Math.max(maxFingerCount, e.touches.length);
  const t = e.touches[0];
  lastX = t.clientX;
  lastY = t.clientY;

  if (mode === 'touch') {
    if (e.touches.length === 1 && !touchActive) {
      const { x, y } = toNormalized(t.clientX, t.clientY);
      send({ type: 'moveTo', x, y });
      send({ type: 'mousedown', button: 'left' });
      touchActive = true;
    }
  }
}, { passive: false });

touchSurface.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  const dx = t.clientX - lastX;
  const dy = t.clientY - lastY;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) anyMove = true;

  if (mode === 'touch') {
    if (touchActive) {
      const { x, y } = toNormalized(t.clientX, t.clientY);
      send({ type: 'moveTo', x, y });
    }
  } else if (mode === 'pointer') {
    if (e.touches.length === 2) {
      send({ type: 'scroll', dx: 0, dy: -dy * 1.2 });
    } else {
      send({ type: 'move', dx: dx * POINTER_SENSITIVITY, dy: dy * POINTER_SENSITIVITY });
    }
  }
  // joystick mode: the main surface doesn't move the cursor, only the pads do
  lastX = t.clientX;
  lastY = t.clientY;
}, { passive: false });

touchSurface.addEventListener('touchend', (e) => {
  e.preventDefault();

  if (mode === 'touch') {
    if (touchActive) {
      send({ type: 'mouseup', button: 'left' });
      touchActive = false;
    } else if (e.touches.length === 0 && !anyMove && maxFingerCount === 2) {
      // two-finger tap, no drag was ever started
      const { x, y } = toNormalized(lastX, lastY);
      send({ type: 'rightTap', x, y });
    }
  } else if (e.touches.length === 0) {
    // wait for every finger to lift before deciding tap vs. drag,
    // so a two-finger tap doesn't fire twice as each finger lifts
    if (!anyMove) {
      if (maxFingerCount === 2) send({ type: 'rightClick' });
      else send({ type: 'click' });
    }
  }

  if (e.touches.length === 0) {
    maxFingerCount = 0;
    anyMove = false;
  }
}, { passive: false });

// A rotation, an incoming call/notification, or the OS taking over the
// gesture can all fire touchcancel instead of touchend mid-touch. Without
// resetting here, touchActive/maxFingerCount get stuck and every touch
// after that is silently ignored.
touchSurface.addEventListener('touchcancel', (e) => {
  if (touchActive) {
    send({ type: 'mouseup', button: 'left' });
  }
  touchActive = false;
  maxFingerCount = 0;
  anyMove = false;
}, { passive: false });

// ---- Joystick mode: analog stick, held deflection = continuous cursor movement ----
const JOYSTICK_MAX_SPEED = 22; // cursor pixels per tick at full deflection
const JOYSTICK_TICK_MS = 30;
const JOYSTICK_DEADZONE = 0.15;

function createJoystick(baseEl) {
  const knobEl = baseEl.querySelector('.joystick-knob');
  let touchId = null;
  let centerX = 0;
  let centerY = 0;
  let maxRadius = 1;
  let normX = 0;
  let normY = 0;
  let intervalId = null;

  function tick() {
    const mag = Math.hypot(normX, normY);
    if (mag < JOYSTICK_DEADZONE) return;
    send({ type: 'move', dx: normX * JOYSTICK_MAX_SPEED, dy: normY * JOYSTICK_MAX_SPEED });
  }

  function updateFromTouch(touch) {
    const offsetX = touch.clientX - centerX;
    const offsetY = touch.clientY - centerY;
    const dist = Math.min(Math.hypot(offsetX, offsetY), maxRadius);
    const angle = Math.atan2(offsetY, offsetX);
    const knobX = Math.cos(angle) * dist;
    const knobY = Math.sin(angle) * dist;
    knobEl.style.transform = `translate(${knobX}px, ${knobY}px)`;
    normX = knobX / maxRadius;
    normY = knobY / maxRadius;
  }

  function reset() {
    touchId = null;
    normX = 0;
    normY = 0;
    knobEl.style.transform = 'translate(0, 0)';
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function findTouch(touchList) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === touchId) return touchList[i];
    }
    return null;
  }

  baseEl.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (touchId !== null) return; // already tracking a finger
    const touch = e.changedTouches[0];
    touchId = touch.identifier;
    const rect = baseEl.getBoundingClientRect();
    centerX = rect.left + rect.width / 2;
    centerY = rect.top + rect.height / 2;
    maxRadius = rect.width / 2;
    updateFromTouch(touch);
    if (!intervalId) intervalId = setInterval(tick, JOYSTICK_TICK_MS);
  }, { passive: false });

  baseEl.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = findTouch(e.changedTouches);
    if (touch) updateFromTouch(touch);
  }, { passive: false });

  const endHandler = (e) => {
    if (findTouch(e.changedTouches)) reset();
  };
  baseEl.addEventListener('touchend', endHandler, { passive: false });
  baseEl.addEventListener('touchcancel', endHandler, { passive: false });

  return { reset };
}

const leftJoystick = createJoystick(leftJoystickEl);
const rightJoystick = createJoystick(rightJoystickEl);
