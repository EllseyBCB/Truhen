/*
 * Truhenöffnungs-Animation im Stil von Clash Royale & Co.
 *
 * Truhen-Modell: von Hand nach dem Referenzbild des Users modelliert
 * (src/chest-model.js) — Planken, Bronze-Rahmen, Nieten, Ringgriffe,
 * Schlossschild mit Krone und Goldschatz mit Sternmünzen.
 *
 * Vier Truhen-Stufen (nach den Referenzbildern des Users), umgesetzt durch
 * Umfärben der benannten Modell-Materialien (Wood, DarkMetal, Gold, ...):
 *   Holztruhe → Runentruhe → Kristalltruhe → Goldtruhe
 *
 * Ablauf (State-Machine):
 *   idle    → Truhe wippt leicht, wartet auf Taps
 *   tap ×3  → Wackeln mit Squash & Stretch (Anticipation)
 *   opening → Deckel springt mit Overshoot auf, Lichtsäule, Flash,
 *             Funken- und Münzen-Burst, Kamera-Punch
 *   opened  → Belohnungs-Kristall schwebt vor rotierenden Lichtstrahlen
 *   closing → kurzer Reset, danach wartet die nächste (zufällige) Truhe
 */
(function () {
  'use strict';

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Renderer / Szene / Kamera ----------
  var container = document.getElementById('scene');
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0e1626, 19, 42);

  // Environment-Map für realistische Metall-Reflexionen
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

  var camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 60);
  var CAM_BASE = new THREE.Vector3(0, 2.7, 6.9);
  var LOOK_AT = new THREE.Vector3(0, 1.05, 0);

  // Kameradistanz so wählen, dass die Truhe auch im Hochformat
  // (Handy) komplett mit Rand ins Bild passt.
  function fitCamera() {
    var aspect = window.innerWidth / window.innerHeight;
    var halfWidthNeeded = 2.25; // halbe Truhenbreite + Platz für Effekte
    var tanHalfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect;
    CAM_BASE.z = Math.max(6.9, halfWidthNeeded / tanHalfH);
    CAM_BASE.y = 2.7 + (CAM_BASE.z - 6.9) * 0.12;
  }
  fitCamera();
  camera.position.copy(CAM_BASE);

  // ---------- Licht ----------
  scene.add(new THREE.HemisphereLight(0xbdd4ff, 0x2a1c10, 0.45));
  var key = new THREE.DirectionalLight(0xfff2dd, 1.1);
  key.position.set(4, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -2;
  key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.bias = -0.002;
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x6fa0ff, 0.55);
  rim.position.set(-5, 4, -6);
  scene.add(rim);
  var innerLight = new THREE.PointLight(0xffc24d, 0, 7, 2);
  innerLight.position.set(0, 1.1, 0);
  scene.add(innerLight);

  // ---------- Canvas-Texturen (nur noch für Boden & Effekte) ----------
  function makeCanvas(size, draw) {
    var c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    var tx = new THREE.CanvasTexture(c);
    tx.encoding = THREE.sRGBEncoding;
    return tx;
  }

  var groundTex = makeCanvas(512, function (g, s) {
    var grad = g.createRadialGradient(s / 2, s / 2, 20, s / 2, s / 2, s / 2);
    grad.addColorStop(0, '#2a3b60');
    grad.addColorStop(0.55, '#16223e');
    grad.addColorStop(1, '#0c1220');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

  var glowTex = makeCanvas(64, function (g, s) {
    var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,240,200,0.8)');
    grad.addColorStop(1, 'rgba(255,230,160,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });

  var raysTex = makeCanvas(256, function (g, s) {
    g.translate(s / 2, s / 2);
    for (var i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      var grad = g.createLinearGradient(0, 0, s / 2, 0);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, 0);
      g.lineTo(s / 2, -9);
      g.lineTo(s / 2, 9);
      g.closePath();
      g.fill();
    }
  });

  // ---------- Boden ----------
  var ground = new THREE.Mesh(
    new THREE.CircleGeometry(15, 48),
    new THREE.MeshBasicMaterial({ map: groundTex })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Unsichtbarer Schattenfänger über dem Gradient-Boden
  var shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 12),
    new THREE.ShadowMaterial({ opacity: 0.38 })
  );
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.005;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  // ---------- Truhen-Modell (Quaternius, CC0) ----------
  var W = 2.3;      // Zielbreite der Truhe in Weltkoordinaten
  var H = 1.5;      // tatsächliche Höhe, wird nach dem Laden gemessen
  var D = 1.45;     // ungefähre Tiefe für die Hitbox

  var chest = new THREE.Group();
  scene.add(chest);

  var modelReady = false;
  var lidGroup = null;
  var matByName = {};   // benannte Modell-Materialien (Wood, DarkMetal, ...)

  // Wird am Skript-Ende aufgerufen — greift auf Effekte (shaft, gem, ...) zu,
  // die erst weiter unten definiert werden.
  function loadModel() {
    var built = buildChest(THREE);
    var model = built.root;
    lidGroup = built.lid;
    matByName = built.materials;

    // Auf Zielbreite skalieren und auf den Boden setzen
    var box = new THREE.Box3().setFromObject(model);
    var size = box.getSize(new THREE.Vector3());
    var scale = W / size.x;
    model.scale.setScalar(scale);
    box = new THREE.Box3().setFromObject(model);
    model.position.y = -box.min.y;
    model.position.x = -(box.min.x + box.max.x) / 2;
    model.position.z = -(box.min.z + box.max.z) / 2;
    H = box.max.y - box.min.y;

    model.traverse(function (obj) {
      if (obj.isMesh) {
        obj.castShadow = true;
        var mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach(function (m) { m.envMapIntensity = 0.45; });
      }
    });

    chest.add(model);

    // Effekt-Positionen an die echte Modellhöhe anpassen
    innerLight.position.y = H * 0.9;
    shaft.position.y = H + 1.5;
    GEM_Y = H + 0.85;
    LOOK_AT.y = H * 0.52;

    modelReady = true;
    applyTier(pickTier());
  }

  function setLidAngle(eased) {
    if (lidGroup) lidGroup.rotation.x = LID_OPEN * eased;
  }

  // Unsichtbare, großzügige Hitbox fürs Antippen
  var hitbox = new THREE.Mesh(
    new THREE.BoxGeometry(W + 1.4, 3.2, D + 1.4),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitbox.position.y = 1.6;
  scene.add(hitbox);

  // ---------- Effekte ----------
  // Vertikaler Verlauf, damit die Lichtsäule nach oben weich ausläuft
  var shaftAlpha = makeCanvas(64, function (g, s) {
    var grad = g.createLinearGradient(0, 0, 0, s);
    grad.addColorStop(0, '#000');
    grad.addColorStop(0.45, '#fff');
    grad.addColorStop(1, '#fff');
    g.fillStyle = grad;
    g.fillRect(0, 0, s, s);
  });
  var shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 0.5, 3.4, 24, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffd97a, transparent: true, opacity: 0, alphaMap: shaftAlpha,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
    })
  );
  shaft.position.y = H + 1.7;
  scene.add(shaft);

  var rays = new THREE.Sprite(new THREE.SpriteMaterial({
    map: raysTex, color: 0xffe1a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  rays.scale.set(4.4, 4.4, 1);
  scene.add(rays);

  var gemMat = new THREE.MeshStandardMaterial({
    color: 0xffc94d, emissive: 0xffc94d, emissiveIntensity: 0.5,
    roughness: 0.15, metalness: 0.2, flatShading: true
  });
  var gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.46, 0), gemMat);
  gem.visible = false;
  scene.add(gem);
  var gemGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc94d, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  gemGlow.scale.set(2.4, 2.4, 1);
  scene.add(gemGlow);

  // Funken als Punktwolke
  var SPARKS = reducedMotion ? 50 : 150;
  var sparkPos = new Float32Array(SPARKS * 3);
  var sparkVel = new Float32Array(SPARKS * 3);
  var sparkCol = new Float32Array(SPARKS * 3);
  var sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  var sparkMat = new THREE.PointsMaterial({
    size: 0.16, map: glowTex, transparent: true, opacity: 0,
    vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false
  });
  var sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.visible = false;
  scene.add(sparks);

  // Münzen, die herausgeschleudert werden (Meshes werden wiederverwendet)
  var COINS = reducedMotion ? 6 : 15;
  var coinGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.035, 18);
  var coinMat = new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0.85 });
  coinMat.color.setHex(0xe0a83f).convertSRGBToLinear();
  var coins = [];
  for (var ci = 0; ci < COINS; ci++) {
    var coin = new THREE.Mesh(coinGeo, coinMat);
    coin.visible = false;
    coin.castShadow = true;
    scene.add(coin);
    coins.push({ mesh: coin, vel: new THREE.Vector3(), spin: new THREE.Vector3() });
  }

  // ---------- HUD ----------
  var hintEl = document.getElementById('hint');
  var bannerEl = document.getElementById('banner');
  var rarityEl = bannerEl.querySelector('.rarity');
  var subEl = bannerEl.querySelector('.sub');
  var btnEl = document.getElementById('againBtn');
  var flashEl = document.getElementById('flash');

  // ---------- Truhen-Stufen ----------
  // Pro Stufe: Farben für die benannten Modell-Materialien + Effektfarbe.
  var TIERS = [
    {
      label: 'Holztruhe',
      reward: 'HÄUFIG', rewardSub: 'Goldene Münzen',
      color: 0xffc94d, css: '#ffc94d',
      mats: {
        Wood: { color: 0x54290b },
        Wood2: { color: 0x653610 },
        Gold: { color: 0xe6b13c },
        Gold_Dark: { color: 0xb07f2a },
        Metal: { color: 0xd8b25e },
        DarkMetal: { color: 0xb98a3a }
      },
      weight: 0.4
    },
    {
      label: 'Runentruhe',
      reward: 'SELTEN', rewardSub: 'Runen-Kristall',
      color: 0x54b6ff, css: '#54b6ff',
      mats: {
        Wood: { color: 0x27305a, emissive: 0x3a66ff, intensity: 0.3 },
        Wood2: { color: 0x32406e, emissive: 0x3a66ff, intensity: 0.22 },
        Gold: { color: 0xe6b13c },
        Gold_Dark: { color: 0xb07f2a },
        Metal: { color: 0xc4d0de },
        DarkMetal: { color: 0x9fb0c4 }
      },
      weight: 0.3
    },
    {
      label: 'Kristalltruhe',
      reward: 'EPISCH', rewardSub: 'Eis-Kristall',
      color: 0x7cd4ff, css: '#7cd4ff',
      mats: {
        Wood: { color: 0x3f9fe8, emissive: 0x2e8fe0, intensity: 0.7, roughness: 0.2 },
        Wood2: { color: 0x6fc0f5, emissive: 0x4da8ea, intensity: 0.6, roughness: 0.2 },
        Gold: { color: 0xe6b13c },
        Gold_Dark: { color: 0xb07f2a },
        Metal: { color: 0xdde8f2 },
        DarkMetal: { color: 0xc3d2e2 }
      },
      weight: 0.2
    },
    {
      label: 'Goldtruhe',
      reward: 'LEGENDÄR', rewardSub: 'Amethyst',
      color: 0xc37bff, css: '#c37bff',
      mats: {
        Wood: { color: 0x552a72, emissive: 0x8a35e8, intensity: 0.18 },
        Wood2: { color: 0x653382, emissive: 0x8a35e8, intensity: 0.14 },
        Gold: { color: 0xffc94d },
        Gold_Dark: { color: 0xb07f2a },
        Metal: { color: 0xf2c95c },
        DarkMetal: { color: 0xe6b13c }
      },
      weight: 0.1
    }
  ];

  var tier = null;

  // r147 interpretiert setHex() als linearen Farbwert; wir geben aber sRGB-Hexwerte
  // an und rendern mit sRGB-Output → explizit konvertieren, sonst wirkt alles ausgeblichen.
  function srgb(target, hex) {
    target.setHex(hex).convertSRGBToLinear();
    return target;
  }

  function pickTier() {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < TIERS.length; i++) {
      acc += TIERS[i].weight;
      if (r < acc) return TIERS[i];
    }
    return TIERS[0];
  }

  function applyTier(next) {
    tier = next;
    Object.keys(tier.mats).forEach(function (name) {
      var m = matByName[name];
      if (!m) return;
      var def = tier.mats[name];
      srgb(m.color, def.color);
      srgb(m.emissive, def.emissive || 0x000000);
      m.emissiveIntensity = def.intensity || 0;
      if (def.roughness != null) m.roughness = def.roughness;
    });
    srgb(gemMat.color, tier.color);
    srgb(gemMat.emissive, tier.color);
    srgb(gemGlow.material.color, tier.color);
    srgb(rays.material.color, tier.color);
    srgb(shaft.material.color, tier.color);
    innerLight.color.setHex(tier.color);
    setHint('Tippe die ' + tier.label + ' an!');
  }

  // ---------- Sound (synthetisiert, kein Asset) ----------
  var actx = null;
  function audio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    return actx;
  }
  function thump() {
    try {
      var ctx = audio(); if (!ctx) return;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(150, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(55, ctx.currentTime + 0.14);
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      o.connect(g).connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.18);
    } catch (e) { /* Sound ist optional */ }
  }
  function chime() {
    try {
      var ctx = audio(); if (!ctx) return;
      [523, 784, 1047, 1568].forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        var t = ctx.currentTime + i * 0.07;
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.001, t);
        g.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        o.connect(g).connect(ctx.destination);
        o.start(t); o.stop(t + 0.65);
      });
    } catch (e) { /* Sound ist optional */ }
  }

  // ---------- Easings ----------
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function easeOutCubic(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInCubic(x) { return x * x * x; }
  function easeOutBack(x) {
    var c1 = 1.55, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  }

  // ---------- State-Machine ----------
  var state = 'idle';
  var taps = 0;
  var tapAnim = 0;       // 1 → 0: Wackel-Animation nach jedem Tap
  var openT = 0;         // Sekunden seit Öffnungsbeginn
  var closeT = 0;
  var burstDone = false;
  var shake = 0;
  var sparkAge = 0;
  var GEM_Y = 2.15;

  var TAPS_NEEDED = 3;
  var LID_OPEN = -1.92;  // Deckel-Winkeldelta am Knochen (≈ 110°)

  function setHint(text) {
    hintEl.textContent = text;
    hintEl.classList.remove('hidden');
  }

  // Meldet das Ergebnis an eine native iOS-App (WKWebView-Bridge).
  // Im normalen Browser ist window.webkit nicht vorhanden → no-op.
  function notifyApp(payload) {
    try {
      if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.chest) {
        window.webkit.messageHandlers.chest.postMessage(payload);
      }
    } catch (e) { /* Bridge ist optional */ }
  }

  function spawnBurst() {
    var col = new THREE.Color(tier.color);
    for (var i = 0; i < SPARKS; i++) {
      sparkPos[i * 3] = (Math.random() - 0.5) * 0.5;
      sparkPos[i * 3 + 1] = H + 0.15;
      sparkPos[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
      var ang = Math.random() * Math.PI * 2;
      var spread = Math.random() * 2.4;
      sparkVel[i * 3] = Math.cos(ang) * spread;
      sparkVel[i * 3 + 1] = 3.2 + Math.random() * 4.2;
      sparkVel[i * 3 + 2] = Math.sin(ang) * spread;
      var mix = Math.random();
      sparkCol[i * 3] = 1 * mix + col.r * (1 - mix);
      sparkCol[i * 3 + 1] = 0.92 * mix + col.g * (1 - mix);
      sparkCol[i * 3 + 2] = 0.7 * mix + col.b * (1 - mix);
    }
    sparkGeo.attributes.position.needsUpdate = true;
    sparkGeo.attributes.color.needsUpdate = true;
    sparkMat.opacity = 1;
    sparks.visible = true;
    sparkAge = 0;

    coins.forEach(function (c) {
      c.mesh.visible = true;
      c.mesh.position.set((Math.random() - 0.5) * 0.6, H + 0.2, (Math.random() - 0.5) * 0.4);
      var ang = Math.random() * Math.PI * 2;
      var sp = 0.8 + Math.random() * 1.8;
      c.vel.set(Math.cos(ang) * sp, 2.6 + Math.random() * 2.6, Math.sin(ang) * sp * 0.8 + 0.6);
      c.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    });

    flashEl.style.transition = 'none';
    flashEl.style.opacity = '0.85';
    void flashEl.offsetWidth;
    flashEl.style.transition = 'opacity 0.55s ease-out';
    flashEl.style.opacity = '0';

    shake = reducedMotion ? 0 : 1;
    chime();
  }

  function startOpen() {
    state = 'opening';
    openT = 0;
    burstDone = false;
    hintEl.classList.add('hidden');
  }

  function showBanner() {
    rarityEl.textContent = tier.reward;
    subEl.textContent = tier.rewardSub;
    bannerEl.style.setProperty('--rarity', tier.css);
    bannerEl.classList.add('show');
    btnEl.classList.add('show');
    notifyApp({ event: 'opened', chest: tier.label, rarity: tier.reward, item: tier.rewardSub });
  }

  function reset() {
    state = 'closing';
    closeT = 0;
    bannerEl.classList.remove('show');
    btnEl.classList.remove('show');
  }

  // ---------- Eingabe ----------
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();

  renderer.domElement.addEventListener('pointerdown', function (ev) {
    if (state !== 'idle' || !modelReady) return;
    pointer.x = (ev.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -(ev.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.intersectObject(hitbox).length === 0) return;

    taps++;
    tapAnim = 1;
    thump();
    if (taps >= TAPS_NEEDED) {
      startOpen();
    } else {
      var left = TAPS_NEEDED - taps;
      setHint(left === 1 ? 'Noch 1× tippen!' : 'Noch ' + left + '× tippen!');
    }
  });

  btnEl.addEventListener('click', reset);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    fitCamera();
  });

  // ---------- Haupt-Loop ----------
  var clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.05);
    var t = clock.elapsedTime;

    // Idle: sanftes Wippen + pulsierende Beschläge
    var bob = state === 'idle' || state === 'closing' ? Math.sin(t * 1.8) * 0.015 : 0;
    chest.position.y = bob;
    // Rahmen (DarkMetal) glimmt sanft im eigenen Ton
    if (tier && matByName.DarkMetal) {
      var pulse = state === 'idle' ? 0.1 + Math.sin(t * 2.4) * 0.07 : 0.04;
      matByName.DarkMetal.emissive.copy(matByName.DarkMetal.color);
      matByName.DarkMetal.emissiveIntensity = pulse;
    }

    // Tap-Wackeln (gedämpfte Schwingung, Squash & Stretch)
    if (tapAnim > 0) {
      tapAnim = Math.max(0, tapAnim - dt * 2.4);
      var w = reducedMotion ? tapAnim * 0.3 : tapAnim;
      chest.rotation.z = Math.sin(tapAnim * 22) * 0.07 * w;
      var sq = Math.sin(tapAnim * 16) * 0.07 * w;
      chest.scale.set(1 + sq, 1 - sq, 1 + sq);
    } else if (state === 'idle' || state === 'closing') {
      chest.rotation.z = 0;
      chest.scale.set(1, 1, 1);
    }

    if (state === 'opening') {
      openT += dt;

      // Anticipation: kurzes Zusammenstauchen vor dem Aufspringen
      if (openT < 0.22) {
        var p = Math.sin((openT / 0.22) * Math.PI);
        chest.scale.set(1 + 0.12 * p, 1 - 0.2 * p, 1 + 0.12 * p);
        chest.rotation.z = 0;
      } else {
        chest.scale.set(1, 1, 1);
      }

      // Deckel springt mit Overshoot auf
      var q = clamp01((openT - 0.18) / 0.55);
      setLidAngle(easeOutBack(q));
      innerLight.intensity = q * 3.8;
      shaft.material.opacity = q * 0.24;
      shaft.scale.set(1, 0.2 + q * 0.8, 1);

      if (!burstDone && openT >= 0.3) {
        burstDone = true;
        spawnBurst();
      }

      // Kristall steigt auf
      var g = clamp01((openT - 0.5) / 0.9);
      if (g > 0) {
        gem.visible = true;
        gem.position.set(0, H * 0.6 + easeOutCubic(g) * (GEM_Y - H * 0.6), 0);
        var gs = easeOutBack(g);
        gem.scale.set(gs, gs, gs);
        gemGlow.position.copy(gem.position);
        gemGlow.material.opacity = g * 0.75;
        rays.position.copy(gem.position);
        rays.material.opacity = g * 0.8;
      }

      if (openT > 1.6) {
        state = 'opened';
        showBanner();
      }
    }

    if (state === 'opened') {
      // Kristall schwebt, Strahlen rotieren, Lichtsäule beruhigt sich
      gem.position.y = GEM_Y + Math.sin(t * 1.7) * 0.08;
      gem.rotation.y += dt * 1.3;
      gemGlow.position.copy(gem.position);
      gemGlow.material.opacity = 0.6 + Math.sin(t * 3) * 0.12;
      rays.position.copy(gem.position);
      rays.material.rotation -= dt * 0.45;
      rays.material.opacity = 0.7;
      shaft.material.opacity = 0.11 + Math.sin(t * 2.2) * 0.04;
      innerLight.intensity = 3.2 + Math.sin(t * 5) * 0.5;
    }

    if (state === 'closing') {
      closeT += dt;
      var c = clamp01(closeT / 0.35);
      setLidAngle(1 - easeInCubic(c));
      innerLight.intensity = (1 - c) * 3;
      shaft.material.opacity = (1 - c) * 0.15;
      var fade = 1 - c;
      gemGlow.material.opacity = fade * 0.5;
      rays.material.opacity = fade * 0.5;
      gem.scale.setScalar(Math.max(0.001, fade));
      if (c >= 1) {
        state = 'idle';
        taps = 0;
        gem.visible = false;
        gemGlow.material.opacity = 0;
        rays.material.opacity = 0;
        sparks.visible = false;
        coins.forEach(function (co) { co.mesh.visible = false; });
        applyTier(pickTier());
      }
    }

    // Funken-Update
    if (sparks.visible) {
      sparkAge += dt;
      for (var i = 0; i < SPARKS; i++) {
        sparkVel[i * 3 + 1] -= 6.5 * dt;
        sparkPos[i * 3] += sparkVel[i * 3] * dt;
        sparkPos[i * 3 + 1] += sparkVel[i * 3 + 1] * dt;
        sparkPos[i * 3 + 2] += sparkVel[i * 3 + 2] * dt;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkMat.opacity = Math.max(0, 1 - sparkAge / 1.3);
      if (sparkAge > 1.3) sparks.visible = false;
    }

    // Münz-Physik mit Bodenkontakt
    coins.forEach(function (c) {
      if (!c.mesh.visible) return;
      c.vel.y -= 8.5 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      if (c.mesh.position.y < 0.05 && c.vel.y < 0) {
        c.mesh.position.y = 0.05;
        c.vel.y *= -0.35;
        c.vel.x *= 0.7;
        c.vel.z *= 0.7;
        c.spin.multiplyScalar(0.6);
      }
    });

    // Kamera: sanfte Drift, beim Öffnen Punch + Shake
    var drift = reducedMotion ? 0 : 1;
    camera.position.x = CAM_BASE.x + Math.sin(t * 0.3) * 0.22 * drift;
    camera.position.y = CAM_BASE.y + Math.sin(t * 0.4) * 0.08 * drift;
    camera.position.z = CAM_BASE.z + (state === 'opened' ? -0.45 : 0);
    if (shake > 0) {
      shake = Math.max(0, shake - dt / 0.6);
      camera.position.x += (Math.random() - 0.5) * 0.14 * shake;
      camera.position.y += (Math.random() - 0.5) * 0.14 * shake;
    }
    camera.lookAt(LOOK_AT);

    renderer.render(scene, camera);
  }

  loadModel();
  animate();

  // Debug-/Test-Hooks (auch praktisch für automatisierte UI-Tests)
  window.__chest = {
    setTier: function (i) { applyTier(TIERS[i]); },
    applyTierRaw: applyTier,
    open: function () { if (state === 'idle' && modelReady) startOpen(); },
    setLid: setLidAngle,
    mats: function () {
      return Object.keys(matByName).map(function (n) {
        var m = matByName[n];
        return n + ':' + m.color.getHexString() + ' vc:' + !!m.vertexColors + ' map:' + !!m.map;
      });
    },
    ready: function () { return modelReady; },
    state: function () { return state; }
  };
})();
