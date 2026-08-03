/*
 * Interface PC (poste entrepôt avec douchette USB).
 * Toute la logique métier vit dans core.js (objet RM).
 */
(function () {
  'use strict';

  // Seules les préférences d'affichage survivent à un rechargement. Le fichier
  // chargé, l'historique et le rapatriement en cours sont volontairement
  // purgés : on charge l'Excel, on scanne, c'est tout.
  var LS_THEME = 'rm_theme';
  var LS_SOUND = 'rm_sound';

  var state = RM.createState();
  var sound = RM.createSound(state);
  var $ = function (id) { return document.getElementById(id); };

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
    var loaded = state.loadedAt ? new Date(state.loadedAt) : null;
    var when = loaded && !isNaN(loaded) ? loaded.toLocaleString('fr-FR') : '';
    $('fsMeta').textContent = state.dtSheets.length + ' DT chargés · ' + when;
    $('statsRow').style.display = 'flex';
    $('progressBar').style.display = 'block';
  }

  function renderStats() {
    var stats = RM.computeStats(state);
    var scopeNote = $('statsScope');

    if (!stats.started) {
      $('statTotal').textContent = '—';
      $('statDone').textContent = '—';
      $('statLeft').textContent = '—';
      $('progressFill').style.width = '0%';
      scopeNote.textContent = state.fileName ? 'Scannez une première palette pour démarrer le comptage du rapatriement.' : '';
      return;
    }

    $('statTotal').textContent = stats.total;
    $('statDone').textContent = stats.done;
    $('statLeft').textContent = stats.left;
    $('progressFill').style.width = stats.pct + '%';
    scopeNote.textContent = 'DT ' + state.session.dt + (state.session.jour ? ' · ' + state.session.jour : '');
  }

  function renderResult(status, rec, code, duplicate) {
    var box = $('result');
    box.className = 'result show ' + status;
    var tag = $('resultTag');
    var um = $('umValue');
    var caption = $('umCaption');
    var details = $('resultDetails');
    var copyBtn = $('copyUmBtn');

    if (status === 'err') {
      tag.textContent = '❌ SSCC introuvable';
      um.textContent = '—';
      caption.textContent = 'Ce code ne correspond à aucune ligne du fichier chargé (' + code + ').';
      details.innerHTML = '';
      copyBtn.style.display = 'none';
      state.currentUm = '';
      return;
    }

    if (status === 'other') {
      tag.textContent = '🔀 Autre rapatriement · DT ' + rec.dt;
      caption.textContent = 'Ce SSCC n\'appartient pas au rapatriement en cours (DT ' + (state.session ? state.session.dt : '') + ').';
    } else {
      tag.textContent = duplicate ? '⚠️ Déjà scanné précédemment' : '✅ SSCC reconnu';
      caption.textContent = 'UM à coller sur la palette · SSCC ' + code;
    }
    um.textContent = rec.um || '—';
    state.currentUm = rec.um || '';
    copyBtn.style.display = 'inline-block';

    details.innerHTML = [
      ['Article', rec.article],
      ['Désignation', rec.designation],
      ['N° DT', rec.dt],
      ['Quantité', rec.qte],
      ['Poids (kg)', rec.poids],
      ['Livraison prévue', RM.fmtDate(rec.aLivrerLe)]
    ].map(function (kv) {
      return '<div class="detail-item"><div class="d-lbl">' + RM.escapeHtml(kv[0]) +
        '</div><div class="d-val">' + RM.escapeHtml(kv[1]) + '</div></div>';
    }).join('');
  }

  function renderHistory() {
    var body = $('historyBody');
    var empty = $('historyEmpty');
    if (!state.history.length) {
      body.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    var rows = state.history.slice().reverse().slice(0, 500);
    body.innerHTML = rows.map(function (h) {
      var cls = h.status === 'ok' ? 'ok' : (h.status === 'warn' ? 'warn' : (h.status === 'other' ? 'other' : 'err'));
      return '<tr>' +
        '<td>' + RM.fmtTime(h.time) + '</td>' +
        '<td style="font-family:monospace;">' + RM.escapeHtml(h.sscc) + '</td>' +
        '<td style="font-family:monospace;">' + RM.escapeHtml(h.um) + '</td>' +
        '<td>' + RM.escapeHtml(h.article) + '</td>' +
        '<td>' + RM.escapeHtml(h.dt) + '</td>' +
        '<td><span class="badge ' + cls + '">' + RM.STATUS_LABEL[h.status] + '</span></td>' +
        '</tr>';
    }).join('');
  }

  function renderSearch(query) {
    var body = $('searchResults');
    if (!query || query.trim().length < 2) { body.innerHTML = ''; return; }
    var matches = RM.searchRows(state, query, 30);
    body.innerHTML = matches.map(function (r) {
      return '<tr><td>' + RM.escapeHtml(r.article) + '</td><td>' + RM.escapeHtml(r.designation) + '</td>' +
        '<td style="font-family:monospace;">' + RM.escapeHtml(r.sscc || '—') + '</td>' +
        '<td style="font-family:monospace;">' + RM.escapeHtml(r.um || '—') + '</td></tr>';
    }).join('') || '<tr><td colspan="4" style="color:var(--text-2);">Aucun résultat</td></tr>';
  }

  function renderSessionBanner() {
    var banner = $('sessionBanner');
    if (!state.session) { banner.style.display = 'none'; return; }
    banner.style.display = 'flex';
    $('sbTitle').textContent = '📦 Rapatriement en cours : DT ' + state.session.dt;
    $('sbSub').textContent = (state.session.jour ? state.session.jour + ' · ' : '') + state.session.dateLabel;
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
      setTimeout(function () { el.remove(); }, 260);
    }, 4200);
  }

  // ---------------------------------------------------------------
  // Scan
  // ---------------------------------------------------------------
  function handleScan(raw) {
    var res = RM.resolveScan(state, raw);
    if (!res) return;

    if (res.sessionStarted) {
      renderSessionBanner();
      showToast('info', 'Début du rapatriement',
        'DT ' + res.rec.dt + ' — ' + (state.session.jour ? state.session.jour + ' ' : '') + state.session.dateLabel);
    }

    renderResult(res.status, res.rec, res.code, res.duplicate);
    sound.play(res.status === 'other' ? 'err' : res.status);

    if (res.status === 'err') {
      showToast('err', 'SSCC introuvable', 'Le code ' + res.code + ' ne correspond à aucune ligne du fichier chargé.');
    } else if (res.status === 'other') {
      showToast('warn', 'Autre rapatriement !',
        'Ce SSCC appartient au DT ' + res.rec.dt + ', pas au rapatriement en cours (DT ' + state.session.dt + ').');
    }

    renderHistory();
    renderStats();
  }

  // ---------------------------------------------------------------
  // Chargement du fichier
  // ---------------------------------------------------------------
  function handleFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var parsed = RM.loadWorkbookIntoState(state, e.target.result, file.name);
        if (!parsed) {
          alert('Aucune ligne de rapatriement reconnue dans ce fichier (colonnes attendues : A LIVRER LE, Article, Désignation article, Unité stk, Code palette, Qté, Pal, Poids Kg).');
          return;
        }
        renderFileStatus();
        renderSessionBanner();
        renderStats();
        renderHistory();
        renderSearch('');
        $('scanInput').focus();
      } catch (err) {
        console.error(err);
        alert('Erreur lors de la lecture du fichier Excel : ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ---------------------------------------------------------------
  // Thème & son
  // ---------------------------------------------------------------
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    $('themeToggle').textContent = theme === 'light' ? '☀️' : '🌙';
    try { localStorage.setItem(LS_THEME, theme); } catch (e) {}
  }

  function applySound(on) {
    state.soundOn = on;
    $('soundToggle').textContent = on ? '🔊' : '🔇';
    try { localStorage.setItem(LS_SOUND, on ? '1' : '0'); } catch (e) {}
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', function () {
    // Thème sombre par défaut, sauf si l'utilisateur a explicitement choisi le clair.
    var savedTheme = null;
    try { savedTheme = localStorage.getItem(LS_THEME); } catch (e) {}
    applyTheme(savedTheme === 'light' ? 'light' : 'dark');

    var savedSound = null;
    try { savedSound = localStorage.getItem(LS_SOUND); } catch (e) {}
    applySound(savedSound !== '0');

    renderFileStatus();
    renderSessionBanner();
    renderStats();
    renderHistory();

    $('themeToggle').addEventListener('click', function () {
      applyTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light');
    });
    $('soundToggle').addEventListener('click', function () { applySound(!state.soundOn); });

    var dropzone = $('dropzone');
    var fileInput = $('fileInput');
    dropzone.addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) { e.preventDefault(); dropzone.classList.remove('dragover'); });
    });
    dropzone.addEventListener('drop', function (e) {
      var file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    var scanForm = $('scanForm');
    var scanInput = $('scanInput');
    scanForm.addEventListener('submit', function (e) {
      e.preventDefault();
      handleScan(scanInput.value);
      scanInput.value = '';
      scanInput.focus();
    });

    // Une douchette tape le code puis envoie Entrée, ce que le submit gère déjà.
    // Un copier-coller manuel n'envoie pas Entrée : on valide dès qu'un code est collé.
    scanInput.addEventListener('paste', function () {
      setTimeout(function () {
        var val = scanInput.value.trim();
        if (!val) return;
        handleScan(val);
        scanInput.value = '';
        scanInput.focus();
      }, 0);
    });
    scanInput.focus();

    // On garde le champ de scan focalisé pour que la douchette ait toujours une cible.
    document.addEventListener('click', function (e) {
      var tag = e.target.tagName;
      var isFormField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A';
      if (!isFormField) scanInput.focus();
    });

    $('copyUmBtn').addEventListener('click', function () {
      if (!state.currentUm) return;
      navigator.clipboard && navigator.clipboard.writeText(state.currentUm).then(function () {
        var btn = $('copyUmBtn');
        var old = btn.textContent;
        btn.textContent = '✅ Copié !';
        setTimeout(function () { btn.textContent = old; }, 1400);
      }).catch(function () {});
    });

    $('exportBtn').addEventListener('click', function () {
      if (!RM.exportHistoryCsv(state)) alert('Aucun historique à exporter.');
    });

    $('clearHistBtn').addEventListener('click', function () {
      if (!state.history.length) return;
      if (!confirm('Vider tout l\'historique des scans ? Cette action est irréversible.')) return;
      state.history = [];
      state.session = null;
      renderHistory();
      renderStats();
      renderSessionBanner();
    });

    $('endSessionBtn').addEventListener('click', function () {
      state.session = null;
      renderSessionBanner();
      renderStats();
      showToast('info', 'Rapatriement terminé', 'Le prochain scan démarrera un nouveau rapatriement.');
    });

    $('manualSearch').addEventListener('input', function (e) { renderSearch(e.target.value); });
  });
})();
