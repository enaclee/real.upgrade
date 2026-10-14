
async function spin() {
  if (isSpinning) return;

  const source = getItem(sourceId);
  const target = getItem(targetId);

  if (!source || !target || source.id === target.id || target.price <= source.price) {
    return;
  }

  const chance = Math.max(
    1,
    Math.min(95, Math.floor((source.price / target.price) * 100))
  );

  const win = Math.random() * 100 < chance;

  // Создаём стрелку внутри существующего индикатора шанса.
  const ring = $("chance-ring");
  let pointer = ring.querySelector(".roll-pointer");

  if (!pointer) {
    pointer = document.createElement("div");
    pointer.className = "roll-pointer";
    pointer.innerHTML = '<div class="roll-pointer-tip"></div>';
    ring.appendChild(pointer);
  }

  isSpinning = true;
  $("spin-btn").disabled = true;
  $("spin-status").textContent = "Индикатор замедляется…";

  $("source-stage").classList.add("spinning");
  $("target-stage").classList.add("spinning");

  // Успех останавливается внутри цветной зоны шанса,
  // неудача — за её пределами.
  const successEnd = Math.max(2, chance * 3.6 - 3);
  const failureStart = chance * 3.6 + 4;
  const finalAngle = win
    ? 3 + Math.random() * Math.max(1, successEnd - 3)
    : failureStart + Math.random() * Math.max(1, 350 - failureStart);

  pointer.getAnimations().forEach(animation => animation.cancel());
  pointer.style.transform = "rotate(0deg)";

  // Несколько быстрых оборотов с плавным торможением.
  const animation = pointer.animate(
    [
      { transform: "rotate(0deg)" },
      { transform: `rotate(${360 * 5 + finalAngle}deg)` }
    ],
    {
      duration: 5200,
      easing: "cubic-bezier(0.12, 0.72, 0.12, 1)",
      fill: "forwards"
    }
  );

  try {
    await animation.finished;
  } catch (error) {
    // Если анимацию прервали, не продолжаем апгрейд.
    isSpinning = false;
    $("source-stage").classList.remove("spinning");
    $("target-stage").classList.remove("spinning");
    renderMain();
    return;
  }

  stats.upgrades++;

  if (win) {
    const won = {
      ...target,
      id: uid(),
      created: Date.now(),
      demo: false
    };

    try {
      await dbPut(won);
      items.push(won);
    } catch (error) {
      showToast("Не удалось сохранить выигрыш");
      isSpinning = false;
      renderMain();
      return;
    }

    if (!source.demo) {
      try {
        await dbDelete(source.id);
      } catch (error) {}
    }

    items = items.filter(item => item.id !== source.id);
    sourceId = won.id;
    stats.wins++;
  } else {
    if (!source.demo) {
      try {
        await dbDelete(source.id);
      } catch (error) {}
    }

    items = items.filter(item => item.id !== source.id);
    sourceId = null;
  }

  history.push({
    id: uid(),
    date: Date.now(),
    sourceName: source.name,
    targetName: target.name,
    chance,
    win
  });

  if (history.length > 100) {
    history = history.slice(-100);
  }

  $("source-stage").classList.remove("spinning");
  $("target-stage").classList.remove("spinning");

  isSpinning = false;
  renderMain();
  renderInventory();
  renderHistory();
  showResult(win, source, target, chance);
  persistSession();
}
