import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const main = (
  await readFile(new URL("../src/main.js", import.meta.url), "utf8")
).replace(/^import ['"]\.\/styles\.css['"];\r?\n/, "");

test("legacy board, page switching, and multi-page draw.io round trip", async () => {
  const browser = new JSDOM(html, {
    url: "https://example.test/dorojam/",
    runScripts: "outside-only",
  });
  const { window } = browser;
  const { document } = window;
  window.localStorage.setItem(
    "dorojam-document",
    JSON.stringify({
      title: "Legacy",
      items: [
        { id: "legacy", type: "rect", x: 10, y: 10, w: 90, h: 50, text: "Old" },
      ],
    }),
  );
  window.eval(main);

  const select = document.querySelector("#pageSelect");
  assert.equal(select.options.length, 1);
  assert.ok(document.querySelector('#scene [data-id="legacy"]'));

  document.querySelector("#addPageBtn").click();
  assert.equal(select.options.length, 2);
  assert.equal(document.querySelector('#scene [data-id="legacy"]'), null);
  window.prompt = () => "Second page";
  document.querySelector("#renamePageBtn").click();
  assert.equal(select.selectedOptions[0].textContent, "Second page");

  select.value = "page-1";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.ok(document.querySelector('#scene [data-id="legacy"]'));

  const xml = `<?xml version="1.0"?><mxfile>
    <diagram id="a" name="First"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="shape-a" value="A" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="1" y="2" width="80" height="40" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram>
    <diagram id="b" name="Second"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="shape-b" value="B" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="3" y="4" width="80" height="40" as="geometry"/></mxCell>
    </root></mxGraphModel></diagram>
  </mxfile>`;
  const input = document.querySelector("#fileInput");
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [{ name: "multi.drawio", text: async () => xml }],
  });
  input.dispatchEvent(new window.Event("change"));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(
    [...select.options].map((option) => option.textContent),
    ["First", "Second"],
  );
  assert.ok(document.querySelector('#scene [data-id="shape-a"]'));
  select.value = "b";
  select.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert.ok(document.querySelector('#scene [data-id="shape-b"]'));
  assert.equal(document.querySelector('#scene [data-id="shape-a"]'), null);

  let exported;
  window.URL.createObjectURL = (blob) => {
    exported = blob;
    return "blob:example";
  };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = () => {};
  document.querySelector("#exportBtn").click();
  const text = await new Promise((resolve) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(exported);
  });
  const result = new window.DOMParser().parseFromString(
    text,
    "application/xml",
  );
  assert.deepEqual(
    [...result.querySelectorAll("diagram")].map((page) =>
      page.getAttribute("name"),
    ),
    ["First", "Second"],
  );
  assert.ok(result.querySelector('diagram[id="a"] mxCell[id="shape-a"]'));
  assert.ok(result.querySelector('diagram[id="b"] mxCell[id="shape-b"]'));

  await new Promise((resolve) => setTimeout(resolve, 300));
  const saved = JSON.parse(window.localStorage.getItem("dorojam-document"));
  assert.equal(saved.activePageId, "b");
  assert.deepEqual(
    saved.pages.map((page) => page.name),
    ["First", "Second"],
  );

  window.confirm = () => true;
  document.querySelector("#deletePageBtn").click();
  assert.equal(select.options.length, 1);
  assert.ok(document.querySelector('#scene [data-id="shape-a"]'));
  browser.window.close();
});
