(() => {
  const DB_NAME = "enaclee-upgrader-db";
  const DB_VERSION = 1;
  const STORE = "items";
  const SEED_BALANCE = 100000;
  const $ = (id) => document.getElementById(id);
  const money = (n) => `${Math.round(n).toLocaleString("ru-RU")} CR`;
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,9)}`;
  const fallbackItems = [
    {id:"demo-chair",name:"Офисный стул",price:2500,category:"Мебель",image:"assets/chair.svg",demo:true,created:1},
    {id:"demo-desk",name:"Письменный стол",price:4500,category:"Мебель",image:"assets/desk.svg",demo:true,created:2},
    {id:"demo-phone",name:"Смартфон",price:12000,category:"Техника",image:"assets/phone.svg",demo:true,created:3},
    {id:"demo-laptop",name:"Ноутбук",price:28000,category:"Техника",image:"assets/laptop.svg",demo:true,created:4},
    {id:"demo-console",name:"Игровая приставка",price:42000,category:"Техника",image:"assets/console.svg",demo:true,created:5},
    {id:"demo-car",name:"Спортивный автомобиль",price:90000,category:"Транспорт",image:"assets/car.svg",demo:true,created:6}
  ];
  let db = null, items = [], sourceId = null, targetId = null;
  let balance = SEED_BALANCE, history = [], stats = {upgrades:0,wins:0};
  let pendingImage = null, pendingName = "", pendingType = "user";
  let toastTimer = null, isSpinning = false, modalMode = "source";

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) return reject(new Error("IndexedDB недоступна"));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, {keyPath:"id"});
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  function dbGetAll() {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  function dbPut(item) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(item);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  function dbDelete(id) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
  function persistSession() {
    try {
      localStorage.setItem("enaclee-upgrader-session", JSON.stringify({balance,history,stats,sourceId,targetId}));
    } catch(e) {}
  }
  function loadSession() {
    try {
      const saved = JSON.parse(localStorage.getItem("enaclee-upgrader-session") || "null");
      if (saved) {
        balance = Number.isFinite(saved.balance) ? saved.balance : SEED_BALANCE;
        history = Array.isArray(saved.history) ? saved.history : [];
        stats = saved.stats || {upgrades:0,wins:0};
        sourceId = saved.sourceId || null;
        targetId = saved.targetId || null;
      }
    } catch(e) {}
  }
  function getItem(id) { return items.find(item => item.id === id) || null; }
  function imageUrl(item) { return item?.image || ""; }
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function switchTab(tab) {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
    ["upgrade","inventory","history"].forEach(name => $(`${name}-view`).classList.toggle("hidden", name !== tab));
    if (tab === "inventory") renderInventory();
    if (tab === "history") renderHistory();
  }
  function renderStage(stageId, item, emptyTitle, emptySub) {
    const stage = $(stageId);
    stage.innerHTML = "";
    if (!item) {
      stage.innerHTML = `<div class="empty-item"><div class="empty-icon">${stageId==="source-stage"?"＋":"◇"}</div><b>${emptyTitle}</b><span>${emptySub}</span></div>`;
      return;
    }
    const img = document.createElement("img");
    img.src = imageUrl(item); img.alt = item.name;
    img.onerror = () => { img.src = placeholderSvg(item.name); };
    stage.appendChild(img);
  }
  function placeholderSvg(label) {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#191a28"/><text x="50%" y="50%" text-anchor="middle" fill="#b8a1f2" font-family="Arial" font-size="22">${String(label).replace(/[<>&"]/g,"")}</text></svg>`);
  }
  function renderMain() {
    const source = getItem(sourceId), target = getItem(targetId);
    renderStage("source-stage", source, "Выбери предмет", "или загрузи фотографию ниже");
    renderStage("target-stage", target, "Выбери цель", "из каталога предметов");
    $("source-name").textContent = source?.name || "Не выбран";
    $("source-value").textContent = source ? money(source.price) : "—";
    $("target-name").textContent = target?.name || "Не выбран";
    $("target-value").textContent = target ? money(target.price) : "—";
    $("balance").textContent = Math.round(balance).toLocaleString("ru-RU");
    $("item-count").textContent = items.length;
    $("stat-items").textContent = items.length;
    $("stat-upgrades").textContent = stats.upgrades || 0;
    $("stat-wins").textContent = stats.wins || 0;
    const chance = source && target && source.id !== target.id && target.price > source.price
      ? Math.max(1, Math.min(95, Math.floor(source.price / target.price * 100))) : 0;
    $("chance").textContent = `${chance}%`;
    $("chance-ring").style.background = `conic-gradient(from -90deg, #a783ff ${chance*3.6}deg, #211b35 ${chance*3.6}deg)`;
    $("spin-btn").disabled = isSpinning || !source || !target || source.id === target.id || target.price <= source.price;
    if (!source || !target) $("spin-status").textContent = "Выбери два предмета";
    else if (source.id === target.id) $("spin-status").textContent = "Нужны разные предметы";
    else if (target.price <= source.price) $("spin-status").textContent = "Цель должна быть дороже";
    else $("spin-status").textContent = "При неудаче исходный предмет теряется";
    persistSession();
  }
  function renderInventory() {
    const grid = $("inventory-grid");
    const search = ($("inventory-search").value || "").toLowerCase().trim();
    const sort = $("sort-items").value;
    let list = items.filter(item => item.name.toLowerCase().includes(search) || (item.category||"").toLowerCase().includes(search));
    if (sort === "low") list.sort((a,b)=>a.price-b.price);
    else if (sort === "high") list.sort((a,b)=>b.price-a.price);
    else if (sort === "az") list.sort((a,b)=>a.name.localeCompare(b.name,"ru"));
    else list.sort((a,b)=>(b.created||0)-(a.created||0));
    grid.innerHTML = "";
    if (!list.length) {
      grid.innerHTML = `<div class="empty-state"><b>Пока здесь пусто</b>Загрузи фотографию, чтобы добавить первый предмет.</div>`;
      return;
    }
    list.forEach(item => {
      const card = document.createElement("article"); card.className = "inv-card";
      const imgSrc = imageUrl(item);
      card.innerHTML = `<div class="inv-image"><img alt=""></div><div class="rarity-line" style="--rarity:${rarityColor(item.price)}"></div><div class="inv-body"><h3 title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</h3><div class="price">${money(item.price)}</div><div class="card-actions"><button data-act="source">На апгрейд</button><button data-act="target">Цель</button><button data-act="delete" class="delete" title="Удалить">×</button></div></div>`;
      const img = card.querySelector("img"); img.src = imgSrc; img.onerror = () => img.src = placeholderSvg(item.name);
      card.querySelectorAll("button").forEach(btn => btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (act === "source") { sourceId = item.id; switchTab("upgrade"); renderMain(); showToast("Исходный предмет выбран"); }
        if (act === "target") { targetId = item.id; switchTab("upgrade"); renderMain(); showToast("Цель выбрана"); }
        if (act === "delete") {
          if (!confirm(`Удалить «${item.name}» из инвентаря?`)) return;
          items = items.filter(x=>x.id!==item.id);
          if (!item.demo) { try { await dbDelete(item.id); } catch(e) {} }
          if (sourceId===item.id) sourceId=null;
          if (targetId===item.id) targetId=null;
          renderMain(); renderInventory(); showToast("Предмет удалён");
        }
      }));
      grid.appendChild(card);
    });
  }
  function rarityColor(price) {
    if(price>=50000)return "#ffcb69"; if(price>=20000)return "#f77cff"; if(price>=8000)return "#7d9bff"; return "#6de4d3";
  }
  function renderHistory() {
    const list = $("history-list"); list.innerHTML = "";
    if (!history.length) { list.innerHTML = `<div class="empty-state"><b>История пока пуста</b>Результаты твоих апгрейдов появятся здесь.</div>`; return; }
    history.slice().reverse().forEach(entry => {
      const row = document.createElement("div"); row.className = "history-row";
      row.innerHTML = `<div class="history-icon">${entry.win?"↗":"↘"}</div><div><b>${escapeHtml(entry.sourceName)} → ${escapeHtml(entry.targetName)}</b><p>${new Date(entry.date).toLocaleString("ru-RU")} · шанс ${entry.chance}%</p></div><div class="history-result ${entry.win?"win":"lose"}">${entry.win?"УСПЕХ":"НЕУДАЧА"}</div>`;
      list.appendChild(row);
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function openPicker(mode) {
    modalMode = mode;
    $("modal-title").textContent = mode === "source" ? "Выбери исходный предмет" : mode === "target" ? "Выбери цель апгрейда" : "Добавить предмет";
    const content = $("modal-content"); content.innerHTML = "";
    if (mode === "upload") { showUploadForm(content); }
    else {
      const grid = document.createElement("div"); grid.className = "modal-grid";
      const list = items.filter(item => mode !== "target" || !sourceId || item.id !== sourceId);
      if (!list.length) { content.innerHTML = `<div class="empty-state"><b>Нет доступных предметов</b>Сначала загрузи фотографию.</div>`; }
      list.forEach(item => {
        const button = document.createElement("button"); button.className = "modal-item";
        button.innerHTML = `<img alt=""><span>${escapeHtml(item.name)}<b>${money(item.price)}</b></span>`;
        const img=button.querySelector("img"); img.src=imageUrl(item); img.onerror=()=>img.src=placeholderSvg(item.name);
        button.addEventListener("click", () => {
          if (mode==="source") sourceId=item.id; else targetId=item.id;
          closeModal(); renderMain(); showToast(mode==="source"?"Исходный предмет выбран":"Цель выбрана");
        });
        grid.appendChild(button);
      });
      content.appendChild(grid);
      const add = document.createElement("button"); add.className="secondary-btn full"; add.style.marginTop="15px"; add.textContent="＋ Загрузить новый предмет";
      add.addEventListener("click",()=>openPicker("upload")); content.appendChild(add);
    }
    $("modal").classList.remove("hidden");
  }
  function closeModal() { $("modal").classList.add("hidden"); pendingImage=null; }
  function showUploadForm(container) {
    container.innerHTML = `
      <form class="upload-form" id="upload-form">
        <label class="upload-preview" id="upload-preview"><span>Выбери фото предмета ниже</span></label>
        <input id="upload-file" type="file" accept="image/*" required>
        <div class="form-row">
          <div class="field"><label for="item-name">НАЗВАНИЕ ПРЕДМЕТА</label><input id="item-name" maxlength="60" placeholder="Например, мой стол" required></div>
          <div class="field"><label for="item-category">КАТЕГОРИЯ</label><select id="item-category"><option>Мебель</option><option>Техника</option><option>Одежда</option><option>Транспорт</option><option>Другое</option></select></div>
        </div>
        <div class="form-row">
          <div class="field"><label for="item-price">ИГРОВАЯ СТОИМОСТЬ (CR)</label><input id="item-price" type="number" min="100" max="100000000" step="100" value="2500" required></div>
          <div class="field"><label>ОЦЕНКА</label><div style="font-size:10px;color:var(--muted);line-height:1.5;padding:10px 0">Шуточная цена задаётся вручную. Реальная рыночная оценка не выполняется.</div></div>
        </div>
        <button class="spin-btn" type="submit"><span>СОХРАНИТЬ В ИНВЕНТАРЬ</span><span>＋</span></button>
      </form>`;
    const fileInput = $("upload-file");
    fileInput.addEventListener("change", async () => {
      const file=fileInput.files?.[0]; if(!file) return;
      if(!file.type.startsWith("image/")) { showToast("Выбери файл изображения"); return; }
      if(file.size > 12*1024*1024) { showToast("Файл слишком большой (максимум 12 МБ)"); fileInput.value=""; return; }
      try {
        pendingImage = await compressImage(file);
        const preview=$("upload-preview"); preview.innerHTML="";
        const img=document.createElement("img"); img.src=pendingImage; preview.appendChild(img);
        const name=$("item-name"); if(!name.value) name.value=file.name.replace(/\.[^.]+$/,"").slice(0,60);
      } catch(e) { showToast("Не удалось прочитать изображение"); }
    });
    $("upload-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if(!pendingImage) { showToast("Сначала выбери фотографию"); return; }
      const price=Number($("item-price").value);
      if(!Number.isFinite(price)||price<100||price>100000000) { showToast("Укажи стоимость от 100 до 100 000 000 CR"); return; }
      const item={id:uid(),name:$("item-name").value.trim(),category:$("item-category").value,price:Math.round(price),image:pendingImage,created:Date.now(),demo:false};
      if(!item.name) { showToast("Введи название предмета"); return; }
      try {
        await dbPut(item);
        items.push(item); sourceId=item.id;
        closeModal(); renderMain(); switchTab("upgrade");
        showToast("Предмет сохранён в локальном инвентаре");
      } catch(err) {
        showToast("Не удалось сохранить. Возможно, закончилось место в браузере.");
      }
    });
  }
  async function compressImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=url;});
      const max=1400, scale=Math.min(1,max/Math.max(img.width,img.height));
      const canvas=document.createElement("canvas"); canvas.width=Math.max(1,Math.round(img.width*scale)); canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext("2d",{alpha:true}); ctx.drawImage(img,0,0,canvas.width,canvas.height);
      return await new Promise(resolve=>canvas.toBlob(blob=>{
        if(!blob) return resolve(canvas.toDataURL("image/png"));
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);
      },"image/webp",0.88));
    } finally { URL.revokeObjectURL(url); }
  }
  function showResult(win, source, target, chance) {
    const stage = $("target-stage");
    const overlay = document.createElement("div");
    overlay.className = `result-overlay ${win?"win":"lose"}`;
    overlay.textContent = win ? "UPGRADE SUCCESS" : "FAILED";
    stage.appendChild(overlay);
    $("spin-status").textContent = win ? "Успех! Предмет улучшен." : "Неудача. Исходный предмет потерян.";
    setTimeout(()=>overlay.remove(),1900);
  }
  async function spin() {
    if (isSpinning) return;
    const source=getItem(sourceId), target=getItem(targetId);
    if(!source||!target||source.id===target.id||target.price<=source.price) return;
    const chance=Math.max(1,Math.min(95,Math.floor(source.price/target.price*100)));
    isSpinning=true; $("spin-btn").disabled=true;
    $("source-stage").classList.add("spinning"); $("target-stage").classList.add("spinning");
    $("spin-status").textContent="Проверяем удачу…";
    await new Promise(r=>setTimeout(r,1600));
    const win=Math.random()*100<chance;
    stats.upgrades++;
    if(win) {
      // Keep the target's item image and value, but make a separate owned copy.
      const won={...target,id:uid(),created:Date.now(),demo:false};
      try { await dbPut(won); items.push(won); } catch(e) { showToast("Не удалось сохранить выигрыш"); }
      if(!source.demo) { try { await dbDelete(source.id); } catch(e) {} }
      items=items.filter(x=>x.id!==source.id);
      sourceId=won.id; stats.wins++;
    } else {
      if(!source.demo) { try { await dbDelete(source.id); } catch(e) {} }
      items=items.filter(x=>x.id!==source.id);
      sourceId=null;
    }
    history.push({id:uid(),date:Date.now(),sourceName:source.name,targetName:target.name,chance,win});
    if(history.length>100) history=history.slice(-100);
    $("source-stage").classList.remove("spinning"); $("target-stage").classList.remove("spinning");
    isSpinning=false; renderMain(); renderInventory(); renderHistory();
    showResult(win,source,target,chance);
    persistSession();
  }
  async function resetDemo() {
    if(!confirm("Сбросить баланс, историю и все загруженные предметы? Это действие нельзя отменить.")) return;
    try {
      const tx=db.transaction(STORE,"readwrite"); tx.objectStore(STORE).clear();
      await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
    } catch(e) {}
    items=[]; history=[]; stats={upgrades:0,wins:0}; balance=SEED_BALANCE; sourceId=null; targetId=null;
    localStorage.removeItem("enaclee-upgrader-session");
    await initItems(); renderMain(); renderInventory(); renderHistory(); switchTab("upgrade");
    showToast("Демо сброшено");
  }
  async function initItems() {
    const saved=await dbGetAll();
    items=[...fallbackItems,...saved];
    // If the restored selection no longer exists, clear it.
    if(sourceId && !getItem(sourceId)) sourceId=null;
    if(targetId && !getItem(targetId)) targetId=null;
    if(!sourceId) sourceId=fallbackItems[0].id;
    if(!targetId) targetId=fallbackItems[2].id;
  }
  function wireEvents() {
    document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>switchTab(btn.dataset.tab)));
    $("upload-btn").addEventListener("click",()=>openPicker("upload"));
    $("inventory-upload").addEventListener("click",()=>openPicker("upload"));
    $("choose-source").addEventListener("click",()=>openPicker("source"));
    $("choose-target").addEventListener("click",()=>openPicker("target"));
    $("random-target").addEventListener("click",()=>{
      const source=getItem(sourceId);
      const choices=items.filter(x=>x.price>(source?.price||0));
      if(!choices.length){showToast("Нет предметов дороже исходного");return;}
      targetId=choices[Math.floor(Math.random()*choices.length)].id; renderMain();
    });
    $("spin-btn").addEventListener("click",spin);
    $("close-modal").addEventListener("click",closeModal);
    $("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal();});
    $("inventory-search").addEventListener("input",renderInventory);
    $("sort-items").addEventListener("change",renderInventory);
    $("clear-history").addEventListener("click",()=>{if(confirm("Очистить историю апгрейдов?")){history=[];persistSession();renderHistory();}});
    $("reset-demo").addEventListener("click",resetDemo);
    $("photo-input").addEventListener("change", async e=>{
      const file=e.target.files?.[0]; if(!file)return;
      openPicker("upload");
      // Hand off selected file to modal form once it is mounted.
      setTimeout(()=>{
        const target=$("upload-file");
        if(target){const transfer=new DataTransfer();transfer.items.add(file);target.files=transfer.files;target.dispatchEvent(new Event("change"));}
      },0);
      e.target.value="";
    });
    document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});
  }
  async function boot() {
    wireEvents(); loadSession();
    try { db=await openDB(); await initItems(); }
    catch(e) {
      console.error(e);
      items=[...fallbackItems];
      showToast("Локальное хранилище недоступно — загруженные предметы не сохранятся");
    }
    renderMain(); renderInventory(); renderHistory();
  }
  boot();
})();