
(() => {
  const DB_NAME = "enaclee-upgrader-db";
  const DB_VERSION = 1;
  const STORE = "items";
  const START_BALANCE = 100000;

  const $ = id => document.getElementById(id);
  const money = n => `${Math.round(n).toLocaleString("ru-RU")} CR`;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ВАЖНО: изображения находятся в корне репозитория.
  const demoItems = [
    {id:"demo-chair",name:"Офисный стул",price:2500,image:"chair.svg",demo:true},
    {id:"demo-desk",name:"Письменный стол",price:4500,image:"desk.svg",demo:true},
    {id:"demo-phone",name:"Смартфон",price:12000,image:"phone.svg",demo:true},
    {id:"demo-laptop",name:"Ноутбук",price:28000,image:"laptop.svg",demo:true},
    {id:"demo-console",name:"Игровая приставка",price:42000,image:"console.svg",demo:true},
    {id:"demo-car",name:"Спортивный автомобиль",price:90000,image:"car.svg",demo:true}
  ];

  let db;
  let items = [...demoItems];
  let balance = START_BALANCE;
  let history = [];
  let stats = {upgrades:0,wins:0};
  let sourceId = "demo-chair";
  let targetId = "demo-phone";
  let busy = false;

  function loadSession() {
    try {
      const s = JSON.parse(localStorage.getItem("enaclee-upgrader-session") || "null");
      if (!s) return;
      balance = Number.isFinite(s.balance) ? s.balance : START_BALANCE;
      history = Array.isArray(s.history) ? s.history : [];
      stats = s.stats || stats;
      sourceId = s.sourceId || sourceId;
      targetId = s.targetId || targetId;
    } catch (_) {}
  }

  function saveSession() {
    try {
      localStorage.setItem("enaclee-upgrader-session", JSON.stringify({
        balance, history, stats, sourceId, targetId
      }));
    } catch (_) {}
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, {keyPath:"id"});
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function readItems() {
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  function writeItem(item) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function deleteItem(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  function getItem(id) {
    return items.find(x => x.id === id) || null;
  }

  function safeText(text) {
    return String(text).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    })[c]);
  }

  function notify(message) {
    const toast = $("toast");
    if (!toast) {
      alert(message);
      return;
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
  }

  function drawStage(id, item, title, subtitle) {
    const stage = $(id);
    if (!stage) return;
    stage.innerHTML = "";

    if (!item) {
      stage.innerHTML = `<div class="empty-item">
        <div class="empty-icon">＋</div>
        <b>${title}</b><span>${subtitle}</span>
      </div>`;
      return;
    }

    const img = document.createElement("img");
    img.src = item.image;
    img.alt = item.name;
    img.onerror = () => {
      img.onerror = null;
      img.src = "data:image/svg+xml," + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200">
        <rect width="100%" height="100%" fill="#191a28"/>
        <text x="50%" y="50%" text-anchor="middle" fill="#c5b1ff"
        font-size="18">${safeText(item.name)}</text></svg>`
      );
    };
    stage.appendChild(img);
  }

  function render() {
    const source = getItem(sourceId);
    const target = getItem(targetId);

    drawStage("source-stage", source, "Выбери предмет", "Загрузи фотографию ниже");
    drawStage("target-stage", target, "Выбери цель", "из каталога предметов");

    if ($("source-name")) $("source-name").textContent = source?.name || "Не выбран";
    if ($("source-value")) $("source-value").textContent = source ? money(source.price) : "—";
    if ($("target-name")) $("target-name").textContent = target?.name || "Не выбран";
    if ($("target-value")) $("target-value").textContent = target ? money(target.price) : "—";
    if ($("balance")) $("balance").textContent = Math.round(balance).toLocaleString("ru-RU");
    if ($("item-count")) $("item-count").textContent = items.length;
    if ($("stat-items")) $("stat-items").textContent = items.length;
    if ($("stat-upgrades")) $("stat-upgrades").textContent = stats.upgrades;
    if ($("stat-wins")) $("stat-wins").textContent = stats.wins;

    let chance = 0;
    if (source && target && source.id !== target.id && target.price > source.price) {
      chance = Math.max(1, Math.min(95, Math.floor(source.price / target.price * 100)));
    }

    if ($("chance")) $("chance").textContent = chance + "%";
    if ($("spin-btn")) {
      $("spin-btn").disabled = busy || !source || !target ||
        source.id === target.id || target.price <= source.price;
    }

    if ($("spin-status")) {
      $("spin-status").textContent = !source || !target
        ? "Выбери два предмета"
        : source.id === target.id
        ? "Нужны разные предметы"
        : target.price <= source.price
        ? "Цель должна быть дороже"
        : "При неудаче исходный предмет теряется";
    }

    saveSession();
    renderInventory();
    renderHistory();
  }

  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(b =>
      b.classList.toggle("active", b.dataset.tab === name)
    );
    ["upgrade","inventory","history"].forEach(tab => {
      const view = $(`${tab}-view`);
      if (view) view.classList.toggle("hidden", tab !== name);
    });
  }

  function renderInventory() {
    const grid = $("inventory-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const query = ($("inventory-search")?.value || "").toLowerCase();
    const sort = $("sort-items")?.value || "newest";
    let list = items.filter(x => x.name.toLowerCase().includes(query));

    if (sort === "low") list.sort((a,b) => a.price-b.price);
    if (sort === "high") list.sort((a,b) => b.price-a.price);
    if (sort === "az") list.sort((a,b) => a.name.localeCompare(b.name,"ru"));
    if (sort === "newest") list.reverse();

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><b>Инвентарь пуст</b>Добавь фотографию предмета.</div>';
      return;
    }

    list.forEach(item => {
      const card = document.createElement("article");
      card.className = "inv-card";
      card.innerHTML = `
        <div class="inv-image"><img alt=""></div>
        <div class="rarity-line"></div>
        <div class="inv-body">
          <h3>${safeText(item.name)}</h3>
          <div class="price">${money(item.price)}</div>
          <div class="card-actions">
            <button data-action="source">На апгрейд</button>
            <button data-action="target">Цель</button>
            <button data-action="delete" class="delete">×</button>
          </div>
        </div>`;
      const img = card.querySelector("img");
      img.src = item.image;
      img.onerror = () => { img.style.display = "none"; };

      card.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", async () => {
          const action = button.dataset.action;
          if (action === "source") {
            sourceId = item.id;
            switchTab("upgrade");
            render();
          } else if (action === "target") {
            targetId = item.id;
            switchTab("upgrade");
            render();
          } else if (action === "delete") {
            if (!confirm(`Удалить «${item.name}»?`)) return;
            items = items.filter(x => x.id !== item.id);
            if (!item.demo && db) {
              try { await deleteItem(item.id); } catch (_) {}
            }
            if (sourceId === item.id) sourceId = null;
            if (targetId === item.id) targetId = null;
            render();
            notify("Предмет удалён");
          }
        });
      });
      grid.appendChild(card);
    });
  }

  function renderHistory() {
    const list = $("history-list");
    if (!list) return;
    list.innerHTML = "";
    if (!history.length) {
      list.innerHTML = '<div class="empty-state"><b>История пока пуста</b>Результаты появятся здесь.</div>';
      return;
    }

    history.slice().reverse().forEach(entry => {
      const row = document.createElement("div");
      row.className = "history-row";
      row.innerHTML = `
        <div class="history-icon">${entry.win ? "↗" : "↘"}</div>
        <div><b>${safeText(entry.sourceName)} → ${safeText(entry.targetName)}</b>
        <p>${new Date(entry.date).toLocaleString("ru-RU")} · шанс ${entry.chance}%</p></div>
        <div class="history-result ${entry.win ? "win" : "lose"}">${entry.win ? "УСПЕХ" : "НЕУДАЧА"}</div>`;
      list.appendChild(row);
    });
  }

  function closeModal() {
    $("modal")?.classList.add("hidden");
  }

  function openPicker(mode) {
    const modal = $("modal");
    const content = $("modal-content");
    if (!modal || !content) {
      notify("Не найдено окно выбора в index.html");
      return;
    }

    $("modal-title").textContent = mode === "upload"
      ? "Добавить предмет"
      : mode === "source" ? "Выбери исходный предмет" : "Выбери цель апгрейда";
    content.innerHTML = "";

    if (mode === "upload") {
      content.innerHTML = `
        <form class="upload-form" id="upload-form">
          <label class="upload-preview" id="upload-preview"><span>Выбери фото ниже</span></label>
          <input id="upload-file" type="file" accept="image/*" required>
          <div class="form-row">
            <div class="field"><label>НАЗВАНИЕ</label><input id="item-name" maxlength="60" required placeholder="Мой стол"></div>
            <div class="field"><label>КАТЕГОРИЯ</label><select id="item-category">
              <option>Мебель</option><option>Техника</option><option>Одежда</option>
              <option>Транспорт</option><option>Другое</option>
            </select></div>
          </div>
          <div class="field"><label>ИГРОВАЯ СТОИМОСТЬ (CR)</label>
            <input id="item-price" type="number" min="100" max="100000000" value="2500" required>
          </div>
          <button class="spin-btn" type="submit"><span>СОХРАНИТЬ ПРЕДМЕТ</span><span>＋</span></button>
        </form>`;

      let photoData = null;
      $("upload-file").addEventListener("change", async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) return notify("Выбери изображение");
        if (file.size > 12 * 1024 * 1024) return notify("Максимум 12 МБ");

        try {
          photoData = await compress(file);
          const preview = $("upload-preview");
          preview.innerHTML = "";
          const img = document.createElement("img");
          img.src = photoData;
          preview.appendChild(img);
          if (!$("item-name").value) {
            $("item-name").value = file.name.replace(/\.[^.]+$/,"").slice(0,60);
          }
        } catch (_) {
          notify("Не удалось прочитать фото");
        }
      });

      $("upload-form").addEventListener("submit", async e => {
        e.preventDefault();
        if (!photoData) return notify("Сначала выбери фотографию");
        const price = Number($("item-price").value);
        const name = $("item-name").value.trim();
        if (!name || price < 100 || !Number.isFinite(price)) return notify("Проверь название и цену");

        const item = {
          id:uid(), name, price:Math.round(price),
          category:$("item-category").value,
          image:photoData, created:Date.now(), demo:false
        };
        try {
          if (!db) throw new Error("No database");
          await writeItem(item);
          items.push(item);
          sourceId = item.id;
          closeModal();
          switchTab("upgrade");
          render();
          notify("Фото сохранено в этом браузере");
        } catch (_) {
          notify("Не удалось сохранить фото. Попробуй уменьшить изображение.");
        }
      });
    } else {
      const grid = document.createElement("div");
      grid.className = "modal-grid";
      const list = items.filter(x => mode !== "target" || x.id !== sourceId);
      list.forEach(item => {
        const button = document.createElement("button");
        button.className = "modal-item";
        button.innerHTML = `<img alt=""><span>${safeText(item.name)}<b>${money(item.price)}</b></span>`;
        button.querySelector("img").src = item.image;
        button.querySelector("img").onerror = e => e.target.style.display = "none";
        button.addEventListener("click", () => {
          if (mode === "source") sourceId = item.id;
          else targetId = item.id;
          closeModal();
          render();
        });
        grid.appendChild(button);
      });
      content.appendChild(grid);
      const upload = document.createElement("button");
      upload.className = "secondary-btn full";
      upload.style.marginTop = "12px";
      upload.textContent = "＋ Загрузить новый предмет";
      upload.onclick = () => openPicker("upload");
      content.appendChild(upload);
    }
    modal.classList.remove("hidden");
  }

  async function compress(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve,reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
      });
      const scale = Math.min(1, 1400 / Math.max(img.width,img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);
      return await new Promise((resolve,reject) => canvas.toBlob(blob => {
        if (!blob) return reject(new Error("Compression failed"));
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      },"image/webp",0.85));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function spin() {
    if (busy) return;
    const source = getItem(sourceId);
    const target = getItem(targetId);
    if (!source || !target || source.id === target.id || target.price <= source.price) return;

    const chance = Math.max(1, Math.min(95, Math.floor(source.price / target.price * 100)));
    busy = true;
    render();
    if ($("spin-status")) $("spin-status").textContent = "Крутим…";
    $("source-stage")?.classList.add("spinning");
    $("target-stage")?.classList.add("spinning");

    await new Promise(resolve => setTimeout(resolve,1600));
    const win = Math.random() * 100 < chance;

    stats.upgrades++;
    if (win) {
      const prize = {...target,id:uid(),created:Date.now(),demo:false};
      try {
        if (!db) throw new Error("No database");
        await writeItem(prize);
        items.push(prize);
      } catch (_) {
        notify("Выигрыш получен, но не удалось сохранить его");
      }
      if (!source.demo && db) {
        try { await deleteItem(source.id); } catch (_) {}
      }
      items = items.filter(x => x.id !== source.id);
      sourceId = prize.id;
      stats.wins++;
    } else {
      if (!source.demo && db) {
        try { await deleteItem(source.id); } catch (_) {}
      }
      items = items.filter(x => x.id !== source.id);
      sourceId = null;
    }

    history.push({
      date:Date.now(),sourceName:source.name,targetName:target.name,
      chance,win
    });
    if (history.length > 100) history = history.slice(-100);

    $("source-stage")?.classList.remove("spinning");
    $("target-stage")?.classList.remove("spinning");
    busy = false;
    render();

    const stage = $("target-stage");
    if (stage) {
      const result = document.createElement("div");
      result.className = "result-overlay " + (win ? "win" : "lose");
      result.textContent = win ? "UPGRADE SUCCESS" : "FAILED";
      stage.appendChild(result);
      setTimeout(() => result.remove(),1800);
    }
    notify(win ? "Успех! Предмет улучшен." : "Неудача! Исходный предмет потерян.");
  }

  async function reset() {
    if (!confirm("Сбросить инвентарь, баланс и историю?")) return;
    try {
      const tx = db.transaction(STORE,"readwrite");
      tx.objectStore(STORE).clear();
      await new Promise(resolve => tx.oncomplete = resolve);
    } catch (_) {}
    items = [...demoItems];
    balance = START_BALANCE;
    history = [];
    stats = {upgrades:0,wins:0};
    sourceId = "demo-chair";
    targetId = "demo-phone";
    localStorage.removeItem("enaclee-upgrader-session");
    render();
    switchTab("upgrade");
    notify("Демо сброшено");
  }

  function wireEvents() {
    document.querySelectorAll(".tab").forEach(button =>
      button.addEventListener("click", () => switchTab(button.dataset.tab))
    );
    $("upload-btn")?.addEventListener("click", () => openPicker("upload"));
    $("inventory-upload")?.addEventListener("click", () => openPicker("upload"));
    $("choose-source")?.addEventListener("click", () => openPicker("source"));
    $("choose-target")?.addEventListener("click", () => openPicker("target"));
    $("random-target")?.addEventListener("click", () => {
      const source = getItem(sourceId);
      const choices = items.filter(x => x.price > (source?.price || 0));
      if (!choices.length) return notify("Нет предметов дороже исходного");
      targetId = choices[Math.floor(Math.random()*choices.length)].id;
      render();
    });
    $("spin-btn")?.addEventListener("click",spin);
    $("close-modal")?.addEventListener("click",closeModal);
    $("modal")?.addEventListener("click",e => {
      if (e.target === $("modal")) closeModal();
    });
    $("inventory-search")?.addEventListener("input",renderInventory);
    $("sort-items")?.addEventListener("change",renderInventory);
    $("clear-history")?.addEventListener("click",() => {
      if (confirm("Очистить историю?")) {
        history = [];
        saveSession();
        renderHistory();
      }
    });
    $("reset-demo")?.addEventListener("click",reset);
    document.addEventListener("keydown",e => {
      if (e.key === "Escape") closeModal();
    });
  }

  async function boot() {
    loadSession();
    wireEvents();
    try {
      db = await openDB();
      items = [...demoItems,...await readItems()];
    } catch (error) {
      console.error(error);
      items = [...demoItems];
      notify("Хранилище недоступно: загрузка фото может не работать");
    }

    if (!getItem(sourceId)) sourceId = "demo-chair";
    if (!getItem(targetId)) targetId = "demo-phone";
    render();
  }

  boot();
})();
