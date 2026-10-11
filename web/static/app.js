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
const game = new BrowserGame();
const sounds = new ChessSound();
let busyReason = null, journalKey = null;
let state = null,
  selected = null,
  busy = false,
  epoch = 0,
  flipped = false,
  pendingPromotion = null,
  hint = null;
document.addEventListener("pointerdown", () => sounds.unlock(), {capture: true});
document.addEventListener("keydown", () => sounds.unlock(), {capture: true});
function soundLabel() {
  $("sound").textContent = sounds.enabled ? "♪ Sound on" : "♪ Sound off";
  $("sound").setAttribute("aria-pressed", String(sounds.enabled));
}
soundLabel();
let config = { mode: "ai", side: "white", level: 2, seconds: 1 },
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
function isHuman() {
  return config.mode === "local" || state.turn === config.side;
}
function save() {
  try {
    localStorage.setItem(
      "chess-studio-game",
      JSON.stringify({ version: 2, moves: state.moves, config, flipped }),
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
  const board = $("board");
  board.setAttribute("aria-busy", String(busy));
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
      const index = row * 8 + col;
      const btn = board.children[index] || document.createElement("button");
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
      if (btn.dataset.piece !== (piece || "") || btn.dataset.coordinate !== square) {
        btn.replaceChildren();
        if (piece) {
          const img = pieceImage(piece); img.className = "piece piece-image"; btn.append(img);
        }
        if (col === 0) {
          const el = document.createElement("span"); el.className = "coord rank"; el.textContent = rank; btn.append(el);
        }
        if (row === 7) {
          const el = document.createElement("span"); el.className = "coord file";
          el.textContent = String.fromCharCode(97 + file); btn.append(el);
        }
        btn.dataset.piece = piece || ""; btn.dataset.coordinate = square;
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
      if (!btn.parentElement) board.append(btn);
    }
  if (previousFocus)
    $("board").querySelector(`[data-square="${previousFocus}"]`)?.focus();
  $("status").textContent = busy ? (busyReason === "hint" ? "Finding a hint…" : "Stockfish is thinking…") : state.status;
  $("indicator").textContent = state.game_over
    ? "● FINISHED"
    : busy
      ? "● THINKING"
      : "● LIVE";
  $("hint").textContent = state.game_over
    ? "A game to learn from. Ready for another?"
    : busy
      ? (busyReason === "hint" ? "You can make a move while the hint loads." : "Undo or start a new game to cancel the search.")
      : isHuman()
        ? "Your turn. Select a piece to see its legal moves."
        : "Stockfish is ready for its next move.";
  $("undo").disabled = !state.moves.length;
  $("board-undo").disabled = !state.moves.length;
  $("board-message").textContent = busy ? (busyReason === "hint" ? "Finding a hint · tap a piece to keep playing." : "AI is thinking · Undo is available.") : state.game_over ? state.status : isHuman() ? "Your turn · tap a piece, then its destination." : "AI paused · retry below or undo.";
  $("export").disabled = !state.moves.length;
  $("analyse").disabled = busy || state.game_over || !isHuman();
  $("move-count").textContent = Math.ceil(state.history.length / 2) + " moves";
  const nextJournalKey = state.history.join(" ");
  if (journalKey !== nextJournalKey) {
  journalKey = nextJournalKey;
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
  }
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
function moveSound(move) {
  const kind = state.game_over ? "end" : state.check ? "check" : move.captured ? "capture" : "move";
  sounds.play(kind);
}
function interruptHint() {
  if (busy && busyReason === "hint") {
    ++epoch; engine.cancel(); busy = false; busyReason = null;
    $("error").textContent = "";
  }
}
function clickSquare(square) {
  if (!state || state.game_over || !isHuman() || pendingPromotion) return;
  interruptHint();
  if (busy) return;
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
function play(move) {
  if (busy || !state || !state.legal_moves.includes(move)) return;
  selected = null; hint = null;
  $("error").textContent = ""; $("retry").hidden = true;
  try {
    const played = game.move(move);
    state = game.snapshot();
    save(); render(); moveSound(played);
    runAI();
  } catch (error) {
    $("error").textContent = error.message; render();
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
  busy = true; busyReason = "ai";
  render();
  try {
    const move = await searchPosition(token);
    if (token !== epoch) return;
    if (!state.legal_moves.includes(move))
      throw Error(
        "Stockfish returned an illegal move. The board was preserved.",
      );
    const played = game.move(move);
    state = game.snapshot();
    moveSound(played);
    save();
    $("engine-status").textContent =
      "Search complete · " + config.seconds + " seconds per move";
  } catch (error) {
    if (token === epoch) {
      $("error").textContent = error.message;
      $("retry").hidden = false;
      $("retry").textContent = config.level === 4 ? "Retry with faster engine" : "Retry engine";
    }
  } finally {
    if (token === epoch) {
      busy = false; busyReason = null;
      render();
    }
  }
}
$("analyse").onclick = async () => {
  if (busy || state.game_over || !isHuman()) return;
  const token = epoch;
  busy = true; busyReason = "hint";
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
      busy = false; busyReason = null;
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
    state = game.restore(saved ? saved.moves : []);
    busy = false; busyReason = null;
    save();
    render();
    if (!saved) sounds.play("start");
    runAI();
  } catch (error) {
    if (token === epoch) {
      busy = false;
      render();
      $("error").textContent = error.message + " Click New game to retry.";
    }
  }
}
$("new").onclick = () => newGame();
$("retry").onclick = () => {
  if (config.level === 4) {
    config = { ...config, level: 2, seconds: 1 };
    next = { ...config };
    syncSettings();
    save();
  }
  $("error").textContent = "";
  $("retry").hidden = true;
  runAI();
};
$("undo").onclick = async () => {
  if (!state || !state.moves.length) return;
  const token = ++epoch;
  engine.cancel();
  busy = true;
  selected = null;
  hint = null;
  let count = 1;
  if (config.mode === "ai" && state.turn === config.side) count = 2;
  try {
    state = game.restore(state.moves.slice(0, Math.max(0, state.moves.length - count)));
    busy = false; busyReason = null;
    clearInsight();
    save();
    render();
    runAI();
  } catch (error) {
    if (token === epoch) {
      busy = false;
      $("error").textContent = error.message;
      render();
    }
  }
};
$("board-undo").onclick = () => $("undo").click();
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
  sounds.toggle(); soundLabel(); sounds.play("move");
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
  if (saved && saved.version !== 2) {
    saved.config = { ...saved.config,
      level: saved.config.level === 4 ? 2 : saved.config.level,
      seconds: saved.config.seconds === 8 ? 1 : saved.config.seconds };
  }
} catch {}
newGame(saved);
window.addEventListener("pagehide", () => {
  ++epoch;
  engine.cancel();
  engine.dispose();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && state && !state.game_over) {
    busy = false;
    render();
    runAI();
  }
});

// Fit the actual board and its nearby controls, rather than guessing a height cap.
let boardFitFrame;
function scheduleBoardFit() {
  cancelAnimationFrame(boardFitFrame);
  boardFitFrame = requestAnimationFrame(() => {
    const area = document.querySelector('.play-area');
    if (innerWidth < 600 && innerHeight >= innerWidth) {
      area.style.removeProperty('--board-fit');
      return;
    }
    const frame = document.querySelector('.board-frame').getBoundingClientRect();
    const footer = document.querySelector('.board-footer').getBoundingClientRect();
    const bottomControls = footer.bottom - frame.bottom;
    const viewport = window.visualViewport;
    const bottom = viewport ? viewport.height + viewport.offsetTop : innerHeight;
    const top = document.querySelector('.workspace').getBoundingClientRect().top;
    const topPlayer = document.querySelector('.play-area > .player').getBoundingClientRect().height;
    const available = Math.max(160, Math.floor(bottom - top - topPlayer - bottomControls - 12));
    const nextFit = available + 'px';
    if (area.style.getPropertyValue('--board-fit') !== nextFit)
      area.style.setProperty('--board-fit', nextFit);
  });
}
window.addEventListener('resize', scheduleBoardFit);
window.visualViewport?.addEventListener('resize', scheduleBoardFit);
if (typeof ResizeObserver !== 'undefined') {
  const layoutObserver = new ResizeObserver(scheduleBoardFit);
  for (const element of document.querySelectorAll('header, .intro, .workspace, .player, .board-footer'))
    layoutObserver.observe(element);
}
scheduleBoardFit();
