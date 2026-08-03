/*
 * Interface mobile (iPhone / Android) — lecture des SSCC avec l'appareil photo.
 * La logique métier est partagée avec la version PC via core.js (objet RM).
 */
(function () {
  'use strict';

  var LS_SOUND = 'rm_sound';

  var state = RM.createState();
  var sound = RM.createSound(state);
  var $ = function (id) { return document.getElementById(id); };

  // Caméra
  var codeReader = null;
  var stream = null;
  var scanning = false;
  var wakeLock = null;
  var lastCode = '';
  var lastCodeAt = 0;
  var REPEAT_DELAY_MS = 2500; // même code ignoré pendant ce délai

  // ---------------------------------------------------------------
  // Rendu
  // ---------------------------------------------------------------
  function renderFileStatus() {
    if (!state.fileName) {
      $('fileStatus').classList.remove('show');
      $('statsRow').style.display = 'none';
      $('progressBar').style.display = 'none';
      return;
    }
    $('fileStatus').classList.add('show');
    $('fsName').textContent = '✅ ' + state.fileName;
    $('fsMeta').textContent = state.dtSheets.length + ' DT chargés · ' + state.allRows.length + ' lignes';
    $('statsRow').style.display = 'flex';
    $('progressBar').style.display = 'block';
  }

  function renderStats() {
    var stats = RM.computeStats(state);
    var scope = $('statsScope');
    if (!stats.started) {
      $('statTotal').textContent = '—';
      $('statDone').textContent = '—';
      $('statLeft').textContent = '—';
      $('progressFill').style.width = '0%';
      scope.textContent = state.fileName ? 'Scannez une première palette pour démarrer le comptage.' : '';
      return;
    }
    $('statTotal').textContent = stats.total;
    $('statDone').textContent = stats.done;
    $('statLeft').textContent = stats.left;
    $('progressFill').style.width = stats.pct + '%';
    scope.textContent = 'DT ' + state.session.dt + (state.session.jour ? ' · ' + state.session.jour : '');
  }

  function renderSessionBanner() {
    var banner = $('sessionBanner');
    if (!state.session) { banner.classList.remove('show'); return; }
    banner.classList.add('show');
    $('sbTitle').textContent = '📦 DT ' + state.session.dt;
    $('sbSub').textContent = (state.session.jour ? state.session.jour + ' · ' : '') + state.session.dateLabel;
  }

  function renderResult(res) {
    var box = $('result');
    box.className = 'result show ' + res.status;
    var tag = $('resultTag');
    var label = $('umLabel');
    var um = $('umValue');
    var caption = $('umCaption');
    var details = $('resultDetails');

    if (res.status === 'err') {
      tag.textContent = '❌ SSCC introuvable';
      label.textContent = '';
      um.textContent = '—';
      caption.textContent = 'Code lu : ' + res.code + ' — absent du fichier chargé.';
      details.innerHTML = '';
      return;
    }

    if (res.status === 'other') {
      tag.textContent = '🔀 Autre rapatriement · DT ' + res.rec.dt;
      label.textContent = 'UM de cette palette';
    } else {
      tag.textContent = res.duplicate ? '⚠️ Déjà scannée' : '✅ SSCC reconnu';
      label.textContent = 'UM à coller sur la palette';
    }

    um.textContent = res.rec.um || '—';
    caption.textContent = 'SSCC ' + res.code;

    details.innerHTML = [
      ['Article', res.rec.article, false],
      ['N° DT', res.rec.dt, false],
      ['Désignation', res.rec.designation, true],
      ['Quantité', res.rec.qte, false],
      ['Poids (kg)', res.rec.poids, false]
    ].map(function (kv) {
      return '<div class="detail-item' + (kv[2] ? ' wide' : '') + '">' +
        '<div class="d-lbl">' + RM.escapeHtml(kv[0]) + '</div>' +
        '<div class="d-val">' + RM.escapeHtml(kv[1]) + '</div></div>';
    }).join('');
  }

  function renderHistory() {
    var list = $('historyList');
    var empty = $('historyEmpty');
    if (!state.history.length) {
      list.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    list.innerHTML = state.history.slice().reverse().slice(0, 200).map(function (h) {
      var cls = h.status === 'ok' ? 'ok' : (h.status === 'warn' ? 'warn' : (h.status === 'other' ? 'other' : 'err'));
      return '<div class="hist-item">' +
        '<div class="hist-main">' +
          '<div class="hist-um">' + RM.escapeHtml(h.um) + '</div>' +
          '<div class="hist-meta">' + RM.fmtTime(h.time) + ' · ' + RM.escapeHtml(h.sscc) + '</div>' +
        '</div>' +
        '<span class="badge ' + cls + '">' + RM.STATUS_LABEL[h.status] + '</span>' +
        '</div>';
    }).join('');
  }

  function showToast(type, title, msg) {
    var container = $('toastContainer');
    var el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = '<div class="t-title">' + RM.escapeHtml(title) + '</div>' +
      '<div class="t-msg">' + RM.escapeHtml(msg) + '</div>';
    container.appendChild(el);
    setTimeout(function () {
      el.classList.add('hide');
      setTimeout(function () { el.remove(); }, 240);
    }, 4000);
  }

  // ---------------------------------------------------------------
  // Scan
  // ---------------------------------------------------------------
  function handleScan(raw) {
    if (!state.allRows.length) {
      showToast('warn', 'Aucun fichier chargé', 'Chargez d\'abord l\'Excel du rapatriement (étape 1).');
      return;
    }

    var res = RM.resolveScan(state, raw);
    if (!res) return;

    if (res.sessionStarted) {
      renderSessionBanner();
      showToast('info', 'Début du rapatriement',
        'DT ' + res.rec.dt + ' — ' + (state.session.jour ? state.session.jour + ' ' : '') + state.session.dateLabel);
    }

    renderResult(res);
    sound.play(res.status === 'other' ? 'err' : res.status);

    if (res.status === 'err') {
      showToast('err', 'SSCC introuvable', 'Ce code ne correspond à aucune palette du fichier.');
    } else if (res.status === 'other') {
      showToast('warn', 'Autre rapatriement !',
        'Palette du DT ' + res.rec.dt + ', pas du rapatriement en cours (DT ' + state.session.dt + ').');
    }

    renderHistory();
    renderStats();
    // Le résultat est en haut de page : on y remonte pour qu'il soit vu sans défiler.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Appelé en continu par ZXing : on filtre les répétitions du même code.
  function onDecoded(text) {
    var now = Date.now();
    if (text === lastCode && (now - lastCodeAt) < REPEAT_DELAY_MS) return;
    lastCode = text;
    lastCodeAt = now;
    handleScan(text);
  }

  // ---------------------------------------------------------------
  // Caméra
  // ---------------------------------------------------------------
  function buildReader() {
    var hints = new Map();
    var F = ZXing.BarcodeFormat;
    // Les étiquettes palette SSCC sont en GS1-128 ; on accepte aussi les
    // formats voisins qu'on peut croiser sur un carton.
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      F.CODE_128, F.ITF, F.CODE_39, F.EAN_13, F.DATA_MATRIX, F.QR_CODE
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    hints.set(ZXing.DecodeHintType.ASSUME_GS1, true);

    var reader = new ZXing.BrowserMultiFormatReader(hints);
    // Décodage toutes les ~60 ms : réactivité maximale pour enchaîner les
    // palettes rapidement (un peu plus de CPU, largement acceptable sur un
    // scan qui ne dure que quelques secondes à chaque fois).
    reader.timeBetweenDecodingAttempts = 60;
    return reader;
  }

  function showCamError(msg) {
    var box = $('camError');
    box.textContent = msg;
    box.classList.add('show');
  }

  function clearCamError() {
    $('camError').classList.remove('show');
  }

  function cameraUnavailableReason() {
    // getUserMedia n'existe que dans un contexte sécurisé. Ouvert en fichier
    // local (file://) ou en http, Safari ne proposera jamais la caméra.
    if (!window.isSecureContext && location.protocol !== 'https:' && location.hostname !== 'localhost') {
      return 'L\'appareil photo exige une page en HTTPS. Ouvrez l\'application depuis son adresse https:// (GitHub Pages) plutôt qu\'en fichier local, ou saisissez le SSCC à la main ci-dessous.';
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return 'Ce navigateur ne donne pas accès à l\'appareil photo. Sur iPhone, utilisez Safari, ou saisissez le SSCC à la main ci-dessous.';
    }
    return null;
  }

  async function startCamera() {
    clearCamError();
    var reason = cameraUnavailableReason();
    if (reason) { showCamError(reason); return; }

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' }, // caméra arrière
          // 720p décode plus vite que le 1080p demandé avant (moins de pixels
          // à traiter par tentative) tout en restant net à la distance où l'on
          // vise un code-barre ; on demande aussi la mise au point continue
          // pour ne pas avoir à retoucher l'écran entre deux palettes.
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          focusMode: { ideal: 'continuous' }
        },
        audio: false
      });
    } catch (err) {
      var msg;
      if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        msg = 'Accès à l\'appareil photo refusé. Autorisez-le dans Réglages ▸ Safari ▸ Appareil photo, puis réessayez.';
      } else if (err && err.name === 'NotFoundError') {
        msg = 'Aucune caméra détectée sur cet appareil.';
      } else if (err && err.name === 'NotReadableError') {
        msg = 'La caméra est déjà utilisée par une autre application. Fermez-la puis réessayez.';
      } else {
        msg = 'Impossible de démarrer la caméra : ' + (err && err.message ? err.message : err);
      }
      showCamError(msg);
      return;
    }

    var video = $('video');
    video.style.display = 'block';
    $('vfIdle').style.display = 'none';
    $('vfFrame').classList.add('show');

    if (!codeReader) codeReader = buildReader();

    try {
      codeReader.decodeFromStream(stream, video, function (result, err) {
        if (result) onDecoded(result.getText());
        // err est une NotFoundException à chaque image sans code : c'est normal.
      });
    } catch (err) {
      showCamError('Le lecteur de code-barre n\'a pas pu démarrer : ' + (err && err.message ? err.message : err));
      stopCamera();
      return;
    }

    scanning = true;
    $('camToggleBtn').textContent = '⏸️ Arrêter la caméra';
    setupTorch();
    setupContinuousFocus();
    requestWakeLock();
  }

  // Certains navigateurs (Chrome Android notamment) n'honorent le focusMode
  // demandé dans getUserMedia que si on le repasse explicitement via
  // applyConstraints une fois la piste vidéo obtenue.
  function setupContinuousFocus() {
    if (!stream) return;
    var track = stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    var caps;
    try { caps = track.getCapabilities(); } catch (e) { return; }
    if (!caps || !caps.focusMode || caps.focusMode.indexOf('continuous') === -1) return;
    track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(function () {});
  }

  function stopCamera() {
    scanning = false;
    try { if (codeReader) codeReader.reset(); } catch (e) {}
    if (stream) {
      stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      stream = null;
    }
    var video = $('video');
    video.style.display = 'none';
    try { video.srcObject = null; } catch (e) {}
    $('vfIdle').style.display = '';
    $('vfFrame').classList.remove('show');
    $('camToggleBtn').textContent = '▶️ Démarrer la caméra';
    $('torchBtn').style.display = 'none';
    releaseWakeLock();
  }

  // Lampe torche — disponible sur Android Chrome, pas sur iOS Safari :
  // on n'affiche le bouton que si la piste vidéo l'annonce.
  function setupTorch() {
    var btn = $('torchBtn');
    btn.style.display = 'none';
    if (!stream) return;
    var track = stream.getVideoTracks()[0];
    if (!track || !track.getCapabilities) return;
    var caps;
    try { caps = track.getCapabilities(); } catch (e) { return; }
    if (!caps || !('torch' in caps)) return;

    var on = false;
    btn.style.display = '';
    btn.onclick = function () {
      on = !on;
      track.applyConstraints({ advanced: [{ torch: on }] })
        .then(function () { btn.textContent = on ? '💡' : '🔦'; })
        .catch(function () { btn.style.display = 'none'; });
    };
  }

  // Empêche l'écran de s'éteindre pendant une série de scans.
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) { /* non supporté, sans conséquence */ }
  }

  function releaseWakeLock() {
    try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Fichier
  // ---------------------------------------------------------------
  function handleFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = RM.loadWorkbookIntoState(state, e.target.result, file.name);
        if (!parsed) {
          showToast('err', 'Fichier non reconnu', 'Aucune ligne de rapatriement trouvée dans ce classeur.');
          return;
        }
        renderFileStatus();
        renderSessionBanner();
        renderStats();
        renderHistory();
        $('result').classList.remove('show');
        showToast('ok', 'Fichier chargé', parsed.dtSheets.length + ' DT · ' + parsed.allRows.length + ' palettes. Vous pouvez scanner.');
      } catch (err) {
        console.error(err);
        showToast('err', 'Erreur de lecture', err.message || String(err));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  function applySound(on) {
    state.soundOn = on;
    $('soundToggle').textContent = on ? '🔊' : '🔇';
    try { localStorage.setItem(LS_SOUND, on ? '1' : '0'); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', function () {
    var savedSound = null;
    try { savedSound = localStorage.getItem(LS_SOUND); } catch (e) {}
    applySound(savedSound !== '0');

    renderFileStatus();
    renderStats();
    renderHistory();

    // iOS n'autorise l'audio qu'après une interaction : on débloque au 1er geste.
    document.addEventListener('touchstart', function unlockOnce() {
      sound.unlock();
      document.removeEventListener('touchstart', unlockOnce);
    }, { passive: true });

    $('soundToggle').addEventListener('click', function () {
      sound.unlock();
      applySound(!state.soundOn);
    });

    $('dropzone').addEventListener('click', function () { $('fileInput').click(); });
    $('fileInput').addEventListener('change', function (e) { handleFile(e.target.files[0]); });

    $('camToggleBtn').addEventListener('click', function () {
      sound.unlock();
      if (scanning) stopCamera(); else startCamera();
    });

    $('manualForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var input = $('manualInput');
      var val = input.value.trim();
      if (!val) return;
      handleScan(val);
      input.value = '';
      input.blur();
    });

    $('endSessionBtn').addEventListener('click', function () {
      state.session = null;
      renderSessionBanner();
      renderStats();
      showToast('info', 'Rapatriement terminé', 'Le prochain scan démarrera un nouveau rapatriement.');
    });

    $('exportBtn').addEventListener('click', function () {
      if (!RM.exportHistoryCsv(state)) showToast('warn', 'Rien à exporter', 'Aucun scan dans l\'historique.');
    });

    $('clearHistBtn').addEventListener('click', function () {
      if (!state.history.length) return;
      if (!confirm('Vider l\'historique des scans ?')) return;
      state.history = [];
      state.session = null;
      renderHistory();
      renderStats();
      renderSessionBanner();
      $('result').classList.remove('show');
    });

    // Si l'app passe en arrière-plan, on libère la caméra (et la batterie).
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && scanning) stopCamera();
    });

    // Signale d'emblée le cas le plus déroutant : page ouverte en local,
    // où Safari ne proposera jamais l'appareil photo.
    var reason = cameraUnavailableReason();
    if (reason) showCamError(reason);
  });

  // Exposé pour les tests automatisés (décodage simulé sans caméra réelle).
  window.__rm = {
    handleScan: handleScan,
    onDecoded: onDecoded,
    getState: function () { return state; }
  };
})();
