import "./styles.css";

(() => {
  "use strict";

  // Editor state and saved preferences
  const $ = (s) => document.querySelector(s);
  const svgNS = "http://www.w3.org/2000/svg";
  const scene = $("#scene"),
    overlay = $("#overlay"),
    workspace = $("#workspace");
  const defaults = {
    select: "V",
    hand: "H",
    rect: "R",
    ellipse: "O",
    diamond: "D",
    sticky: "S",
    section: "Shift+S",
    text: "T",
    connector: "C",
    undo: "Mod+Z",
    redo: "Mod+Shift+Z",
    copy: "Mod+C",
    paste: "Mod+V",
    duplicate: "Mod+D",
    delete: "Delete",
    save: "Mod+S",
    open: "Mod+O",
    new: "Mod+N",
    shortcuts: "Mod+/",
    selectAll: "Mod+A",
    escape: "Escape",
  };
  const labels = {
    select: "選択",
    hand: "手のひら",
    rect: "四角形",
    ellipse: "円形",
    diamond: "ひし形",
    sticky: "付箋",
    section: "セクション",
    text: "テキスト",
    connector: "コネクタ",
    undo: "元に戻す",
    redo: "やり直す",
    copy: "コピー",
    paste: "貼り付け",
    duplicate: "複製",
    delete: "削除",
    save: "draw.io で書き出す",
    open: "draw.io を開く",
    new: "新しいボード",
    shortcuts: "ショートカットを開く",
    selectAll: "すべて選択",
    escape: "選択を解除",
  };
  const fills = [
    "#ffffff",
    "#edeaff",
    "#dfeafa",
    "#dff5ed",
    "#fff0b9",
    "#ffe5d6",
    "#ffe2e8",
    "#24253a",
  ];
  const strokes = [
    "#596079",
    "#7058e8",
    "#4285d4",
    "#329c76",
    "#db9b27",
    "#e07942",
    "#d56783",
    "#24253a",
  ];
  let shortcuts = {
    ...defaults,
    ...safeParse(localStorage.getItem("dorojam-shortcuts"), {}),
  };
  let presets = safeParse(localStorage.getItem("dorojam-shape-presets"), []);
  let doc = safeParse(localStorage.getItem("dorojam-document"), null) || seed();
  let view = { x: 0, y: 0, scale: 1 },
    tool = "select",
    selected = new Set(),
    interaction = null,
    editorId = null,
    clipboard = [],
    history = [],
    future = [],
    saveTimer,
    toastTimer,
    shortcutCapture = null,
    spaceHeld = false;
  let lastPointer = { x: 0, y: 0 },
    hover = null,
    activePreset = null;
  // Document and geometry helpers
  function safeParse(s, fallback) {
    try {
      return JSON.parse(s) || fallback;
    } catch {
      return fallback;
    }
  }
  function seed() {
    return {
      title: "無題のボード",
      items: [
        {
          id: "n1",
          type: "sticky",
          x: 230,
          y: 145,
          w: 210,
          h: 145,
          text: "アイデアをここに書く",
          fill: "#fff0b9",
          stroke: "#e8c65f",
          fontSize: 18,
        },
        {
          id: "n2",
          type: "rect",
          x: 510,
          y: 190,
          w: 180,
          h: 66,
          text: "次のステップ",
          fill: "#ffffff",
          stroke: "#596079",
          fontSize: 18,
        },
        {
          id: "e1",
          type: "connector",
          from: "n1",
          to: "n2",
          x1: 440,
          y1: 217,
          x2: 510,
          y2: 223,
          stroke: "#596079",
        },
      ],
    };
  }
  function uid() {
    return "n" + Math.random().toString(36).slice(2, 10);
  }
  function clone(x) {
    return JSON.parse(JSON.stringify(x));
  }
  function snapshot() {
    history.push(clone(doc));
    if (history.length > 60) history.shift();
    future = [];
  }
  function persist() {
    clearTimeout(saveTimer);
    $("#saveStatus").textContent = "保存中…";
    saveTimer = setTimeout(() => {
      localStorage.setItem("dorojam-document", JSON.stringify(doc));
      $("#saveStatus").textContent = "保存済み";
    }, 250);
  }
  function changed() {
    render();
    persist();
  }
  function toast(message) {
    const t = $("#toast");
    t.textContent = message;
    t.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 3000);
  }
  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(svgNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.append(n);
    return n;
  }
  function esc(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function point(e) {
    const r = workspace.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - view.x) / view.scale,
      y: (e.clientY - r.top - view.y) / view.scale,
    };
  }
  function screenPoint(p) {
    const r = workspace.getBoundingClientRect();
    return {
      x: r.left + view.x + p.x * view.scale,
      y: r.top + view.y + p.y * view.scale,
    };
  }
  function item(id) {
    return doc.items.find((n) => n.id === id);
  }
  function center(n) {
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
  }
  function edgePoints(n) {
    const a = item(n.from),
      b = item(n.to);
    if (!a || !b)
      return [
        { x: n.x1 || 0, y: n.y1 || 0 },
        { x: n.x2 || 0, y: n.y2 || 0 },
      ];
    const ac = center(a),
      bc = center(b),
      dx = bc.x - ac.x,
      dy = bc.y - ac.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      return [
        { x: ac.x + (dx > 0 ? a.w / 2 : -a.w / 2), y: ac.y },
        { x: bc.x + (dx > 0 ? -b.w / 2 : b.w / 2), y: bc.y },
      ];
    }
    return [
      { x: ac.x, y: ac.y + (dy > 0 ? a.h / 2 : -a.h / 2) },
      { x: bc.x, y: bc.y + (dy > 0 ? -b.h / 2 : b.h / 2) },
    ];
  }
  // SVG scene and selection UI
  function render() {
    scene.replaceChildren();
    overlay.replaceChildren();
    scene.setAttribute(
      "transform",
      `translate(${view.x} ${view.y}) scale(${view.scale})`,
    );
    overlay.setAttribute(
      "transform",
      `translate(${view.x} ${view.y}) scale(${view.scale})`,
    );
    for (const n of doc.items.filter((n) => n.type === "section"))
      renderNode(n);
    for (const n of doc.items.filter((n) => n.type === "connector"))
      renderConnector(n);
    for (const n of doc.items.filter(
      (n) => n.type !== "connector" && n.type !== "section",
    ))
      renderNode(n);
    for (const id of selected) {
      const n = item(id);
      if (!n || n.type === "connector") continue;
      el(
        "rect",
        {
          x: n.x - 4,
          y: n.y - 4,
          width: n.w + 8,
          height: n.h + 8,
          rx: 5,
          class: "selection-outline",
        },
        overlay,
      );
      if (selected.size === 1) {
        for (const [cx, cy] of [
          [n.x, n.y],
          [n.x + n.w, n.y],
          [n.x + n.w, n.y + n.h],
          [n.x, n.y + n.h],
        ])
          el(
            "rect",
            {
              x: cx - 5,
              y: cy - 5,
              width: 10,
              height: 10,
              rx: 2,
              class: "resize-handle",
              "data-id": id,
              "data-handle": `${cx === n.x ? "l" : "r"}${cy === n.y ? "t" : "b"}`,
            },
            overlay,
          );
        if (n.type !== "section")
          for (const [cx, cy, side] of [
            [n.x + n.w / 2, n.y, "t"],
            [n.x + n.w, n.y + n.h / 2, "r"],
            [n.x + n.w / 2, n.y + n.h, "b"],
            [n.x, n.y + n.h / 2, "l"],
          ])
            el(
              "circle",
              {
                cx,
                cy,
                r: 5,
                class: "port",
                "data-port": id,
                "data-side": side,
              },
              overlay,
            );
      }
    }
    if (interaction?.type === "marquee") {
      const a = interaction.start,
        b = interaction.current;
      el(
        "rect",
        {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x),
          height: Math.abs(a.y - b.y),
          class: "marquee",
        },
        overlay,
      );
    }
    if (interaction?.type === "connect") {
      const a = interaction.start,
        b = interaction.current;
      el(
        "path",
        { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, class: "connector-preview" },
        overlay,
      );
    }
    if (
      tool !== "select" &&
      tool !== "hand" &&
      tool !== "connector" &&
      !spaceHeld &&
      interaction?.type !== "pan" &&
      hover
    ) {
      const p = interaction?.type === "create" ? interaction.current : hover;
      const n = placement(
        tool,
        p,
        interaction?.type === "create" ? interaction.start : null,
      );
      renderNode(n, overlay, true);
    }
    $("#emptyHint").classList.toggle("hidden", doc.items.length > 0);
    $("#docTitle").value = doc.title;
    $("#zoomValue").textContent = Math.round(view.scale * 100) + "%";
    updateInspector();
    $("#registerShapeBtn").disabled =
      selected.size !== 1 || item([...selected][0])?.type === "connector";
    if (selected.size === 1 && item([...selected][0])?.type === "section")
      $("#inspectorTitle").textContent = "セクション";
  }
  function renderConnector(n) {
    const [a, b] = edgePoints(n);
    const g = el("g", { "data-id": n.id }, scene);
    el(
      "path",
      {
        d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`,
        fill: "none",
        stroke: n.stroke || "#596079",
        "stroke-width": selected.has(n.id) ? 3 : 2,
        "marker-end": "url(#arrow)",
      },
      g,
    );
    el(
      "path",
      { d: `M ${a.x} ${a.y} L ${b.x} ${b.y}`, class: "connector-hit" },
      g,
    );
  }
  function renderNode(n, parent = scene, preview = false) {
    const g = el(
      "g",
      {
        class:
          (n.type === "section" ? "section-node" : "node") +
          (preview ? " shape-preview" : ""),
        ...(preview ? {} : { "data-id": n.id }),
      },
      parent,
    );
    const common = {
      fill: n.fill || "#fff",
      stroke: n.stroke || "#596079",
      "stroke-width": n.type === "sticky" ? 1.2 : 2,
    };
    if (n.type === "section") {
      el(
        "rect",
        {
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          rx: 12,
          fill: n.fill || "#edeaff",
          stroke: n.stroke || "#a89aee",
          "stroke-width": 2,
          "stroke-dasharray": "8 5",
        },
        g,
      );
      el(
        "rect",
        {
          x: n.x,
          y: n.y,
          width: n.w,
          height: 39,
          rx: 12,
          fill: n.stroke || "#a89aee",
          opacity: 0.16,
          class: "section-header",
        },
        g,
      );
    } else if (n.type === "rect")
      el(
        "rect",
        { x: n.x, y: n.y, width: n.w, height: n.h, rx: 10, ...common },
        g,
      );
    else if (n.type === "sticky") {
      el(
        "rect",
        {
          x: n.x + 4,
          y: n.y + 6,
          width: n.w,
          height: n.h,
          rx: 3,
          fill: "#25273b18",
          stroke: "none",
        },
        g,
      );
      el(
        "path",
        {
          d: `M${n.x} ${n.y}h${n.w}v${n.h - 23}l-23 23h-${n.w - 23}z`,
          ...common,
        },
        g,
      );
      el(
        "path",
        {
          d: `M${n.x + n.w - 23} ${n.y + n.h}v-23h23`,
          fill: "#ffffff66",
          stroke: n.stroke || "#e8c65f",
          "stroke-width": 1,
        },
        g,
      );
    } else if (n.type === "ellipse")
      el(
        "ellipse",
        {
          cx: n.x + n.w / 2,
          cy: n.y + n.h / 2,
          rx: n.w / 2,
          ry: n.h / 2,
          ...common,
        },
        g,
      );
    else if (n.type === "diamond")
      el(
        "path",
        {
          d: `M ${n.x + n.w / 2} ${n.y} L ${n.x + n.w} ${n.y + n.h / 2} L ${n.x + n.w / 2} ${n.y + n.h} L ${n.x} ${n.y + n.h / 2} Z`,
          ...common,
        },
        g,
      );
    else if (n.type === "text")
      el(
        "rect",
        {
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          fill: "transparent",
          stroke: "none",
        },
        g,
      );
    const lines = String(n.text || "").split("\n");
    const fs = n.fontSize || 18;
    const leftAligned = n.type === "sticky" || n.type === "section";
    const tx = n.x + (leftAligned ? 15 : n.w / 2),
      ty =
        n.y +
        (n.type === "sticky"
          ? 18
          : n.type === "section"
            ? 12
            : n.h / 2 - (lines.length - 1) * fs * 0.62);
    const text = el(
      "text",
      {
        x: tx,
        y: ty,
        "font-family": "Inter, Noto Sans JP, sans-serif",
        "font-size": fs,
        "font-weight": leftAligned ? 650 : 600,
        "text-anchor": leftAligned ? "start" : "middle",
        "dominant-baseline": leftAligned ? "hanging" : "middle",
        fill: n.type === "text" ? n.stroke || "#24253a" : "#303246",
      },
      g,
    );
    lines.forEach((line, i) => {
      const span = el("tspan", { x: tx, dy: i ? fs * 1.26 : 0 }, text);
      span.textContent = line;
    });
  }
  function updateGrid() {
    const size = 24 * view.scale;
    $("#grid").style.backgroundSize = `${size}px ${size}px`;
    $("#grid").style.backgroundPosition = `${view.x}px ${view.y}px`;
  }
  function setView(next) {
    view = next;
    updateGrid();
    render();
  }
  function selectTool(t, preset = null) {
    tool = t;
    activePreset = preset;
    document
      .querySelectorAll(".tool")
      .forEach((b) => b.classList.toggle("active", b.dataset.tool === t));
    workspace.classList.toggle("hand", t === "hand");
    workspace.classList.toggle(
      "creating",
      !spaceHeld && !["hand", "select", "connector"].includes(t),
    );
    render();
  }
  function select(ids, add = false) {
    selected = add ? new Set([...selected, ...ids]) : new Set(ids);
    render();
  }
  function placement(type, p, start = null) {
    const size =
      activePreset?.w && activePreset?.h
        ? [activePreset.w, activePreset.h]
        : {
            rect: [180, 72],
            ellipse: [156, 92],
            diamond: [148, 112],
            sticky: [190, 135],
            section: [480, 300],
            text: [190, 52],
          }[type] || [180, 72];
    const dragged = start && Math.hypot(p.x - start.x, p.y - start.y) > 8;
    const w = dragged
        ? Math.max(type === "section" ? 180 : 55, Math.abs(p.x - start.x))
        : size[0],
      h = dragged
        ? Math.max(type === "section" ? 110 : 40, Math.abs(p.y - start.y))
        : size[1];
    return {
      id: uid(),
      type,
      x: dragged ? Math.min(start.x, p.x) : p.x - w / 2,
      y: dragged ? Math.min(start.y, p.y) : p.y - h / 2,
      w,
      h,
      text:
        activePreset?.text ??
        (type === "sticky"
          ? "付箋"
          : type === "section"
            ? "セクション"
            : type === "text"
              ? "テキスト"
              : ""),
      fill:
        activePreset?.fill ??
        (type === "sticky"
          ? "#fff0b9"
          : type === "section"
            ? "#edeaff"
            : type === "text"
              ? "transparent"
              : "#ffffff"),
      stroke:
        activePreset?.stroke ??
        (type === "sticky"
          ? "#e8c65f"
          : type === "section"
            ? "#a89aee"
            : type === "text"
              ? "#24253a"
              : "#596079"),
      fontSize: activePreset?.fontSize || 18,
    };
  }
  function create(type, p, start = null) {
    const n = placement(type, p, start);
    snapshot();
    doc.items.push(n);
    hover = null;
    interaction = null;
    select([n.id]);
    persist();
    selectTool("select");
    if (type === "text" || type === "sticky" || type === "section")
      startEdit(n);
  }
  function startEdit(n) {
    if (!n || n.type === "connector") return;
    editorId = n.id;
    const ed = $("#textEditor"),
      p = screenPoint({ x: n.x, y: n.y });
    ed.value = n.text || "";
    ed.style.left = p.x + "px";
    ed.style.top = p.y + "px";
    ed.style.width = Math.max(120, n.w * view.scale) + "px";
    ed.style.height =
      n.type === "section" ? "46px" : Math.max(45, n.h * view.scale) + "px";
    ed.style.fontSize = (n.fontSize || 18) * view.scale + "px";
    ed.style.textAlign =
      n.type === "sticky" || n.type === "section" ? "left" : "center";
    ed.style.background =
      n.type === "sticky" || n.type === "section" ? n.fill : "#ffffffed";
    ed.classList.remove("hidden");
    ed.focus();
    ed.select();
  }
  function finishEdit() {
    if (!editorId) return;
    const n = item(editorId),
      ed = $("#textEditor");
    if (n && n.text !== ed.value) {
      snapshot();
      n.text = ed.value;
      changed();
    }
    ed.classList.add("hidden");
    editorId = null;
  }
  function updateInspector() {
    const panel = $("#inspector");
    panel.classList.toggle("hidden", selected.size === 0);
    if (!selected.size) return;
    const n = item([...selected][0]);
    $("#inspectorTitle").textContent =
      selected.size > 1
        ? "複数のオブジェクト"
        : {
            rect: "四角形",
            ellipse: "円形",
            diamond: "ひし形",
            sticky: "付箋",
            text: "テキスト",
            connector: "コネクタ",
          }[n?.type] || "図形";
    $("#selectionCount").textContent =
      selected.size > 1 ? selected.size + " 個" : "";
    $("#fillColors").replaceChildren();
    $("#strokeColors").replaceChildren();
    for (const [container, colors, field] of [
      ["#fillColors", fills, "fill"],
      ["#strokeColors", strokes, "stroke"],
    ])
      for (const color of colors) {
        const b = document.createElement("button");
        b.className = "swatch" + (n?.[field] === color ? " selected" : "");
        b.style.background = color;
        b.title = color;
        b.setAttribute(
          "aria-label",
          `${field === "fill" ? "塗り" : "線"} ${color}`,
        );
        b.onclick = () => {
          snapshot();
          for (const id of selected) {
            const x = item(id);
            if (x) x[field] = color;
          }
          changed();
        };
        $(container).append(b);
      }
    $("#textSize").value = String(n?.fontSize || 18);
  }
  function nodeAt(target) {
    return target.closest?.("[data-id]")?.getAttribute("data-id");
  }
  function dragTargets() {
    const ids = new Set(selected);
    for (const id of selected) {
      const s = item(id);
      if (s?.type !== "section") continue;
      for (const n of doc.items) {
        if (n.type === "connector") continue;
        if (
          n.id !== id &&
          n.x >= s.x &&
          n.y >= s.y &&
          n.x + n.w <= s.x + s.w &&
          n.y + n.h <= s.y + s.h
        )
          ids.add(n.id);
      }
    }
    return [...ids].filter((id) => item(id)).map((id) => [id, clone(item(id))]);
  }
  // Pointer gestures: selection, drawing, panning, resizing, and connectors
  function pointerDown(e) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    finishEdit();
    $("#fileMenu").classList.add("hidden");
    const p = point(e);
    lastPointer = p;
    hover = p;
    const handle = e.target.getAttribute("data-handle"),
      port = e.target.getAttribute("data-port"),
      id = nodeAt(e.target);
    workspace.setPointerCapture(e.pointerId);
    if (port) {
      interaction = { type: "connect", from: port, start: p, current: p };
      render();
      return;
    }
    if (handle && id) {
      interaction = {
        type: "resize",
        id,
        handle,
        start: p,
        original: clone(item(id)),
        committed: false,
      };
      return;
    }
    if (spaceHeld || tool === "hand" || e.button === 1) {
      interaction = {
        type: "pan",
        sx: e.clientX,
        sy: e.clientY,
        view: { ...view },
      };
      workspace.classList.add("panning");
      return;
    }
    if (tool === "connector") {
      interaction = { type: "connect", from: id || null, start: p, current: p };
      render();
      return;
    }
    if (tool !== "select") {
      interaction = { type: "create", start: p, current: p };
      render();
      return;
    }
    if (id) {
      if (e.shiftKey) {
        selected.has(id) ? selected.delete(id) : selected.add(id);
        render();
      } else if (!selected.has(id)) select([id]);
      interaction = {
        type: "drag",
        start: p,
        originals: dragTargets(),
        committed: false,
      };
      return;
    }
    if (!e.shiftKey) select([]);
    interaction = { type: "marquee", start: p, current: p, add: e.shiftKey };
    render();
  }
  function pointerMove(e) {
    const p = point(e);
    lastPointer = p;
    hover = p;
    if (!interaction) {
      if (tool !== "select" && tool !== "hand") render();
      return;
    }
    const i = interaction;
    if (i.type === "pan") {
      setView({
        ...view,
        x: i.view.x + e.clientX - i.sx,
        y: i.view.y + e.clientY - i.sy,
      });
      return;
    }
    if (i.type === "drag") {
      const dx = p.x - i.start.x,
        dy = p.y - i.start.y;
      if (!i.committed && Math.hypot(dx, dy) > 2) {
        snapshot();
        i.committed = true;
      }
      if (!i.committed) return;
      for (const [id, original] of i.originals) {
        const n = item(id);
        if (!n) continue;
        if (n.type === "connector" && !n.from && !n.to) {
          n.x1 = original.x1 + dx;
          n.y1 = original.y1 + dy;
          n.x2 = original.x2 + dx;
          n.y2 = original.y2 + dy;
        } else if (n.type !== "connector") {
          n.x = original.x + dx;
          n.y = original.y + dy;
        }
      }
      render();
      return;
    }
    if (i.type === "resize") {
      const n = item(i.id),
        o = i.original;
      if (!n) return;
      if (!i.committed && Math.hypot(p.x - i.start.x, p.y - i.start.y) > 2) {
        snapshot();
        i.committed = true;
      }
      if (!i.committed) return;
      const right = o.x + o.w,
        bottom = o.y + o.h;
      n.x = i.handle.includes("l") ? Math.min(p.x, right - 35) : o.x;
      n.y = i.handle.includes("t") ? Math.min(p.y, bottom - 30) : o.y;
      n.w = i.handle.includes("r") ? Math.max(35, p.x - o.x) : right - n.x;
      n.h = i.handle.includes("b") ? Math.max(30, p.y - o.y) : bottom - n.y;
      render();
      return;
    }
    i.current = p;
    render();
  }
  function pointerUp(e) {
    if (!interaction) return;
    const i = interaction;
    interaction = null;
    workspace.classList.remove("panning");
    if (i.type === "create") {
      create(tool, point(e), i.start);
      return;
    }
    if (i.type === "marquee") {
      const a = i.start,
        b = i.current;
      const ids = doc.items
        .filter(
          (n) =>
            n.type !== "connector" &&
            n.x >= Math.min(a.x, b.x) &&
            n.y >= Math.min(a.y, b.y) &&
            n.x + n.w <= Math.max(a.x, b.x) &&
            n.y + n.h <= Math.max(a.y, b.y),
        )
        .map((n) => n.id);
      select(ids, i.add);
    } else if (i.type === "connect") {
      const target =
        nodeAt(e.target) ||
        doc.items.find(
          (n) =>
            n.type !== "connector" &&
            lastPointer.x >= n.x &&
            lastPointer.x <= n.x + n.w &&
            lastPointer.y >= n.y &&
            lastPointer.y <= n.y + n.h,
        )?.id;
      const a = i.start,
        b = i.current;
      if (Math.hypot(a.x - b.x, a.y - b.y) > 12) {
        snapshot();
        const n = {
          id: uid(),
          type: "connector",
          from: i.from || null,
          to: target && target !== i.from ? target : null,
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          stroke: "#596079",
        };
        doc.items.push(n);
        select([n.id]);
        persist();
      } else render();
      selectTool("select");
    } else {
      render();
      if (i.committed) persist();
    }
  }
  function zoomAt(factor, clientX, clientY) {
    const rect = workspace.getBoundingClientRect(),
      px = clientX - rect.left,
      py = clientY - rect.top,
      scale = Math.max(0.2, Math.min(3, view.scale * factor));
    setView({
      scale,
      x: px - ((px - view.x) * scale) / view.scale,
      y: py - ((py - view.y) * scale) / view.scale,
    });
  }
  function fit() {
    const nodes = doc.items.filter((n) => n.type !== "connector");
    if (!nodes.length) {
      setView({ x: 0, y: 0, scale: 1 });
      return;
    }
    const minX = Math.min(...nodes.map((n) => n.x)),
      minY = Math.min(...nodes.map((n) => n.y)),
      maxX = Math.max(...nodes.map((n) => n.x + n.w)),
      maxY = Math.max(...nodes.map((n) => n.y + n.h));
    const r = workspace.getBoundingClientRect(),
      scale = Math.min(
        1.4,
        Math.max(
          0.2,
          Math.min(
            (r.width - 220) / (maxX - minX + 40),
            (r.height - 130) / (maxY - minY + 40),
          ),
        ),
      );
    setView({
      scale,
      x: r.width / 2 - ((minX + maxX) / 2) * scale,
      y: r.height / 2 - ((minY + maxY) / 2) * scale,
    });
  }
  // Document editing and clipboard
  function undo() {
    if (!history.length) return;
    future.push(clone(doc));
    doc = history.pop();
    selected.clear();
    changed();
  }
  function redo() {
    if (!future.length) return;
    history.push(clone(doc));
    doc = future.pop();
    selected.clear();
    changed();
  }
  function remove() {
    if (!selected.size) return;
    snapshot();
    doc.items = doc.items.filter(
      (n) =>
        !selected.has(n.id) &&
        !(
          n.type === "connector" &&
          (selected.has(n.from) || selected.has(n.to))
        ),
    );
    selected.clear();
    changed();
  }
  function copy() {
    const ids = new Set(dragTargets().map(([id]) => id));
    for (const n of doc.items.filter((n) => n.type === "connector"))
      if (ids.has(n.from) && ids.has(n.to)) ids.add(n.id);
    clipboard = doc.items.filter((n) => ids.has(n.id)).map(clone);
    if (clipboard.length) toast(`${clipboard.length} 個コピーしました`);
  }
  function paste() {
    if (!clipboard.length) return;
    snapshot();
    const map = new Map();
    const copies = clipboard.map((n) => {
      const x = clone(n);
      map.set(x.id, (x.id = uid()));
      if (x.type !== "connector") {
        x.x += 28;
        x.y += 28;
      } else {
        x.x1 += 28;
        x.y1 += 28;
        x.x2 += 28;
        x.y2 += 28;
      }
      return x;
    });
    for (const x of copies)
      if (x.type === "connector") {
        x.from = map.get(x.from) || null;
        x.to = map.get(x.to) || null;
      }
    doc.items.push(...copies);
    clipboard = copies.map(clone);
    select(copies.map((n) => n.id));
    persist();
  }
  function duplicate() {
    copy();
    paste();
  }
  // Keyboard shortcuts and reusable shape presets
  function combo(e) {
    const bits = [];
    if (e.ctrlKey || e.metaKey) bits.push("Mod");
    if (e.altKey) bits.push("Alt");
    if (e.shiftKey) bits.push("Shift");
    let key =
      e.key === " "
        ? "Space"
        : e.key.length === 1
          ? e.key.toUpperCase()
          : e.key;
    bits.push(key);
    return bits.join("+");
  }
  function runAction(a) {
    if (
      [
        "select",
        "hand",
        "rect",
        "ellipse",
        "diamond",
        "sticky",
        "section",
        "text",
        "connector",
      ].includes(a)
    )
      selectTool(a);
    else if (a === "undo") undo();
    else if (a === "redo") redo();
    else if (a === "copy") copy();
    else if (a === "paste") paste();
    else if (a === "duplicate") duplicate();
    else if (a === "delete") remove();
    else if (a === "save") exportDrawio();
    else if (a === "open") $("#fileInput").click();
    else if (a === "new") newBoard();
    else if (a === "shortcuts") openShortcuts();
    else if (a === "selectAll") select(doc.items.map((n) => n.id));
    else if (a === "escape") {
      interaction = null;
      hover = null;
      select([]);
      selectTool("select");
    }
  }
  function keydown(e) {
    if (shortcutCapture) {
      e.preventDefault();
      if (["Control", "Meta", "Shift", "Alt"].includes(e.key)) return;
      if (e.key === "Escape") {
        shortcutCapture = null;
        renderShortcuts();
        return;
      }
      const c = combo(e),
        owner = Object.keys(shortcuts).find(
          (k) => k !== shortcutCapture && shortcuts[k] === c,
        ),
        presetOwner = presets.find(
          (p) => "preset:" + p.id !== shortcutCapture && p.shortcut === c,
        );
      if (owner || presetOwner) {
        toast(
          `「${owner ? labels[owner] : presetOwner.name}」ですでに使用中です`,
        );
        return;
      }
      if (shortcutCapture.startsWith("preset:")) {
        const p = presets.find((p) => p.id === shortcutCapture.slice(7));
        if (p) p.shortcut = c;
        savePresets();
      } else {
        shortcuts[shortcutCapture] = c;
        localStorage.setItem("dorojam-shortcuts", JSON.stringify(shortcuts));
      }
      shortcutCapture = null;
      renderShortcuts();
      return;
    }
    if (e.key === " " && !e.repeat && !isTyping(e)) {
      spaceHeld = true;
      workspace.classList.add("hand");
      workspace.classList.remove("creating");
      render();
      e.preventDefault();
    }
    if (isTyping(e) || !$("#shortcutDialog").classList.contains("hidden")) {
      if (e.key === "Escape" && editorId) finishEdit();
      return;
    }
    const c = combo(e),
      action = Object.keys(shortcuts).find((k) => shortcuts[k] === c),
      preset = presets.find((p) => p.shortcut === c);
    if (action) {
      e.preventDefault();
      runAction(action);
    } else if (preset) {
      e.preventDefault();
      selectTool(preset.type, preset);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      remove();
    }
  }
  function isTyping(e) {
    return e.target.matches("input,textarea,select,[contenteditable]");
  }
  function savePresets() {
    localStorage.setItem("dorojam-shape-presets", JSON.stringify(presets));
  }
  function addPreset(type, name, source) {
    if (!name.trim()) {
      toast("図形の名前を入力してください");
      return;
    }
    const base = {
      rect: ["#ffffff", "#596079"],
      ellipse: ["#ffffff", "#596079"],
      diamond: ["#ffffff", "#596079"],
      sticky: ["#fff0b9", "#e8c65f"],
      section: ["#edeaff", "#a89aee"],
      text: ["transparent", "#24253a"],
    }[type] || ["#ffffff", "#596079"];
    const p = {
      id: uid(),
      name: name.trim(),
      type,
      fill: source?.fill || base[0],
      stroke: source?.stroke || base[1],
      fontSize: source?.fontSize || 18,
      text: source?.text || "",
      w: source?.w,
      h: source?.h,
      shortcut: "",
    };
    presets.push(p);
    savePresets();
    openShortcuts();
    shortcutCapture = "preset:" + p.id;
    renderShortcuts();
    $("#presetName").value = "";
    toast("キーを押してショートカットを設定してください");
  }
  function renderShortcuts() {
    const list = $("#shortcutRows");
    list.replaceChildren();
    for (const [action, label] of Object.entries(labels)) {
      const row = document.createElement("div");
      row.className = "shortcut-row";
      const name = document.createElement("span");
      name.textContent = label;
      const key = document.createElement("button");
      key.className =
        "shortcut-key" + (shortcutCapture === action ? " recording" : "");
      key.textContent =
        shortcutCapture === action ? "キーを押す…" : shortcuts[action];
      key.onclick = () => {
        shortcutCapture = action;
        renderShortcuts();
      };
      row.append(name, key);
      list.append(row);
    }
    const presetRows = $("#presetRows");
    presetRows.replaceChildren();
    for (const p of presets) {
      const row = document.createElement("div");
      row.className = "preset-row";
      const sample = document.createElement("span");
      sample.className = "preset-sample";
      sample.style.background = p.fill;
      sample.style.borderColor = p.stroke;
      const name = document.createElement("span");
      name.className = "preset-name";
      name.textContent = p.name;
      const key = document.createElement("button");
      key.className =
        "shortcut-key" +
        (shortcutCapture === "preset:" + p.id ? " recording" : "");
      key.textContent =
        shortcutCapture === "preset:" + p.id
          ? "キーを押す…"
          : p.shortcut || "キーを設定";
      key.onclick = () => {
        shortcutCapture = "preset:" + p.id;
        renderShortcuts();
      };
      const remove = document.createElement("button");
      remove.className = "preset-remove";
      remove.textContent = "×";
      remove.title = "登録を削除";
      remove.onclick = () => {
        presets = presets.filter((x) => x.id !== p.id);
        savePresets();
        if (shortcutCapture === "preset:" + p.id) shortcutCapture = null;
        renderShortcuts();
      };
      row.append(sample, name, key, remove);
      presetRows.append(row);
    }
    for (const b of document.querySelectorAll(".tool[data-tool] kbd")) {
      const t = b.parentElement.dataset.tool;
      b.textContent = (shortcuts[t] || "")
        .replace("Shift+", "⇧")
        .replace("Mod+", "⌘");
    }
  }
  function openShortcuts() {
    $("#shortcutDialog").classList.remove("hidden");
    renderShortcuts();
  }
  function closeShortcuts() {
    shortcutCapture = null;
    $("#shortcutDialog").classList.add("hidden");
  }
  function newBoard() {
    if (
      doc.items.length &&
      !confirm("新しいボードを作成しますか？現在の内容はこの端末から消えます。")
    )
      return;
    snapshot();
    doc = { title: "無題のボード", items: [] };
    selected.clear();
    setView({ x: 0, y: 0, scale: 1 });
    changed();
  }
  // draw.io import/export and image export
  function download(name, content, type) {
    const blob =
      content instanceof Blob ? content : new Blob([content], { type });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function filename(ext) {
    return (
      (doc.title.trim() || "無題のボード").replace(/[\\/:*?"<>|]/g, "_") + ext
    );
  }
  function styleFor(n) {
    const base = `fillColor=${n.fill || "#ffffff"};strokeColor=${n.stroke || "#596079"};fontSize=${n.fontSize || 18};fontColor=#24253a;whiteSpace=wrap;html=0;`;
    if (n.type === "ellipse") return "ellipse;" + base;
    if (n.type === "diamond") return "rhombus;" + base;
    if (n.type === "sticky") return "shape=note;" + base;
    if (n.type === "section")
      return "swimlane;startSize=39;dorojamSection=1;" + base;
    if (n.type === "text")
      return "text;fillColor=none;strokeColor=none;" + base;
    return "rounded=1;arcSize=12;" + base;
  }
  function drawioXML() {
    const cells = ['<mxCell id="0"/>', '<mxCell id="1" parent="0"/>'];
    for (const n of doc.items) {
      if (n.type === "connector") continue;
      cells.push(
        `<mxCell id="${esc(n.id)}" value="${esc(n.text || "")}" style="${styleFor(n)}" vertex="1" parent="1"><mxGeometry x="${Math.round(n.x)}" y="${Math.round(n.y)}" width="${Math.round(n.w)}" height="${Math.round(n.h)}" as="geometry"/></mxCell>`,
      );
    }
    for (const n of doc.items.filter((n) => n.type === "connector")) {
      const [a, b] = edgePoints(n);
      cells.push(
        `<mxCell id="${esc(n.id)}" value="" style="endArrow=open;html=0;strokeColor=${n.stroke || "#596079"};" edge="1" parent="1"${n.from ? ` source="${esc(n.from)}"` : ""}${n.to ? ` target="${esc(n.to)}"` : ""}><mxGeometry relative="1" as="geometry"><mxPoint x="${Math.round(a.x)}" y="${Math.round(a.y)}" as="sourcePoint"/><mxPoint x="${Math.round(b.x)}" y="${Math.round(b.y)}" as="targetPoint"/></mxGeometry></mxCell>`,
      );
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="Dorojam" version="24.0.0"><diagram name="${esc(doc.title)}" id="dorojam"><mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" page="0"><root>${cells.join("")}</root></mxGraphModel></diagram></mxfile>`;
  }
  function exportDrawio() {
    download(filename(".drawio"), drawioXML(), "application/xml");
    toast("draw.io ファイルを書き出しました");
  }
  function parseStyle(s) {
    const result = {};
    for (const part of (s || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0)
        result[part.slice(0, i)] = decodeURIComponent(part.slice(i + 1));
    }
    return result;
  }
  async function decodeDiagram(s) {
    const bytes = Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));
    if (!("DecompressionStream" in window))
      throw Error(
        "このブラウザは圧縮された draw.io ファイルに対応していません",
      );
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    const raw = await new Response(stream).text();
    return decodeURIComponent(raw);
  }
  async function openDrawio(file) {
    try {
      const raw = await file.text();
      let xml = new DOMParser().parseFromString(raw, "application/xml");
      if (xml.querySelector("parsererror")) throw Error("XML を読み取れません");
      let model = xml.querySelector("mxGraphModel");
      if (!model) {
        const diagram = xml.querySelector("diagram");
        if (!diagram) throw Error("draw.io 形式ではありません");
        const decoded = await decodeDiagram(diagram.textContent || "");
        xml = new DOMParser().parseFromString(decoded, "application/xml");
        model = xml.querySelector("mxGraphModel");
      }
      if (!model) throw Error("図形データがありません");
      const nodes = [];
      for (const c of model.querySelectorAll('mxCell[vertex="1"]')) {
        const g = c.querySelector("mxGeometry");
        if (!g) continue;
        const st = parseStyle(c.getAttribute("style"));
        const shape = (c.getAttribute("style") || "").split(";")[0];
        const type =
          shape === "ellipse"
            ? "ellipse"
            : shape === "rhombus"
              ? "diamond"
              : st.shape === "note"
                ? "sticky"
                : shape === "swimlane" || st.dorojamSection === "1"
                  ? "section"
                  : shape === "text"
                    ? "text"
                    : "rect";
        nodes.push({
          id: c.getAttribute("id") || uid(),
          type,
          x: Number(g.getAttribute("x")) || 0,
          y: Number(g.getAttribute("y")) || 0,
          w: Number(g.getAttribute("width")) || 160,
          h: Number(g.getAttribute("height")) || 70,
          text: (c.getAttribute("value") || "")
            .replace(/<br\s*\/?\s*>/gi, "\n")
            .replace(/<[^>]*>/g, ""),
          fill:
            st.fillColor && st.fillColor !== "none"
              ? st.fillColor
              : type === "text"
                ? "transparent"
                : "#ffffff",
          stroke:
            st.strokeColor && st.strokeColor !== "none"
              ? st.strokeColor
              : "#596079",
          fontSize: Number(st.fontSize) || 18,
        });
      }
      for (const c of model.querySelectorAll('mxCell[edge="1"]')) {
        const g = c.querySelector("mxGeometry"),
          st = parseStyle(c.getAttribute("style")),
          a = g?.querySelector('mxPoint[as="sourcePoint"]'),
          b = g?.querySelector('mxPoint[as="targetPoint"]');
        nodes.push({
          id: c.getAttribute("id") || uid(),
          type: "connector",
          from: c.getAttribute("source"),
          to: c.getAttribute("target"),
          x1: Number(a?.getAttribute("x")) || 0,
          y1: Number(a?.getAttribute("y")) || 0,
          x2: Number(b?.getAttribute("x")) || 120,
          y2: Number(b?.getAttribute("y")) || 60,
          stroke: st.strokeColor || "#596079",
        });
      }
      snapshot();
      doc = { title: file.name.replace(/\.(drawio|xml)$/i, ""), items: nodes };
      selected.clear();
      fit();
      changed();
      toast(`${nodes.length} 個の要素を読み込みました`);
    } catch (err) {
      toast("読み込めませんでした: " + err.message);
    }
  }
  function svgExport() {
    const nodes = doc.items.filter((n) => n.type !== "connector");
    const minX = Math.min(0, ...nodes.map((n) => n.x)) - 30,
      minY = Math.min(0, ...nodes.map((n) => n.y)) - 30,
      maxX = Math.max(900, ...nodes.map((n) => n.x + n.w)) + 30,
      maxY = Math.max(600, ...nodes.map((n) => n.y + n.h)) + 30;
    const content = scene.innerHTML.replaceAll(
      "url(#arrow)",
      "url(#exportArrow)",
    );
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${maxX - minX} ${maxY - minY}" width="${maxX - minX}" height="${maxY - minY}"><defs><marker id="exportArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L10 5 L0 10" fill="none" stroke="#596079" stroke-width="1.6"/></marker></defs><rect x="${minX}" y="${minY}" width="${maxX - minX}" height="${maxY - minY}" fill="white"/><g>${content}</g></svg>`;
  }
  function exportSVG() {
    download(filename(".svg"), svgExport(), "image/svg+xml");
    toast("SVG を書き出しました");
  }
  function exportPNG() {
    const svg = new Blob([svgExport()], { type: "image/svg+xml" }),
      url = URL.createObjectURL(svg),
      img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width * 2;
      c.height = img.height * 2;
      const ctx = c.getContext("2d");
      ctx.scale(2, 2);
      ctx.drawImage(img, 0, 0);
      c.toBlob((b) => {
        if (b) download(filename(".png"), b, "image/png");
        URL.revokeObjectURL(url);
        toast("PNG を書き出しました");
      });
    };
    img.onerror = () => toast("PNG を作成できませんでした");
    img.src = url;
  }
  // DOM event wiring
  for (const panel of document.querySelectorAll(
    ".toolbar,.inspector,.zoom-bar",
  )) {
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    panel.addEventListener("dblclick", (e) => e.stopPropagation());
    panel.addEventListener("wheel", (e) => e.stopPropagation());
  }
  workspace.addEventListener("pointerdown", pointerDown);
  workspace.addEventListener("pointermove", pointerMove);
  workspace.addEventListener("pointerup", pointerUp);
  workspace.addEventListener("pointercancel", pointerUp);
  workspace.addEventListener("dblclick", (e) => {
    const id = nodeAt(e.target);
    if (id) startEdit(item(id));
    else if (tool === "select") create("text", point(e));
  });
  workspace.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey)
        zoomAt(Math.exp(-e.deltaY * 0.008), e.clientX, e.clientY);
      else setView({ ...view, x: view.x - e.deltaX, y: view.y - e.deltaY });
    },
    { passive: false },
  );
  document.addEventListener("keydown", keydown);
  document.addEventListener("keyup", (e) => {
    if (e.key === " ") {
      spaceHeld = false;
      workspace.classList.toggle("hand", tool === "hand");
      workspace.classList.toggle(
        "creating",
        !["hand", "select", "connector"].includes(tool),
      );
      render();
    }
  });
  window.addEventListener("blur", () => {
    spaceHeld = false;
    workspace.classList.toggle("hand", tool === "hand");
    workspace.classList.toggle(
      "creating",
      !["hand", "select", "connector"].includes(tool),
    );
    render();
  });
  document
    .querySelectorAll(".tool")
    .forEach((b) => (b.onclick = () => selectTool(b.dataset.tool)));
  $("#textEditor").addEventListener("blur", finishEdit);
  $("#textEditor").addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      finishEdit();
    }
    e.stopPropagation();
  });
  $("#docTitle").addEventListener("change", (e) => {
    snapshot();
    doc.title = e.target.value.trim() || "無題のボード";
    changed();
  });
  $("#undoBtn").onclick = undo;
  $("#redoBtn").onclick = redo;
  $("#deleteBtn").onclick = remove;
  $("#duplicateBtn").onclick = duplicate;
  $("#textSize").onchange = (e) => {
    snapshot();
    for (const id of selected) {
      const n = item(id);
      if (n && n.type !== "connector") n.fontSize = Number(e.target.value);
    }
    changed();
  };
  $("#zoomOut").onclick = () => {
    const r = workspace.getBoundingClientRect();
    zoomAt(0.8, r.left + r.width / 2, r.top + r.height / 2);
  };
  $("#zoomIn").onclick = () => {
    const r = workspace.getBoundingClientRect();
    zoomAt(1.25, r.left + r.width / 2, r.top + r.height / 2);
  };
  $("#zoomValue").onclick = () => setView({ ...view, scale: 1 });
  $("#fitBtn").onclick = fit;
  $("#shortcutsBtn").onclick = openShortcuts;
  $("#closeShortcuts").onclick = closeShortcuts;
  $("#doneShortcuts").onclick = closeShortcuts;
  $("#shortcutDialog").addEventListener("click", (e) => {
    if (e.target.id === "shortcutDialog") closeShortcuts();
  });
  $("#resetShortcuts").onclick = () => {
    shortcuts = { ...defaults };
    localStorage.setItem("dorojam-shortcuts", JSON.stringify(shortcuts));
    renderShortcuts();
    toast("初期設定に戻しました");
  };
  $("#fileBtn").onclick = () => $("#fileMenu").classList.toggle("hidden");
  $("#exportBtn").onclick = exportDrawio;
  $("#fileInput").onchange = (e) => {
    if (e.target.files[0]) openDrawio(e.target.files[0]);
    e.target.value = "";
  };
  document.querySelectorAll("[data-file]").forEach(
    (b) =>
      (b.onclick = () => {
        $("#fileMenu").classList.add("hidden");
        ({
          new: newBoard,
          open: () => $("#fileInput").click(),
          save: exportDrawio,
          svg: exportSVG,
          png: exportPNG,
        })[b.dataset.file]();
      }),
  );
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest("#fileBtn,#fileMenu"))
      $("#fileMenu").classList.add("hidden");
  });
  workspace.removeEventListener("pointercancel", pointerUp);
  workspace.addEventListener("pointercancel", () => {
    const wasChanged = interaction?.committed;
    interaction = null;
    workspace.classList.remove("panning");
    render();
    if (wasChanged) persist();
  });
  workspace.addEventListener("dragstart", (e) => e.preventDefault(), true);
  workspace.addEventListener(
    "selectstart",
    (e) => {
      if (!e.target.closest("input,textarea,[contenteditable]"))
        e.preventDefault();
    },
    true,
  );
  workspace.addEventListener("pointerleave", () => {
    if (!interaction) {
      hover = null;
      render();
    }
  });
  $("#registerShapeBtn").onclick = () => {
    const n = item([...selected][0]);
    if (n && n.type !== "connector")
      addPreset(n.type, (n.text || labels[n.type] || "図形").split("\n")[0], n);
  };
  $("#addPreset").onclick = () =>
    addPreset($("#presetType").value, $("#presetName").value);
  $("#presetName").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      $("#addPreset").click();
    }
  });
  // The same actions are available to supported browser agents.
  if (document.modelContext?.registerTool) {
    for (const [name, description, execute] of [
      [
        "create_shape",
        "Create a shape on the visible diagram",
        (input) => {
          if (
            ![
              "rect",
              "ellipse",
              "diamond",
              "sticky",
              "section",
              "text",
            ].includes(input.type)
          )
            throw Error("Invalid shape type");
          create(input.type, {
            x: Number(input.x) || 300,
            y: Number(input.y) || 240,
          });
          const n = item([...selected][0]);
          if (typeof input.text === "string") {
            n.text = input.text;
            changed();
          }
          return { id: n.id, type: n.type };
        },
      ],
      [
        "read_diagram",
        "Read the visible diagram",
        () => ({ title: doc.title, items: clone(doc.items) }),
      ],
    ]) {
      try {
        void Promise.resolve(
          document.modelContext.registerTool({
            name,
            description,
            inputSchema:
              name === "create_shape"
                ? {
                    type: "object",
                    properties: {
                      type: {
                        type: "string",
                        enum: [
                          "rect",
                          "ellipse",
                          "diamond",
                          "sticky",
                          "section",
                          "text",
                        ],
                      },
                      x: { type: "number" },
                      y: { type: "number" },
                      text: { type: "string" },
                    },
                    required: ["type"],
                    additionalProperties: false,
                  }
                : {
                    type: "object",
                    properties: {},
                    additionalProperties: false,
                  },
            annotations: {
              readOnlyHint: name === "read_diagram",
              untrustedContentHint: false,
            },
            execute,
          }),
        ).catch(() => {});
      } catch {}
    }
  }
  render();
  updateGrid();
  renderShortcuts();
})();
