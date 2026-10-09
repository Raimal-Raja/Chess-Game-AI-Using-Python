const $ = (id) => document.getElementById(id);
const pieceNames = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};
const profiles = {
  1: { name: "Casual", skill: 3, full: false },
  2: { name: "Club", skill: 10, full: false },
  3: { name: "Expert", skill: 20, full: false },
  4: { name: "Maximum", skill: 20, full: true },
};
const engine = new StockfishClient();
let state = null,
  selected = null,
  busy = false,
  epoch = 0,
  flipped = false,
  pendingPromotion = null,
  hint = null;
let soundEnabled = false,
  audio = null;
let config = { mode: "ai", side: "white", level: 4, seconds: 8 },
  next = { ...config };
const imagePath = (p) =>
  "/pieces/" +
  (p === p.toUpperCase() ? "white_" : "black_") +
  pieceNames[p.toLowerCase()] +
  ".png";
try {
  if (localStorage.getItem("chess-theme") === "light")
    document.body.classList.add("light");
} catch {}
$("theme").textContent = document.body.classList.contains("light")
  ? "☾ Dark mode"
  : "☀ Light mode";
async function api(endpoint, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75000);
  try {
    const response = await fetch("/api/" + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(
        typeof data.detail === "string" ? data.detail : "Invalid game request.",
      );
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
function isHuman() {
  return config.mode === "local" || state.turn === config.side;
}
function save() {
  try {
    localStorage.setItem(
      "chess-studio-game",
      JSON.stringify({ moves: state.moves, config, flipped }),
    );
  } catch {}
}
function pieceImage(symbol) {
  const img = document.createElement("img");
  img.src = imagePath(symbol);
  img.alt = "";
  img.draggable = false;
  return img;
}
function render() {
  if (!state) return;
  const previousFocus = document.activeElement?.dataset.square;
  $("board").replaceChildren();
  const legal = selected
    ? state.legal_moves.filter((m) => m.startsWith(selected))
    : [];
  const last = state.moves.at(-1) || "";
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const file = flipped ? 7 - col : col,
        rank = flipped ? row + 1 : 8 - row,
        square = String.fromCharCode(97 + file) + rank,
        piece = state.pieces[square];
      const btn = document.createElement("button");
      btn.className = "square" + ((file + rank) % 2 === 1 ? " dark" : "");
      btn.dataset.square = square;
      btn.setAttribute(
        "aria-label",
        square +
          (piece
            ? " " +
              (piece === piece.toUpperCase() ? "white " : "black ") +
              pieceNames[piece.toLowerCase()]
            : " empty"),
      );
      btn.setAttribute("aria-pressed", String(square === selected));
      if (last.slice(0, 2) === square || last.slice(2, 4) === square)
        btn.classList.add("last");
      if (square === selected) btn.classList.add("selected");
      if (legal.some((m) => m.slice(2, 4) === square))
        btn.classList.add("legal");
      if (state.check && square === state.king) btn.classList.add("check");
      if (hint?.slice(0, 2) === square) btn.classList.add("hint-from");
      if (hint?.slice(2, 4) === square) btn.classList.add("hint-to");
      if (piece) {
        const img = pieceImage(piece);
        img.className = "piece piece-image";
        btn.append(img);
      }
      if (col === 0) {
        const el = document.createElement("span");
        el.className = "coord rank";
        el.textContent = rank;
        btn.append(el);
      }
      if (row === 7) {
        const el = document.createElement("span");
        el.className = "coord file";
        el.textContent = String.fromCharCode(97 + file);
        btn.append(el);
      }
      btn.onclick = () => clickSquare(square);
      btn.onkeydown = (event) => {
        const delta = {
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
          ArrowUp: [-1, 0],
          ArrowDown: [1, 0],
        }[event.key];
        if (delta) {
          event.preventDefault();
          const r = Math.max(0, Math.min(7, row + delta[0])),
            c = Math.max(0, Math.min(7, col + delta[1]));
          $("board").children[r * 8 + c].focus();
        }
      };
      $("board").append(btn);
    }
  if (previousFocus)
    $("board").querySelector(`[data-square="${previousFocus}"]`)?.focus();
  $("status").textContent = busy ? "Working on your position…" : state.status;
  $("indicator").textContent = state.game_over
    ? "● FINISHED"
    : busy
      ? "● THINKING"
      : "● LIVE";
  $("hint").textContent = state.game_over
    ? "A game to learn from. Ready for another?"
    : busy
      ? "Search runs on your device. The board will stay responsive."
      : isHuman()
        ? "Your turn. Select a piece to see its legal moves."
        : "Stockfish is ready for its next move.";
  $("undo").disabled = busy || !state.moves.length;
  $("export").disabled = !state.moves.length;
  $("analyse").disabled = busy || state.game_over || !isHuman();
  $("move-count").textContent = Math.ceil(state.history.length / 2) + " moves";
  if (state.history.length) {
    $("history").replaceChildren();
    for (let i = 0; i < state.history.length; i += 2) {
      const row = document.createElement("div");
      row.className = "history-row";
      for (const text of [
        i / 2 + 1 + ".",
        state.history[i],
        state.history[i + 1] || "—",
      ]) {
        const cell = document.createElement("span");
        cell.textContent = text;
        row.append(cell);
      }
      $("history").append(row);
    }
    $("history").scrollTop = $("history").scrollHeight;
  } else
    $("history").innerHTML =
      '<div class="empty"><span>♘</span><p>Every great game starts<br>with a single move.</p></div>';
  const top = flipped ? "white" : "black",
    bottom = flipped ? "black" : "white";
  for (const [prefix, side] of [
    ["opponent", top],
    ["you", bottom],
  ]) {
    $(prefix + "-name").textContent =
      config.mode === "local"
        ? side === "white"
          ? "White player"
          : "Black player"
        : side === config.side
          ? "You"
          : "Stockfish 19";
    $(prefix + "-detail").textContent =
      side[0].toUpperCase() +
      side.slice(1) +
      " · " +
      (config.mode === "ai" && side !== config.side
        ? profiles[config.level].name
        : "Make it count");
  }
  for (const [place, side] of [
    ["top", top],
    ["bottom", bottom],
  ]) {
    $(place + "-tag").textContent =
      config.mode === "local"
        ? "PLAYER"
        : side === config.side
          ? "YOUR SIDE"
          : "OPPONENT";
    $(place + "-captures").replaceChildren(
      ...(state.captures?.[side] || []).map(pieceImage),
    );
  }
}
function clearInsight() {
  hint = null;
  $("evaluation").textContent = "—";
  $("eval-fill").style.width = "50%";
  $("depth").textContent = "—";
  $("nodes").textContent = "—";
  $("engine-status").textContent = "Ready when you are.";
  $("principal-line").textContent = "The next chapter is unwritten.";
}
function insight(info, turn) {
  if (info.depth) $("depth").textContent = info.depth;
  if (info.nodes)
    $("nodes").textContent = Intl.NumberFormat("en", {
      notation: "compact",
    }).format(info.nodes);
  if (info.score) {
    const white = info.score.value * (turn === "white" ? 1 : -1);
    $("evaluation").textContent =
      info.score.type === "mate"
        ? "Mate " + (white > 0 ? "+" : "") + white
        : (white >= 0 ? "+" : "") + (white / 100).toFixed(2);
    $("eval-fill").style.width =
      (info.score.type === "mate"
        ? white > 0
          ? 98
          : 2
        : 50 + 48 * Math.tanh(white / 500)) + "%";
  }
  if (info.pv.length)
    $("principal-line").textContent = info.pv
      .slice(0, 6)
      .map(
        (m) =>
          m.slice(0, 2) +
          " → " +
          m.slice(2, 4) +
          (m[4] ? " = " + m[4].toUpperCase() : ""),
      )
      .join("  ·  ");
}
function beep(capture = false) {
  if (!soundEnabled) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
    const oscillator = audio.createOscillator(),
      gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = capture ? 320 : 520;
    gain.gain.setValueAtTime(0.06, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.13);
  } catch {}
}
function clickSquare(square) {
  if (busy || state.game_over || !isHuman() || pendingPromotion) return;
  const candidates = selected
    ? state.legal_moves.filter((m) => m.startsWith(selected + square))
    : [];
  if (candidates.length > 1) {
    pendingPromotion = candidates;
    $("promotion-options").replaceChildren();
    for (const move of candidates) {
      const btn = document.createElement("button");
      btn.append(
        pieceImage(state.turn === "white" ? move[4].toUpperCase() : move[4]),
      );
      btn.setAttribute("aria-label", "Promote to " + pieceNames[move[4]]);
      btn.onclick = () => {
        $("promotion").close();
        pendingPromotion = null;
        play(move);
      };
      $("promotion-options").append(btn);
    }
    $("promotion").showModal();
    return;
  }
  if (candidates.length === 1) {
    play(candidates[0]);
    return;
  }
  const p = state.pieces[square];
  selected =
    p &&
    (p === p.toUpperCase()) === (state.turn === "white") &&
    selected !== square
      ? square
      : null;
  render();
}
async function play(move) {
  const token = epoch;
  busy = true;
  selected = null;
  hint = null;
  $("error").textContent = "";
  $("retry").hidden = true;
  render();
  try {
    const result = await api("move", { moves: state.moves, move });
    if (token !== epoch) return;
    beep(result.history.at(-1).includes("x"));
    state = result;
    busy = false;
    save();
    render();
    await runAI();
  } catch (error) {
    if (token === epoch) {
      busy = false;
      $("error").textContent = error.message;
      render();
    }
  }
}
async function searchPosition(token) {
  const turn = state.turn,
    profile = profiles[config.level];
  $("engine-version").textContent = profile.full
    ? "STOCKFISH 19 · FULL"
    : "STOCKFISH 19 · LITE";
  return engine.search({
    moves: [...state.moves],
    full: profile.full,
    skill: profile.skill,
    seconds: config.seconds,
    onStatus: (text) => {
      if (token === epoch) $("engine-status").textContent = text;
    },
    onInfo: (info) => {
      if (token === epoch) insight(info, turn);
    },
  });
}
async function runAI() {
  if (config.mode !== "ai" || state.game_over || isHuman()) return;
  const token = epoch;
  busy = true;
  render();
  try {
    const move = await searchPosition(token);
    if (token !== epoch) return;
    if (!state.legal_moves.includes(move))
      throw Error(
        "Stockfish returned an illegal move. The board was preserved.",
      );
    const result = await api("move", { moves: state.moves, move });
    if (token !== epoch) return;
    beep(result.history.at(-1).includes("x"));
    state = result;
    save();
    $("engine-status").textContent =
      "Search complete · " + config.seconds + " seconds per move";
  } catch (error) {
    if (token === epoch) {
      $("error").textContent = error.message;
      $("retry").hidden = false;
    }
  } finally {
    if (token === epoch) {
      busy = false;
      render();
    }
  }
}
$("analyse").onclick = async () => {
  if (busy || state.game_over || !isHuman()) return;
  const token = epoch;
  busy = true;
  selected = null;
  $("error").textContent = "";
  render();
  try {
    const move = await searchPosition(token);
    if (token !== epoch) return;
    if (!state.legal_moves.includes(move))
      throw Error("No legal hint was returned.");
    hint = move;
    $("engine-status").textContent = "Suggested move highlighted in gold.";
  } catch (error) {
    if (token === epoch) $("error").textContent = error.message;
  } finally {
    if (token === epoch) {
      busy = false;
      render();
    }
  }
};
function syncSettings() {
  document
    .querySelectorAll("[data-mode]")
    .forEach((b) => b.classList.toggle("active", b.dataset.mode === next.mode));
  document
    .querySelectorAll("[data-side]")
    .forEach((b) => b.classList.toggle("active", b.dataset.side === next.side));
  $("level").value = next.level;
  $("thinking").value = next.seconds;
  $("ai-settings").hidden = next.mode !== "ai";
}
async function newGame(saved = null) {
  const token = ++epoch;
  engine.cancel();
  busy = true;
  selected = null;
  pendingPromotion = null;
  $("promotion").close();
  config = saved ? saved.config : { ...next };
  next = { ...config };
  flipped = saved
    ? !!saved.flipped
    : config.mode === "ai" && config.side === "black";
  $("error").textContent = "";
  $("retry").hidden = true;
  clearInsight();
  syncSettings();
  render();
  try {
    const result = await api("state", { moves: saved ? saved.moves : [] });
    if (token !== epoch) return;
    state = result;
    busy = false;
    save();
    render();
    await runAI();
  } catch (error) {
    if (token === epoch) {
      busy = false;
      $("error").textContent = error.message + " Click New game to retry.";
    }
  }
}
$("new").onclick = () => newGame();
$("retry").onclick = () => {
  $("error").textContent = "";
  $("retry").hidden = true;
  runAI();
};
$("undo").onclick = async () => {
  if (busy || !state.moves.length) return;
  const token = ++epoch;
  engine.cancel();
  busy = true;
  selected = null;
  hint = null;
  let count = 1;
  if (config.mode === "ai" && state.turn === config.side) count = 2;
  try {
    const result = await api("state", {
      moves: state.moves.slice(0, Math.max(0, state.moves.length - count)),
    });
    if (token !== epoch) return;
    state = result;
    busy = false;
    clearInsight();
    save();
    render();
    await runAI();
  } catch (error) {
    if (token === epoch) {
      busy = false;
      $("error").textContent = error.message;
      render();
    }
  }
};
$("flip").onclick = () => {
  flipped = !flipped;
  save();
  render();
};
$("export").onclick = () => {
  const url = URL.createObjectURL(
    new Blob([state.pgn], { type: "application/x-chess-pgn" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "chess-studio.pgn";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("sound").onclick = () => {
  soundEnabled = !soundEnabled;
  $("sound").textContent = soundEnabled ? "♪ Sound on" : "♪ Sound off";
  $("sound").setAttribute("aria-pressed", String(soundEnabled));
  beep();
};
for (const btn of document.querySelectorAll("[data-mode]"))
  btn.onclick = () => {
    next.mode = btn.dataset.mode;
    syncSettings();
  };
for (const btn of document.querySelectorAll("[data-side]"))
  btn.onclick = () => {
    next.side = btn.dataset.side;
    syncSettings();
  };
$("level").onchange = () => (next.level = Number($("level").value));
$("thinking").onchange = () => (next.seconds = Number($("thinking").value));
$("theme").onclick = () => {
  document.body.classList.toggle("light");
  try {
    localStorage.setItem(
      "chess-theme",
      document.body.classList.contains("light") ? "light" : "dark",
    );
  } catch {}
  $("theme").textContent = document.body.classList.contains("light")
    ? "☾ Dark mode"
    : "☀ Light mode";
};
$("cancel-promotion").onclick = () => {
  $("promotion").close();
  pendingPromotion = null;
};
$("promotion").addEventListener("cancel", () => (pendingPromotion = null));
let saved = null;
try {
  const candidate = JSON.parse(localStorage.getItem("chess-studio-game"));
  if (
    candidate &&
    Array.isArray(candidate.moves) &&
    candidate.moves.length <= 600 &&
    ["ai", "local"].includes(candidate.config?.mode) &&
    ["white", "black"].includes(candidate.config?.side) &&
    profiles[candidate.config?.level] &&
    [1, 3, 8, 15].includes(candidate.config?.seconds)
  )
    saved = candidate;
} catch {}
newGame(saved);
window.addEventListener("pagehide", () => engine.cancel());
