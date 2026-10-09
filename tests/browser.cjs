const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("fs");
(async () => {
  const args = process.env.CHESS_CHROMIUM_ARGS
    ? JSON.parse(process.env.CHESS_CHROMIUM_ARGS)
    : [];
  const browser = await chromium.launch({
    headless: true,
    args,
    ...(process.env.CHESS_CHROMIUM_PATH
      ? { executablePath: process.env.CHESS_CHROMIUM_PATH }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(process.env.CHESS_TEST_URL || "http://127.0.0.1:8000");
  await page.waitForSelector('[data-square="e2"]');
  await page.focus('[data-square="e2"]');
  await page.keyboard.press("ArrowRight");
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.square),
    "f2",
  );
  assert(
    await page
      .locator('[data-square="a1"]')
      .evaluate((e) => e.classList.contains("dark")),
  );
  await page.selectOption("#thinking", "1");
  await page.click("#new");
  await page.waitForFunction(
    () => document.querySelector("#status").textContent === "White to move",
  );
  await page.click('[data-square="e2"]');
  await page.click('[data-square="e4"]');
  await page.waitForFunction(
    () =>
      document.querySelector("#history").textContent.includes("e4") &&
      document.querySelector("#status").textContent === "White to move",
    {},
    { timeout: 120000 },
  );
  assert(!(await page.locator("#retry").isVisible()));
  assert(Number(await page.locator("#depth").textContent()) > 0);
  console.log(
    "PASS: actual full Stockfish WASM loaded and played Black; telemetry displayed.",
  );
  await page.click("#undo");
  await page.waitForFunction(
    () => document.querySelector("#move-count").textContent === "0 moves",
  );
  await page.selectOption("#level", "3");
  await page.click('[data-side="black"]');
  await page.click("#new");
  await page.waitForFunction(
    () => document.querySelector("#status").textContent === "Black to move",
    {},
    { timeout: 120000 },
  );
  assert.equal(
    await page.locator("#board button").first().getAttribute("data-square"),
    "h1",
  );
  console.log(
    "PASS: Lite Stockfish played White, board rotated for human Black.",
  );
  await page.click('[data-square="e7"]');
  await page.click('[data-square="e5"]');
  await page.waitForFunction(
    () =>
      document.querySelector("#status").textContent === "Black to move" &&
      document.querySelector("#history").textContent.includes("e5"),
    {},
    { timeout: 120000 },
  );
  console.log(
    "PASS: human Black move followed by actual Stockfish White reply.",
  );
  const history = await page.locator("#history").textContent();
  await page.reload();
  await page.waitForSelector('[data-square="e2"]');
  assert.equal(await page.locator("#history").textContent(), history);
  console.log("PASS: saved game recovered on reload.");
  await page.click('[data-mode="local"]');
  await page.click("#new");
  await page.waitForFunction(
    () => document.querySelector("#status").textContent === "White to move",
  );
  await page.click("#analyse");
  await page.waitForSelector(".hint-from", { timeout: 120000 });
  console.log("PASS: live Stockfish hint highlighted.");
  // A new game must cancel a live engine search without applying its result.
  await page.click('[data-mode="ai"]');
  await page.selectOption("#thinking", "3");
  await page.click('[data-side="white"]');
  await page.click("#new");
  await page.waitForFunction(
    () => document.querySelector("#status").textContent === "White to move",
  );
  await page.click('[data-square="d2"]');
  await page.click('[data-square="d4"]');
  await page.waitForFunction(
    () =>
      document.querySelector("#engine-status").textContent ===
      "Stockfish is thinking…",
  );
  await page.click("#new");
  await page.waitForFunction(
    () => document.querySelector("#status").textContent === "White to move",
  );
  await page.waitForTimeout(3500);
  assert.equal(await page.locator("#move-count").textContent(), "0 moves");
  console.log("PASS: reset cancels an active WASM search without stale moves.");
  if (process.env.CHESS_SCREENSHOT_DIR) {
    fs.mkdirSync(process.env.CHESS_SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({
      path: process.env.CHESS_SCREENSHOT_DIR + "/desktop.png",
      fullPage: true,
    });
  }
  await page.click("#theme");
  if (process.env.CHESS_SCREENSHOT_DIR)
    await page.screenshot({
      path: process.env.CHESS_SCREENSHOT_DIR + "/light.png",
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.CHESS_SCREENSHOT_DIR)
    await page.screenshot({
      path: process.env.CHESS_SCREENSHOT_DIR + "/mobile.png",
      fullPage: true,
    });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: desktop/light/mobile layouts have no horizontal overflow or page errors.",
  );
  // Both humans, game-over lock and real promotion dialog.
  await page.click('[data-mode="local"]');
  await page.click("#new");
  await page.waitForFunction(
    () => document.querySelector("#status").textContent === "White to move",
  );
  for (const [from, to, turn] of [
    ["f2", "f3", "Black"],
    ["e7", "e5", "White"],
    ["g2", "g4", "Black"],
    ["d8", "h4", "Black wins"],
  ]) {
    await page.click(`[data-square="${from}"]`);
    await page.click(`[data-square="${to}"]`);
    await page.waitForFunction(
      (text) => document.querySelector("#status").textContent.includes(text),
      turn,
    );
  }
  assert(await page.locator("#analyse").isDisabled());
  const promotionMoves = [
    "a2a4",
    "h7h5",
    "a4a5",
    "h5h4",
    "a5a6",
    "h4h3",
    "a6b7",
    "h3g2",
  ];
  await page.evaluate(
    (moves) =>
      localStorage.setItem(
        "chess-studio-game",
        JSON.stringify({
          moves,
          config: { mode: "local", side: "white", level: 3, seconds: 1 },
          flipped: false,
        }),
      ),
    promotionMoves,
  );
  await page.reload();
  await page.waitForSelector('[data-square="b7"]');
  await page.click('[data-square="b7"]');
  await page.click('[data-square="a8"]');
  await page.waitForSelector("#promotion[open]");
  assert.equal(await page.locator("#promotion-options button").count(), 4);
  await page.click('[aria-label="Promote to knight"]');
  await page.waitForFunction(() =>
    document
      .querySelector('[data-square="a8"]')
      .getAttribute("aria-label")
      .includes("white knight"),
  );
  const downloadPromise = page.waitForEvent("download");
  await page.click("#export");
  assert.equal((await downloadPromise).suggestedFilename(), "chess-studio.pgn");
  console.log(
    "PASS: local checkmate, promotion and PGN download in real browser.",
  );
  // Tactical positions are passed directly to the same production Worker adapter.
  const fens = [
    "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    "3r2k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1",
    "7k/6pp/5KQ1/8/8/8/8/8 w - - 0 1",
    "8/8/8/8/8/5kq1/6PP/7K b - - 0 1",
  ];
  const results = [];
  for (const full of [false, true])
    for (const fen of fens) {
      results.push({
        fen,
        full,
        move: await page.evaluate(
          async (args) => {
            const e = new StockfishClient();
            return await e.search({ ...args, seconds: 1 });
          },
          { fen, full },
        ),
      });
    }
  for (const result of results) {
    const expected = result.fen.startsWith("6k1")
      ? "d1d8"
      : result.fen.startsWith("3r")
        ? "d8d1"
        : result.fen.startsWith("7k")
          ? "g6g7"
          : "g3g2";
    assert.equal(result.move, expected);
  }
  console.log(
    "PASS: 8 tactical engine searches completed (both engine builds, both colors).",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
