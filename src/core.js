/*
 * Rapatriement Mutual — logique métier partagée entre la version PC (douchette
 * USB) et la version mobile (appareil photo). Aucune dépendance au DOM ici :
 * les deux interfaces appellent les mêmes fonctions, ce qui évite qu'elles
 * divergent quand une règle change.
 */
var RM = (function () {
  'use strict';

  // ---------------------------------------------------------------
  // SSCC normalization
  // ---------------------------------------------------------------
  // Une douchette (ou l'appareil photo) qui lit une étiquette GS1 renvoie
  // l'identifiant d'application "00" suivi du SSCC 18 chiffres, soit 20
  // chiffres, parfois entre parenthèses ou avec des séparateurs FNC1/GS. Le
  // fichier Excel ne stocke que les 18 chiffres : on réduit donc aux chiffres
  // seuls et on retire le préfixe "00".
  function normalizeSscc(v) {
    var digits = String(v == null ? '' : v).replace(/\D/g, '');
    if (digits.length === 20 && digits.slice(0, 2) === '00') digits = digits.slice(2);
    return digits;
  }

  function addToIndex(index, key, record) {
    if (!key) return;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  }

  // ---------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------
  function fmtDate(v) {
    if (!v) return '—';
    if (v instanceof Date && !isNaN(v)) return v.toLocaleDateString('fr-FR');
    return String(v);
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function dayName(v) {
    if (!(v instanceof Date) || isNaN(v)) return '';
    var name = v.toLocaleDateString('fr-FR', { weekday: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------------------------------------------------------------
  // État partagé
  // ---------------------------------------------------------------
  function createState() {
    return {
      allRows: [],        // toutes les lignes lues dans le classeur
      index: new Map(),   // sscc -> lignes correspondantes
      dtSheets: [],
      fileName: '',
      loadedAt: '',
      history: [],        // {time, sscc, um, article, designation, dt, status}
      session: null,      // {dt, jour, dateLabel} du rapatriement en cours
      soundOn: true,
      currentUm: ''
    };
  }

  // ---------------------------------------------------------------
  // Lecture du classeur Excel (nécessite XLSX / SheetJS)
  // ---------------------------------------------------------------
  function parseWorkbook(workbook) {
    var indexBySscc = new Map();
    var allRows = [];
    var dtSheets = [];

    workbook.SheetNames.forEach(function (sheetName) {
      var ws = workbook.Sheets[sheetName];
      var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

      var headerIdx = -1;
      var dtName = sheetName;

      for (var i = 0; i < aoa.length; i++) {
        var row = aoa[i];
        if (!row) continue;
        if (row[0] === 'n° DT' && row[1]) dtName = String(row[1]).trim();
        if (row[0] === 'A LIVRER LE' && row[1] === 'Article') { headerIdx = i; break; }
      }
      if (headerIdx === -1) return; // onglet séparateur (LUNDI>>…), on l'ignore

      var foundRows = false;
      for (var j = headerIdx + 1; j < aoa.length; j++) {
        var r = aoa[j];
        if (!r || r[0] == null) continue;
        if (String(r[0]).trim() === 'Total général') break;

        var record = {
          dt: dtName,
          sheet: sheetName,
          aLivrerLe: r[0],
          article: r[1] != null ? String(r[1]).trim() : '',
          designation: r[2] != null ? String(r[2]).trim() : '',
          um: r[3] != null ? String(r[3]).trim() : '',
          sscc: r[4] != null ? String(r[4]).trim() : '',
          qte: r[5],
          pal: r[6],
          poids: r[7]
        };
        allRows.push(record);
        foundRows = true;

        if (record.sscc) {
          addToIndex(indexBySscc, record.sscc, record);
          var norm = normalizeSscc(record.sscc);
          if (norm && norm !== record.sscc) addToIndex(indexBySscc, norm, record);
        }
      }
      if (foundRows) dtSheets.push(dtName);
    });

    return { indexBySscc: indexBySscc, allRows: allRows, dtSheets: dtSheets };
  }

  function loadWorkbookIntoState(state, arrayBuffer, fileName) {
    var wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array', cellDates: true });
    var parsed = parseWorkbook(wb);
    if (!parsed.allRows.length) return null;

    state.allRows = parsed.allRows;
    state.index = parsed.indexBySscc;
    state.dtSheets = parsed.dtSheets;
    state.fileName = fileName;
    state.loadedAt = new Date().toISOString();
    state.session = null;
    state.history = [];
    return parsed;
  }

  // ---------------------------------------------------------------
  // Résolution d'un scan
  // ---------------------------------------------------------------
  // Renvoie { status, code, rec, sessionStarted, duplicate, entry } sans
  // toucher au DOM. status vaut 'ok', 'warn' (doublon), 'other' (SSCC d'un
  // autre DT) ou 'err' (introuvable).
  function resolveScan(state, raw) {
    var code = String(raw == null ? '' : raw).trim();
    if (!code) return null;

    var matches = state.index.get(code) || state.index.get(normalizeSscc(code));
    var now = new Date().toISOString();

    if (!matches || !matches.length) {
      var missEntry = { time: now, sscc: code, um: '-', article: '-', designation: '', dt: '-', status: 'err' };
      state.history.push(missEntry);
      return { status: 'err', code: code, rec: null, sessionStarted: false, duplicate: false, entry: missEntry };
    }

    var rec = matches[0];
    // On repart toujours du SSCC tel qu'écrit dans le fichier, pour que
    // l'historique, la détection de doublon et les compteurs restent cohérents
    // quel que soit le format renvoyé par le lecteur.
    code = rec.sscc;

    var sessionStarted = false;
    if (!state.session) {
      state.session = { dt: rec.dt, jour: dayName(rec.aLivrerLe), dateLabel: fmtDate(rec.aLivrerLe) };
      sessionStarted = true;
    } else if (rec.dt !== state.session.dt) {
      var otherEntry = {
        time: now, sscc: code, um: rec.um, article: rec.article,
        designation: rec.designation, dt: rec.dt, status: 'other'
      };
      state.history.push(otherEntry);
      return { status: 'other', code: code, rec: rec, sessionStarted: false, duplicate: false, entry: otherEntry };
    }

    var duplicate = state.history.some(function (h) {
      return h.sscc === code && (h.status === 'ok' || h.status === 'warn');
    });
    var status = duplicate ? 'warn' : 'ok';
    var entry = {
      time: now, sscc: code, um: rec.um, article: rec.article,
      designation: rec.designation, dt: rec.dt, status: status
    };
    state.history.push(entry);
    return { status: status, code: code, rec: rec, sessionStarted: sessionStarted, duplicate: duplicate, entry: entry };
  }

  // ---------------------------------------------------------------
  // Compteurs — limités au rapatriement (DT) en cours
  // ---------------------------------------------------------------
  function computeStats(state) {
    if (!state.session) return { started: false, total: 0, done: 0, left: 0, pct: 0 };

    var scannable = state.allRows.filter(function (r) {
      return r.sscc && r.dt === state.session.dt;
    });
    var scannedSet = new Set();
    state.history.forEach(function (h) {
      if (h.dt === state.session.dt && (h.status === 'ok' || h.status === 'warn')) scannedSet.add(h.sscc);
    });
    var done = scannable.filter(function (r) { return scannedSet.has(r.sscc); }).length;
    var total = scannable.length;

    return {
      started: true,
      total: total,
      done: done,
      left: total - done,
      pct: total ? Math.round((done / total) * 100) : 0
    };
  }

  function searchRows(state, query, limit) {
    if (!query || query.trim().length < 2) return [];
    var q = query.trim().toLowerCase();
    var qNorm = normalizeSscc(query);
    return state.allRows.filter(function (r) {
      return (r.article && r.article.toLowerCase().indexOf(q) !== -1) ||
        (r.designation && r.designation.toLowerCase().indexOf(q) !== -1) ||
        (r.sscc && r.sscc.toLowerCase().indexOf(q) !== -1) ||
        (r.um && r.um.toLowerCase().indexOf(q) !== -1) ||
        (qNorm.length >= 2 && r.sscc && normalizeSscc(r.sscc).indexOf(qNorm) !== -1);
    }).slice(0, limit || 30);
  }

  // ---------------------------------------------------------------
  // Retour sonore (Web Audio, aucun fichier externe)
  // ---------------------------------------------------------------
  function createSound(state) {
    var audioCtx = null;

    function beep(freq, duration, type) {
      if (!state.soundOn) return;
      try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // iOS suspend le contexte audio tant qu'aucune interaction n'a eu lieu.
        if (audioCtx.state === 'suspended') audioCtx.resume();
        var osc = audioCtx.createOscillator();
        var gain = audioCtx.createGain();
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
      } catch (e) { /* audio indisponible, on ignore */ }
    }

    return {
      play: function (status) {
        if (status === 'ok') { beep(880, 0.12); }
        else if (status === 'warn') { beep(660, 0.1); setTimeout(function () { beep(660, 0.1); }, 130); }
        else { beep(220, 0.28, 'square'); }
      },
      // Débloque l'audio iOS au premier geste utilisateur.
      unlock: function () {
        try {
          if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          if (audioCtx.state === 'suspended') audioCtx.resume();
        } catch (e) {}
      }
    };
  }

  // ---------------------------------------------------------------
  // Export CSV de l'historique
  // ---------------------------------------------------------------
  function exportHistoryCsv(state) {
    if (!state.history.length) return false;
    var header = ['Heure', 'SSCC', 'UM', 'Article', 'Designation', 'DT', 'Statut'];
    var lines = [header.join(';')];
    state.history.forEach(function (h) {
      lines.push([
        new Date(h.time).toLocaleString('fr-FR'),
        h.sscc, h.um, h.article, h.designation, h.dt, h.status
      ].map(function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }).join(';'));
    });
    var csv = '﻿' + lines.join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    a.href = url;
    a.download = 'historique_scans_' + stamp + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  var STATUS_LABEL = { ok: 'OK', warn: 'DOUBLON', other: 'AUTRE DT', err: 'INTROUVABLE' };

  return {
    normalizeSscc: normalizeSscc,
    createState: createState,
    parseWorkbook: parseWorkbook,
    loadWorkbookIntoState: loadWorkbookIntoState,
    resolveScan: resolveScan,
    computeStats: computeStats,
    searchRows: searchRows,
    createSound: createSound,
    exportHistoryCsv: exportHistoryCsv,
    fmtDate: fmtDate,
    fmtTime: fmtTime,
    dayName: dayName,
    escapeHtml: escapeHtml,
    STATUS_LABEL: STATUS_LABEL
  };
})();
