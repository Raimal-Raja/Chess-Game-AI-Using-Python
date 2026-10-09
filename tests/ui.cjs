const { JSDOM } = require("jsdom");
const fs = require("fs");
const assert = require("node:assert/strict");
const base = process.env.CHESS_TEST_URL || "http://127.0.0.1:8000";
let requests = 0;
const dom = new JSDOM(fs.readFileSync("web/static/index.html", "utf8"), {
  url: base,
  runScripts: "outside-only",
});
const w = dom.window;
w.AbortController = global.AbortController;
w.fetch = (url, opts) => {
  requests++;
  return fetch(base + url, opts);
};
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
w.StockfishClient = class {
  cancel() {}
  async search({ moves }) {
    const response = await fetch(base + "/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moves, level: 2 }),
    });
    const result = await response.json();
    return result.moves.at(-1);
  }
};
w.eval(fs.readFileSync("web/static/app.js", "utf8"));
const wait = async (pred) => {
  for (let i = 0; i < 200; i++) {
    if (pred()) return;
    await new Promise((r) => setTimeout(r, 25));
  }
  throw Error("Timed out: " + w.document.getElementById("error").textContent);
};
const $ = (id) => w.document.getElementById(id);
const click = (s) => w.document.querySelector(`[data-square="${s}"]`).click();
(async () => {
  await wait(() => $("board").children.length === 64);
  assert.equal($("status").textContent, "White to move");
  click("e2");
  assert(
    w.document.querySelector('[data-square="e4"]').classList.contains("legal"),
  );
  click("e4");
  await wait(
    () =>
      $("history").textContent.includes("e5") ||
      ($("history").querySelectorAll(".history-row span").length >= 3 &&
        $("status").textContent === "White to move"),
  );
  assert($("history").textContent.includes("e4"));
  assert(!$("undo").disabled);
  $("undo").click();
  await wait(() => $("move-count").textContent === "0 moves");
  w.document.querySelector('[data-side="black"]').click();
  $("new").click();
  await wait(() => $("status").textContent === "Black to move");
  assert.equal(w.document.querySelector("#board button").dataset.square, "h1");
  w.document.querySelector('[data-mode="local"]').click();
  $("new").click();
  await wait(() => $("status").textContent === "White to move");
  click("f2");
  click("f3");
  await wait(() => $("status").textContent === "Black to move");
  click("e7");
  click("e5");
  await wait(() => $("status").textContent === "White to move");
  click("g2");
  click("g4");
  await wait(() => $("status").textContent === "Black to move");
  click("d8");
  click("h4");
  await wait(() => $("status").textContent.includes("Black wins"));
  const before = requests;
  click("a2");
  click("a3");
  assert.equal(requests, before);
  $("theme").click();
  assert(w.document.body.classList.contains("light"));
  $("flip").click();
  assert.equal(w.document.querySelector("#board button").dataset.square, "h1");
  $("new").click();
  await wait(() => $("status").textContent === "White to move");
  for (const [from, to] of [
    ["a2", "a4"],
    ["h7", "h5"],
    ["a4", "a5"],
    ["h5", "h4"],
    ["a5", "a6"],
    ["h4", "h3"],
    ["a6", "b7"],
    ["h3", "g2"],
  ]) {
    const n = requests;
    click(from);
    click(to);
    await wait(
      () =>
        requests > n && $("status").textContent !== "Working on your position…",
    );
    await new Promise((r) => setTimeout(r, 30));
  }
  click("b7");
  click("a8");
  assert($("promotion").open);
  assert.equal($("promotion-options").children.length, 4);
  $("promotion-options")
    .querySelector('[aria-label="Promote to knight"]')
    .click();
  await wait(() =>
    w.document
      .querySelector('[data-square="a8"]')
      .getAttribute("aria-label")
      .includes("knight"),
  );
  console.log(
    "PASS: board, legal highlights, human White/AI Black, undo, AI White/human Black, local two-player checkmate, terminal lock, theme, flip, promotion.",
  );
  dom.window.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
