/* ==========================================================================
   DAegis — client app. Zero dependencies. Everything on-chain is read live
   from X Layer testnet over plain JSON-RPC; the published reasoning is verified
   in-browser against the on-chain reasonHash via keccak.js. Nothing is faked.
   ========================================================================== */
(function () {
  "use strict";

  var CFG = {
    RPCS: [
      "https://testrpc.xlayer.tech/terigon",
      "https://xlayertestrpc.okx.com/terigon"
    ],
    CHAIN_ID: 1952,
    REGISTRY: "0x7f9C1eB88cB6cc7D098a3ba1aDe13b57761b48D9",
    GUARDED: "0x273650d9001F1C7dD6Ba098C22cBA045743c9DDf",
    TOKEN: "0x28EF702C621DD0B82Ae5bB0753C3A3C1D875a20E",
    DRAINER: "0xe9eb89da7a2dF4Bd1A644d737bAEFf1dDE87F7D5",
    ISFLAGGED_SEL: "0xfef48a99",       // isFlagged(address)
    ALLOWANCE_SEL: "0xdd62ed3e",       // allowance(address,address)
    SPENDER_FLAGGED_T0: "0x1622652812ae33b546ef6ca7b83827299454f9945ce4de6a85401062db7afe0b",
    EXPLORER: "https://www.okx.com/web3/explorer/xlayer-test",
    HERO_APPROVE_TX: "0x8137a8a7578ddfa58b3c5c34f97654c20d28ea42e70e2caee4872ef4781d5ad0",
    HERO_REVOKE_TX: "0xbf96b638e8dffb62cf6561e1dbd04e4bf7d08c48331ef0d192d807e5ed4ace2f",
    LOG_CHUNK: 100,       // RPC caps eth_getLogs span at 100
    TAIL_BLOCKS: 2000     // recent window scanned for flags beyond the seed
  };

  var ZERO32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

  // ------------------------------------------------------------------ rpc
  var rpcIdx = 0;
  function rpc(method, params) {
    var attempt = function (which, triedBackup) {
      return fetch(CFG.RPCS[which], {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params })
      }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }).then(function (j) {
        if (j.error) throw new Error(j.error.message || "rpc error");
        rpcIdx = which;
        return j.result;
      }).catch(function (e) {
        if (!triedBackup && CFG.RPCS[which + 1]) return attempt(which + 1, true);
        throw e;
      });
    };
    return attempt(rpcIdx, false);
  }

  // --------------------------------------------------------------- helpers
  function pad32(addr) { return addr.toLowerCase().replace(/^0x/, "").padStart(64, "0"); }
  function wordAt(hex, i) { return hex.slice(i * 64, i * 64 + 64); }
  function toInt(word) { return parseInt(word, 16); }        // safe for uint8 / small
  function toBig(word) { return BigInt("0x" + word); }
  function hexBlock(n) { return "0x" + n.toString(16); }
  function short(a) { return a.slice(0, 6) + "…" + a.slice(-4); }
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function isAddr(s) { return /^0x[0-9a-fA-F]{40}$/.test(s.trim()); }
  function txUrl(h) { return CFG.EXPLORER + "/tx/" + h; }
  function addrUrl(a) { return CFG.EXPLORER + "/address/" + a; }
  function riskClass(risk, verdict) {
    if (verdict === "malicious") return "mal";
    if (verdict === "suspicious") return "sus";
    if (verdict === "benign") return "ben";
    return risk >= 75 ? "mal" : "sus"; // fallback when no published verdict label
  }
  function riskLabel(cls) { return { mal: "malicious", sus: "suspicious", ben: "benign" }[cls] || "flagged"; }

  // ------------------------------------------------------------ contract reads
  function isFlagged(spender) {
    var data = CFG.ISFLAGGED_SEL + pad32(spender);
    return rpc("eth_call", [{ to: CFG.REGISTRY, data: data }, "latest"]).then(function (ret) {
      var h = ret.replace(/^0x/, "");
      return {
        flagged: toBig(wordAt(h, 0)) !== 0n,
        risk: toInt(wordAt(h, 1)),
        reasonHash: "0x" + wordAt(h, 2)
      };
    });
  }

  function allowance(owner, spender, token) {
    var data = CFG.ALLOWANCE_SEL + pad32(owner) + pad32(spender);
    return rpc("eth_call", [{ to: token, data: data }, "latest"]).then(function (ret) {
      return toBig(ret.replace(/^0x/, ""));
    });
  }

  // Bounded recent scan for SpenderFlagged, chunked to the RPC's 100-block cap.
  function tailScan(fromBlock, toBlock) {
    var out = [];
    var seq = Promise.resolve();
    for (var start = fromBlock; start <= toBlock; start += CFG.LOG_CHUNK) {
      (function (s) {
        var e = Math.min(s + CFG.LOG_CHUNK, toBlock);
        seq = seq.then(function () {
          return rpc("eth_getLogs", [{
            address: CFG.REGISTRY, topics: [CFG.SPENDER_FLAGGED_T0],
            fromBlock: hexBlock(s), toBlock: hexBlock(e)
          }]).then(function (logs) {
            logs.forEach(function (lg) {
              var d = lg.data.replace(/^0x/, "");
              out.push({
                spender: "0x" + lg.topics[1].slice(26),
                risk: toInt(wordAt(d, 0)),
                reasonHash: "0x" + wordAt(d, 1),
                block: parseInt(lg.blockNumber, 16),
                tx: lg.transactionHash
              });
            });
          }).catch(function () { /* one bad chunk shouldn't kill the scan */ });
        });
      })(start);
    }
    return seq.then(function () { return out; });
  }

  // Fetch the published reasoning and verify it against the on-chain hash.
  var reasonCache = {};
  function loadReasoning(reasonHash) {
    if (reasonHash === ZERO32) return Promise.resolve({ available: false });
    if (reasonCache[reasonHash]) return reasonCache[reasonHash];
    var p = fetch("verdicts/" + reasonHash + ".json").then(function (r) {
      if (!r.ok) return { available: false };
      return r.json().then(function (j) {
        var computed = self.keccak256(j.reasoning);
        return {
          available: true,
          reasoning: j.reasoning,
          verdict: j.verdict,
          risk: j.risk_score,
          token: j.token,
          owner: j.owner,
          flaggedTx: j.flagged_tx,
          flaggedBlock: j.flagged_block,
          verified: computed.toLowerCase() === reasonHash.toLowerCase()
        };
      });
    }).catch(function () { return { available: false }; });
    reasonCache[reasonHash] = p;
    return p;
  }

  // ------------------------------------------------------------ registry view
  function verifiedBadge(r) {
    if (!r.available) return '<span class="verified bad">reasoning not published</span>';
    if (r.verified) return '<span class="verified">✓ reasoning verified against on-chain hash</span>';
    return '<span class="verified bad">⚠ reasoning does not match on-chain hash</span>';
  }

  function registryRow(entry) {
    var cls = riskClass(entry.risk, entry.reason && entry.reason.verdict);
    var label = (entry.reason && entry.reason.available && entry.reason.verdict) || riskLabel(cls);
    var reasoning = entry.reason && entry.reason.available && entry.reason.verified
      ? entry.reason.reasoning
      : (entry.reason && entry.reason.available ? entry.reason.reasoning : "Recorded on-chain; reasoning document not published to this site.");
    var flaggedBlock = (entry.reason && entry.reason.flaggedBlock) || entry.block;
    var flaggedTx = (entry.reason && entry.reason.flaggedTx) || entry.tx;

    var meta = '<span>risk ' + entry.risk + '/100</span>' +
      '<span>reasonHash ' + short(entry.reasonHash) + '</span>' +
      (flaggedTx ? '<a href="' + txUrl(flaggedTx) + '" target="_blank" rel="noopener">flagging tx ↗</a>' : '') +
      (flaggedBlock ? '<span>block ' + Number(flaggedBlock).toLocaleString() + '</span>' : '') +
      verifiedBadge(entry.reason || { available: false });

    return el(
      '<div class="reg-row">' +
      '<span class="reg-badge ' + cls + '"><span class="rb-score">' + entry.risk + '</span><span class="rb-label">' + esc(label) + '</span></span>' +
      '<div class="reg-main">' +
      '<span class="reg-addr"><a href="' + addrUrl(entry.spender) + '" target="_blank" rel="noopener" class="mono">' + esc(entry.spender) + '</a>' +
      '<button class="copybtn" data-copy="' + entry.spender + '">copy</button></span>' +
      '<p class="reg-reason">' + esc(reasoning) + '</p>' +
      '<div class="reg-meta">' + meta + '</div>' +
      '</div>' +
      '<span class="reg-side">' + riskLabel(cls) + '</span>' +
      '</div>'
    );
  }

  function renderRegistry(entries, foot) {
    var list = document.getElementById("registry-list");
    list.innerHTML = "";
    if (!entries.length) {
      list.appendChild(el('<div class="reg-empty">No live verdicts returned. The registry may be empty, or the RPC is unreachable.</div>'));
    } else {
      entries.sort(function (a, b) { return b.risk - a.risk; });
      entries.forEach(function (e) { list.appendChild(registryRow(e)); });
    }
    document.getElementById("registry-foot").textContent = foot;
  }

  function loadRegistry() {
    var seen = {};
    var seedP = fetch("flags.json").then(function (r) { return r.ok ? r.json() : { spenders: [] }; })
      .catch(function () { return { spenders: [] }; });

    Promise.all([seedP, rpc("eth_blockNumber", [])]).then(function (res) {
      var seed = (res[0].spenders || []);
      var head = parseInt(res[1], 16);
      var from = Math.max(0, head - CFG.TAIL_BLOCKS);

      // Seed: read each spender's verdict LIVE.
      var seedReads = seed.map(function (addr) {
        return isFlagged(addr).then(function (v) {
          if (!v.flagged) return null;
          seen[addr.toLowerCase()] = true;
          return loadReasoning(v.reasonHash).then(function (reason) {
            return { spender: addr.toLowerCase(), risk: v.risk, reasonHash: v.reasonHash, reason: reason };
          });
        }).catch(function () { return null; });
      });

      // Tail: recent SpenderFlagged not already in the seed.
      var tailP = tailScan(from, head).then(function (logs) {
        var extra = [];
        logs.forEach(function (l) {
          if (seen[l.spender.toLowerCase()]) return;
          seen[l.spender.toLowerCase()] = true;
          extra.push(l);
        });
        return Promise.all(extra.map(function (l) {
          // confirm current state (a later record could have changed it)
          return isFlagged(l.spender).then(function (v) {
            if (!v.flagged) return null;
            return loadReasoning(v.reasonHash).then(function (reason) {
              return { spender: l.spender.toLowerCase(), risk: v.risk, reasonHash: v.reasonHash, reason: reason, block: l.block, tx: l.tx };
            });
          }).catch(function () { return null; });
        }));
      }).catch(function () { return []; });

      Promise.all([Promise.all(seedReads), tailP]).then(function (parts) {
        var all = parts[0].concat(parts[1]).filter(Boolean);
        renderRegistry(all, "Read live from ThreatRegistry at block " + head.toLocaleString() +
          " · " + all.length + " spender" + (all.length === 1 ? "" : "s") + " flagged · reasoning verified in your browser.");
      });
    }).catch(function () {
      document.getElementById("registry-list").innerHTML =
        '<div class="reg-empty">Couldn\'t reach the X Layer RPC. Check your connection and reload.</div>';
    });
  }

  // ----------------------------------------------------------------- checker
  function renderCheck(addr, v, reason) {
    var box = document.getElementById("check-result");
    if (!v.flagged) {
      box.innerHTML = "";
      box.appendChild(el(
        '<div class="result-card clear">' +
        '<span class="rc-badge reg-badge ben"><span class="rb-score">✓</span><span class="rb-label">clear</span></span>' +
        '<span class="rc-verdict clear">Not flagged</span>' +
        '<span class="rc-addr">' + esc(addr) + '</span>' +
        '<p class="rc-reason">DAegis has not recorded a verdict against this spender. That is not a guarantee it is safe — only that the agent has not judged it. Approvals are risky by default; grant the smallest allowance you can.</p>' +
        '</div>'
      ));
      return;
    }
    var cls = riskClass(v.risk, reason.available && reason.verdict);
    var label = (reason.available && reason.verdict) || riskLabel(cls);
    var text = reason.available
      ? reason.reasoning
      : "Recorded on-chain (risk " + v.risk + "/100). The reasoning document is not published to this site.";
    box.innerHTML = "";
    box.appendChild(el(
      '<div class="result-card ' + cls + '">' +
      '<span class="rc-badge reg-badge ' + cls + '"><span class="rb-score">' + v.risk + '</span><span class="rb-label">' + esc(label) + '</span></span>' +
      '<span class="rc-verdict ' + cls + '">Flagged ' + esc(label) + '</span>' +
      '<span class="rc-addr">' + esc(addr) + '</span>' +
      '<p class="rc-reason">' + esc(text) + '</p>' +
      '<div class="rc-foot">' + verifiedBadge(reason) +
      ' · <a href="' + addrUrl(addr) + '" target="_blank" rel="noopener">view spender ↗</a></div>' +
      '</div>'
    ));
  }

  function runCheck(raw) {
    var box = document.getElementById("check-result");
    var addr = raw.trim();
    if (!isAddr(addr)) {
      box.innerHTML = '<p class="check-error">That doesn\'t look like a 20-byte address (0x + 40 hex).</p>';
      return;
    }
    box.innerHTML = '<p class="check-busy">Asking the registry…</p>';
    isFlagged(addr).then(function (v) {
      if (!v.flagged) { renderCheck(addr, v, { available: false }); return; }
      loadReasoning(v.reasonHash).then(function (reason) { renderCheck(addr, v, reason); });
    }).catch(function (e) {
      box.innerHTML = '<p class="check-error">Couldn\'t reach the RPC: ' + esc(e.message) + '</p>';
    });
  }

  // ------------------------------------------------------------------- hero
  function wireHero() {
    var a = document.getElementById("hero-approve-link");
    var r = document.getElementById("hero-revoke-link");
    if (a) a.href = txUrl(CFG.HERO_APPROVE_TX);
    if (r) r.href = txUrl(CFG.HERO_REVOKE_TX);

    // draw the ledger once it scrolls in
    var ledger = document.querySelector(".ledger");
    if (ledger) {
      if (!("IntersectionObserver" in window)) ledger.classList.add("is-drawn");
      else {
        var io = new IntersectionObserver(function (ents) {
          ents.forEach(function (en) { if (en.isIntersecting) { ledger.classList.add("is-drawn"); io.disconnect(); } });
        }, { threshold: 0.35 });
        io.observe(ledger);
      }
    }

    // live "still zero" allowance
    var out = document.getElementById("hero-allowance");
    allowance(CFG.GUARDED, CFG.DRAINER, CFG.TOKEN).then(function (a) {
      if (out) out.textContent = a === 0n ? "0" : a.toString();
    }).catch(function () {
      var live = document.getElementById("hero-live");
      if (live) live.style.display = "none";
    });
  }

  // ------------------------------------------------------------------ header
  function wireHead() {
    var pill = document.getElementById("net-pill");
    var text = document.getElementById("net-text");
    rpc("eth_blockNumber", []).then(function (b) {
      pill.classList.add("is-live");
      text.textContent = "X Layer testnet · #" + parseInt(b, 16).toLocaleString();
    }).catch(function () {
      pill.classList.add("is-down");
      text.textContent = "RPC unreachable";
    });
  }

  // -------------------------------------------------------------- misc wiring
  function wireContracts() {
    var reg = document.getElementById("cc-registry");
    var gu = document.getElementById("cc-guarded");
    if (reg) reg.href = addrUrl(CFG.REGISTRY);
    if (gu) gu.href = addrUrl(CFG.GUARDED);
  }

  function wireCopy() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-copy]");
      if (b && navigator.clipboard) {
        navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function () {
          var t = b.textContent; b.textContent = "copied"; setTimeout(function () { b.textContent = t; }, 1200);
        });
      }
    });
    var cc = document.getElementById("copy-curl");
    if (cc) cc.addEventListener("click", function () {
      var code = document.getElementById("curl-snippet").innerText;
      if (navigator.clipboard) navigator.clipboard.writeText(code).then(function () {
        cc.textContent = "copied"; setTimeout(function () { cc.textContent = "Copy"; }, 1200);
      });
    });
  }

  function wireChecker() {
    var form = document.getElementById("checker");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); runCheck(document.getElementById("check-input").value); });
    document.querySelectorAll(".chip[data-addr]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        var a = chip.getAttribute("data-addr");
        document.getElementById("check-input").value = a;
        runCheck(a);
        document.getElementById("check-result").scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    });
  }

  function wireReveals() {
    if (!("IntersectionObserver" in window)) return;
    var loop = document.getElementById("loop");
    if (loop) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) { if (en.isIntersecting) { loop.classList.add("is-in"); io.disconnect(); } });
      }, { threshold: 0.3 });
      io.observe(loop);
    }
  }

  // --------------------------------------------------------------------- init
  function init() {
    wireHead();
    wireHero();
    wireContracts();
    wireCopy();
    wireChecker();
    wireReveals();
    loadRegistry();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
