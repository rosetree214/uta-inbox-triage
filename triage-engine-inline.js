// triage-engine-inline.js — UTA Inbox Triage Mini App engine (inline 6-option model).
// Each .triage-item shows all 6 options on the card (Oren's decide-each spec). Quick
// actions (archive/skip/ignore) commit on one tap; note actions (draft/note/todoist)
// expand an inline note then commit. Output payload is the SPEC contract, unchanged:
//   { v:1, session:<iso>, actions:[ { id, do, note? } ] }
// Learning: the recommendation lives server-side (data-recommended is only for the
// emphasized button); Hermes compares chosen `do` vs its stored recommendation per id.
(function () {
  "use strict";
  var BYTE_LIMIT = 4096;
  var NOTE_ACTIONS = { draft_reply: "What should the reply say?",
                       note: "Tell Hermes what to do",
                       todoist: "Task title (optional)" };
  var OPTIONAL_NOTE = { todoist: true };
  var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
  var haptic = function (t) { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(t || "light"); } catch (e) {} };
  var store = new Map(); // id -> { do, note? }

  function boot() {
    if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor("bg_color"); } catch (e) {} }
    document.querySelectorAll(".triage-item").forEach(wireItem);
    wireSend();
    updateSend();
  }

  function wireItem(card) {
    var id = card.getAttribute("data-item-id");
    if (!id) { console.warn("[triage] item missing data-item-id", card); return; }
    card.querySelectorAll(".opt[data-do]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        onOption(card, id, btn.getAttribute("data-do"));
      });
    });
    var confirm = card.querySelector(".note .confirm");
    if (confirm) confirm.addEventListener("click", function () { commitNote(card, id); });
  }

  function onOption(card, id, code) {
    // toggle off if the same disposition is tapped again
    var cur = store.get(id);
    if (cur && cur.do === code && !NOTE_ACTIONS[code]) { clear(card, id); return; }
    if (NOTE_ACTIONS[code]) { openNote(card, id, code); return; }
    setDisposition(card, id, code, null);     // quick action: one-tap commit
    closeNote(card);
  }

  function openNote(card, id, code) {
    card.setAttribute("data-pending", code);
    selectButton(card, code);
    var note = card.querySelector(".note");
    if (!note) { setDisposition(card, id, code, null); return; } // no note ui -> commit bare
    note.querySelector("label").textContent = NOTE_ACTIONS[code];
    var ta = note.querySelector("textarea");
    var existing = store.get(id);
    ta.value = (existing && existing.note) ? existing.note : "";
    ta.style.minHeight = (code === "note") ? "120px" : "62px"; // delegation gets the roomiest box
    note.classList.add("show");
    try { ta.focus(); } catch (e) {}
  }

  function commitNote(card, id) {
    var code = card.getAttribute("data-pending");
    if (!code) return;
    var ta = card.querySelector(".note textarea");
    var text = (ta ? ta.value : "").trim();
    if (!OPTIONAL_NOTE[code] && !text) { try { ta.focus(); } catch (e) {} return; }
    setDisposition(card, id, code, text || null);
    closeNote(card);
  }

  function setDisposition(card, id, code, note) {
    var rec = { do: code };
    if (note) rec.note = note;
    store.set(id, rec);
    card.classList.add("is-set");
    selectButton(card, code);
    haptic("light");
    updateSend();
  }

  function clear(card, id) {
    store.delete(id);
    card.classList.remove("is-set");
    selectButton(card, null);
    closeNote(card);
    updateSend();
  }

  function selectButton(card, code) {
    card.querySelectorAll(".opt[data-do]").forEach(function (b) {
      b.classList.toggle("chosen", b.getAttribute("data-do") === code);
    });
  }

  function closeNote(card) {
    var note = card.querySelector(".note");
    if (note) note.classList.remove("show");
    card.removeAttribute("data-pending");
  }

  function buildPayload() {
    var actions = [];
    document.querySelectorAll(".triage-item[data-item-id]").forEach(function (card) {
      var id = card.getAttribute("data-item-id");
      var rec = store.get(id);
      if (rec) { var o = { id: id, do: rec.do }; if (rec.note) o.note = rec.note; actions.push(o); }
    });
    return { v: 1, triage: (window.__TRIAGE_ID__ || ""), session: new Date().toISOString(), actions: actions };
  }

  function byteLen(s) { return new TextEncoder().encode(s).length; }

  function send() {
    if (store.size === 0) return;
    var json = JSON.stringify(buildPayload());
    if (byteLen(json) > BYTE_LIMIT) {
      var m = "Too large (" + byteLen(json) + " bytes, limit " + BYTE_LIMIT + "). Shorten notes or send fewer.";
      tg ? tg.showPopup({ title: "Too large", message: m }) : alert(m); return;
    }
    if (tg) { try { tg.disableClosingConfirmation(); tg.sendData(json); return; } catch (e) {} }
    if (navigator.clipboard) navigator.clipboard.writeText(json).then(
      function () { alert("Copied payload (not launched as a keyboard Mini App):\n\n" + json); },
      function () { prompt("Copy payload:", json); });
    else prompt("Copy payload:", json);
  }

  function wireSend() {
    if (tg && tg.MainButton) { tg.MainButton.setText("Send to Hermes"); tg.MainButton.onClick(send); }
    var bar = document.querySelector(".sendbar"); if (bar) bar.addEventListener("click", send);
  }

  function updateSend() {
    var n = store.size, label = "Send " + n + " to Hermes";
    var bar = document.querySelector(".sendbar");
    if (bar) { var ns = bar.querySelector(".n"); if (ns) ns.textContent = String(n); }
    if (tg && tg.MainButton) { if (n > 0) { tg.MainButton.setText(label); tg.MainButton.show(); } else tg.MainButton.hide(); }
    if (tg) { try { n > 0 ? tg.enableClosingConfirmation() : tg.disableClosingConfirmation(); } catch (e) {} }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
