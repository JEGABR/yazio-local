// NutriFlow — App Local Estilo Yazio para iPhone (PWA)
(function () {
  'use strict';

  const STORAGE_KEY = 'nutriflow_yazio_state_v1';

  const MEAL_CONFIG = [
    { key: 'breakfast', title: 'Café da Manhã', icon: '☕', ratio: 0.25 },
    { key: 'lunch',     title: 'Almoço',        icon: '🍲', ratio: 0.35 },
    { key: 'dinner',    title: 'Jantar',        icon: '🥗', ratio: 0.25 },
    { key: 'snacks',    title: 'Lanches',       icon: '🍎', ratio: 0.15 }
  ];

  // Utilitários de Data (fuso local YYYY-MM-DD)
  function toDateKey(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateKey(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }

  function normalizeText(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  const todayKey = toDateKey(new Date());
  let selectedDateKey = todayKey;
  let activeSearchTab = 'all';
  let selectedFoodForModal = null;
  let html5QrCodeScanner = null;
  let onlineSearchResults = [];

  // Estado Padrão
  function getDefaultState() {
    const d1 = new Date();
    d1.setDate(d1.getDate() - 6);
    const d2 = new Date();
    d2.setDate(d2.getDate() - 3);

    return {
      profile: {
        gender: 'male',
        age: 28,
        height: 175,
        weight: 76.5,
        startWeight: 78.0,
        targetWeight: 72.0,
        activity: 1.375,
        goalType: 'lose'
      },
      goals: {
        kcal: 2050,
        carb: 215,
        prot: 155,
        fat: 63,
        water: 2500
      },
      days: {},
      weightHistory: [
        { date: toDateKey(d1), weight: 78.0 },
        { date: toDateKey(d2), weight: 77.2 },
        { date: todayKey,      weight: 76.5 }
      ],
      customFoods: [],
      favorites: ['taco_25', 'taco_37', 'taco_1', 'taco_21', 'taco_3', 'taco_55', 'taco_76']
    };
  }

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return getDefaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(getDefaultState(), parsed);
    } catch (err) {
      console.error('Erro ao carregar dados locais:', err);
      return getDefaultState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Erro ao salvar estado:', err);
    }
  }

  function getDayRecord(dateKey) {
    if (!state.days[dateKey]) {
      state.days[dateKey] = {
        meals: { breakfast: [], lunch: [], dinner: [], snacks: [] },
        exercises: [],
        waterMl: 0
      };
    }
    return state.days[dateKey];
  }

  // Toast Notification
  let toastTimeout = null;
  function showToast(msg) {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2400);
  }

  // ==================== NAVEGAÇÃO DE DATAS E SEMANA ====================
  function changeSelectedDate(offsetDays) {
    const current = parseDateKey(selectedDateKey);
    current.setDate(current.getDate() + offsetDays);
    selectedDateKey = toDateKey(current);
    renderAll();
  }

  function calculateStreak() {
    let streak = 0;
    const cursor = new Date();
    for (let i = 0; i < 365; i++) {
      const key = toDateKey(cursor);
      const day = state.days[key];
      const hasActivity =
        day &&
        (day.waterMl > 0 ||
          day.exercises.length > 0 ||
          Object.values(day.meals).some((arr) => arr.length > 0));

      if (hasActivity) {
        streak++;
      } else if (i > 0) {
        break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return Math.max(1, streak);
  }

  function renderHeaderAndWeek() {
    const dateObj = parseDateKey(selectedDateKey);
    const mainLabel = document.getElementById('currentDateLabel');
    const subLabel = document.getElementById('currentDateSub');
    const btnJumpToday = document.getElementById('btnJumpToday');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const weekdayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    if (selectedDateKey === todayKey) {
      mainLabel.textContent = 'Hoje';
      btnJumpToday.classList.add('hidden');
    } else if (selectedDateKey === toDateKey(yesterday)) {
      mainLabel.textContent = 'Ontem';
      btnJumpToday.classList.remove('hidden');
    } else if (selectedDateKey === toDateKey(tomorrow)) {
      mainLabel.textContent = 'Amanhã';
      btnJumpToday.classList.remove('hidden');
    } else {
      mainLabel.textContent = weekdayNames[dateObj.getDay()];
      btnJumpToday.classList.remove('hidden');
    }

    subLabel.textContent = dateObj.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });

    document.getElementById('streakCount').textContent = calculateStreak();

    // Renderizar faixa de 7 dias centrada na semana da data selecionada
    const weekStrip = document.getElementById('weekStrip');
    weekStrip.innerHTML = '';
    const dayOfWeek = dateObj.getDay(); // 0 = Dom ... 6 = Sab
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(dateObj);
    monday.setDate(dateObj.getDate() + mondayOffset);

    const shortDays = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const k = toDateKey(d);
      const dayRec = state.days[k];
      const hasData =
        dayRec &&
        (dayRec.waterMl > 0 ||
          Object.values(dayRec.meals).some((m) => m.length > 0));

      const btn = document.createElement('button');
      btn.className = `week-day-btn ${k === selectedDateKey ? 'active' : ''} ${hasData ? 'has-data' : ''}`;
      btn.innerHTML = `
        <span class="w-name">${shortDays[i]}</span>
        <span class="w-num">${d.getDate()}</span>
      `;
      btn.addEventListener('click', () => {
        selectedDateKey = k;
        renderAll();
      });
      weekStrip.appendChild(btn);
    }
  }

  // ==================== CÁLCULO DO DIA E RENDERIZAÇÃO DO DIÁRIO ====================
  function getDayTotals(dateKey) {
    const day = getDayRecord(dateKey);
    let consumed = 0;
    let carb = 0;
    let prot = 0;
    let fat = 0;

    MEAL_CONFIG.forEach((m) => {
      const items = day.meals[m.key] || [];
      items.forEach((item) => {
        consumed += item.kcal || 0;
        carb += item.carbs || 0;
        prot += item.protein || 0;
        fat += item.fat || 0;
      });
    });

    let burned = 0;
    (day.exercises || []).forEach((ex) => {
      burned += ex.kcal || 0;
    });

    return {
      consumed: Math.round(consumed),
      burned: Math.round(burned),
      carb: Math.round(carb),
      prot: Math.round(prot),
      fat: Math.round(fat),
      waterMl: day.waterMl || 0
    };
  }

  function renderDiaryView() {
    const totals = getDayTotals(selectedDateKey);
    const goals = state.goals;
    const totalBudget = goals.kcal + totals.burned;
    const remaining = totalBudget - totals.consumed;

    document.getElementById('valConsumed').textContent = totals.consumed;
    document.getElementById('valBurned').textContent = totals.burned;
    document.getElementById('valGoalTotal').textContent = goals.kcal;

    const valRemainingEl = document.getElementById('valRemaining');
    const lblRemainingStatus = document.getElementById('lblRemainingStatus');
    const ringEl = document.getElementById('calorieRingProgress');

    if (remaining >= 0) {
      valRemainingEl.textContent = remaining;
      lblRemainingStatus.textContent = 'kcal restantes';
      ringEl.classList.remove('over-limit');
    } else {
      valRemainingEl.textContent = Math.abs(remaining);
      lblRemainingStatus.textContent = 'kcal acima';
      ringEl.classList.add('over-limit');
    }

    // Atualizar anel SVG (circunferência = 2 * PI * 60 = 376.99)
    const circumference = 376.99;
    const ratio = Math.min(1, Math.max(0, totals.consumed / Math.max(1, totalBudget)));
    const offset = circumference - ratio * circumference;
    ringEl.style.strokeDashoffset = offset.toFixed(2);

    // Barras de Macros
    const updateMacroBar = (val, goal, valId, goalId, pctId, barId) => {
      const pct = goal > 0 ? Math.round((val / goal) * 100) : 0;
      document.getElementById(valId).textContent = val;
      document.getElementById(goalId).textContent = goal;
      document.getElementById(pctId).textContent = `${pct}%`;
      document.getElementById(barId).style.width = `${Math.min(100, pct)}%`;
    };

    updateMacroBar(totals.carb, goals.carb, 'valCarb', 'goalCarb', 'carbPct', 'carbBar');
    updateMacroBar(totals.prot, goals.prot, 'valProt', 'goalProt', 'protPct', 'protBar');
    updateMacroBar(totals.fat,  goals.fat,  'valFat',  'goalFat',  'fatPct',  'fatBar');

    // Renderizar Hidratação (Copos de 250ml)
    renderWaterSection(totals.waterMl, goals.water);

    // Renderizar Refeições
    renderMealsList();

    // Renderizar Exercícios
    renderExercisesList();
  }

  function renderWaterSection(waterMl, goalWater) {
    document.getElementById('valWaterMl').textContent = waterMl;
    document.getElementById('goalWaterMl').textContent = goalWater;
    document.getElementById('valWaterLiters').textContent = (waterMl / 1000).toFixed(2);

    const grid = document.getElementById('waterGlassesGrid');
    grid.innerHTML = '';
    const totalGlasses = Math.max(8, Math.ceil(goalWater / 250));
    const filledGlasses = Math.floor(waterMl / 250);

    for (let i = 1; i <= totalGlasses; i++) {
      const isFilled = i <= filledGlasses;
      const btn = document.createElement('button');
      btn.className = `water-glass ${isFilled ? 'filled' : ''}`;
      btn.setAttribute('aria-label', `Copo ${i} (${i * 250}ml)`);
      btn.innerHTML = `
        <div class="glass-cup">
          <div class="glass-water-fill"></div>
        </div>
        <span class="glass-label">${i * 250}</span>
      `;
      btn.addEventListener('click', () => {
        const day = getDayRecord(selectedDateKey);
        if (day.waterMl === i * 250) {
          day.waterMl = (i - 1) * 250;
        } else {
          day.waterMl = i * 250;
        }
        saveState();
        renderAll();
      });
      grid.appendChild(btn);
    }
  }

  function renderMealsList() {
    const container = document.getElementById('mealsContainer');
    container.innerHTML = '';
    const day = getDayRecord(selectedDateKey);

    MEAL_CONFIG.forEach((mealCfg) => {
      const items = day.meals[mealCfg.key] || [];
      const mealKcal = Math.round(items.reduce((acc, it) => acc + (it.kcal || 0), 0));
      const targetMealKcal = Math.round(state.goals.kcal * mealCfg.ratio);

      const card = document.createElement('div');
      card.className = 'meal-card';

      let itemsHtml = '';
      if (items.length > 0) {
        itemsHtml = items
          .map(
            (item, idx) => `
          <div class="logged-item">
            <div class="logged-item-info">
              <span class="logged-item-name">${item.name}</span>
              <span class="logged-item-meta">${item.grams}g · C: ${item.carbs.toFixed(1)}g · P: ${item.protein.toFixed(1)}g · G: ${item.fat.toFixed(1)}g</span>
            </div>
            <div class="logged-item-right">
              <span class="logged-item-kcal">${Math.round(item.kcal)} kcal</span>
              <button class="btn-delete-item" data-meal="${mealCfg.key}" data-idx="${idx}" title="Remover item">✕</button>
            </div>
          </div>
        `
          )
          .join('');
      }

      card.innerHTML = `
        <div class="meal-card-top">
          <div class="meal-info">
            <div class="meal-icon-box">${mealCfg.icon}</div>
            <div>
              <h3 class="meal-title">${mealCfg.title}</h3>
              <p class="meal-kcal-sub"><strong>${mealKcal}</strong> / ${targetMealKcal} kcal recomendadas</p>
            </div>
          </div>
          <button class="meal-add-btn" data-add-meal="${mealCfg.key}" aria-label="Adicionar em ${mealCfg.title}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
        </div>
        <div class="meal-items-list">${itemsHtml}</div>
      `;

      container.appendChild(card);
    });

    // Eventos de adicionar refeição e deletar item
    container.querySelectorAll('[data-add-meal]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mealKey = btn.getAttribute('data-add-meal');
        document.getElementById('searchTargetMeal').value = mealKey;
        switchView('view-search');
        document.getElementById('foodSearchInput').focus();
      });
    });

    container.querySelectorAll('.btn-delete-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mealKey = btn.getAttribute('data-meal');
        const idx = parseInt(btn.getAttribute('data-idx'), 10);
        const dayRec = getDayRecord(selectedDateKey);
        dayRec.meals[mealKey].splice(idx, 1);
        saveState();
        renderAll();
        showToast('Item removido');
      });
    });
  }

  function renderExercisesList() {
    const day = getDayRecord(selectedDateKey);
    const listEl = document.getElementById('exerciseItemsList');
    const totalBurned = Math.round((day.exercises || []).reduce((acc, ex) => acc + ex.kcal, 0));
    document.getElementById('exerciseTotalKcal').textContent = totalBurned;

    if (!day.exercises || day.exercises.length === 0) {
      listEl.innerHTML = '';
      return;
    }

    listEl.innerHTML = day.exercises
      .map(
        (ex, idx) => `
      <div class="logged-item">
        <div class="logged-item-info">
          <span class="logged-item-name">${ex.icon || '🏃'} ${ex.name}</span>
          <span class="logged-item-meta">${ex.minutes} minutos</span>
        </div>
        <div class="logged-item-right">
          <span class="logged-item-kcal" style="color: var(--exercise-color);">-${Math.round(ex.kcal)} kcal</span>
          <button class="btn-delete-item" data-del-ex="${idx}">✕</button>
        </div>
      </div>
    `
      )
      .join('');

    listEl.querySelectorAll('[data-del-ex]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-del-ex'), 10);
        day.exercises.splice(idx, 1);
        saveState();
        renderAll();
      });
    });
  }

  // ==================== BUSCA DE ALIMENTOS, TACO, RECEITAS & OPEN FOOD FACTS ====================
  let autoOnlineDebounce = null;
  let isSearchingOnline = false;
  let recipeBuilderIngredients = [];

  function getAllLocalFoods() {
    const custom = (state.customFoods || []).map((f) => ({
      ...f,
      category: f.category || 'Meus Alimentos'
    }));
    const recipes = (window.BRAZILIAN_RECIPES || []).map((r) => ({
      ...r,
      isRecipe: true
    }));
    return [...custom, ...recipes, ...(window.TACO_FOODS || [])];
  }

  function formatFoodCardHtml(f) {
    const pGrams = f.portionGrams || 100;
    const pFactor = pGrams / 100;
    const pKcal = Math.round(f.kcal * pFactor);
    const isFav = state.favorites.includes(f.id);
    const isRec = f.isRecipe || (f.category && f.category.toLowerCase().includes('receita')) || (f.category && f.category.toLowerCase().includes('pratos'));

    return `
      <div class="food-item-card" data-food-id="${f.id}">
        <div class="food-item-main">
          <span class="food-item-title">${isFav ? '⭐ ' : ''}${isRec ? '👩‍🍳 ' : ''}${f.name}</span>
          <span class="food-item-sub">${f.portionName || 'Porção'} (${pGrams}g) · ${f.category || 'Alimento'}</span>
          <div class="food-item-macros-pills">
            <span class="m-pill-c">C: ${(f.carbs * pFactor).toFixed(1)}g</span>
            <span class="m-pill-p">P: ${(f.protein * pFactor).toFixed(1)}g</span>
            <span class="m-pill-f">G: ${(f.fat * pFactor).toFixed(1)}g</span>
          </div>
        </div>
        <div class="food-item-right">
          <div class="food-item-kcal-badge">
            <strong>${pKcal}</strong>
            <span>kcal</span>
          </div>
          <button class="food-quick-add-btn" data-quick-id="${f.id}" title="Adicionar porção padrão">+</button>
        </div>
      </div>
    `;
  }

  function renderFoodSearchResults() {
    const queryRaw = document.getElementById('foodSearchInput').value.trim();
    const query = normalizeText(queryRaw);
    const clearBtn = document.getElementById('btnClearSearch');
    clearBtn.classList.toggle('hidden', queryRaw.length === 0);

    const listEl = document.getElementById('foodResultsList');
    const allLocal = getAllLocalFoods();
    let foods = [];

    if (activeSearchTab === 'online') {
      foods = onlineSearchResults;
      if (isSearchingOnline) {
        listEl.innerHTML = `<div class="empty-state-box">🌐 Buscando "<strong>${queryRaw}</strong>" nos produtos registrados no Brasil (Open Food Facts)...</div>`;
        return;
      }
      if (foods.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state-box">
            <p>Digite o nome de qualquer produto ou marca de supermercado do Brasil na barra de busca acima para pesquisar em milhares de itens registrados!</p>
          </div>
        `;
        return;
      }
    } else {
      if (activeSearchTab === 'favorites') {
        foods = allLocal.filter((f) => state.favorites.includes(f.id));
      } else if (activeSearchTab === 'recipes') {
        foods = allLocal.filter(
          (f) =>
            f.isRecipe ||
            (f.category && f.category.toLowerCase().includes('receita')) ||
            (f.category && f.category.toLowerCase().includes('pratos'))
        );
      } else {
        foods = allLocal;
      }

      if (query) {
        foods = foods.filter(
          (f) =>
            normalizeText(f.name).includes(query) ||
            normalizeText(f.category).includes(query) ||
            normalizeText(f.ingredients || '').includes(query)
        );
      }
    }

    let html = foods.slice(0, 80).map(formatFoodCardHtml).join('');

    // Se estiver pesquisando por texto, mostrar também os resultados automáticos do supermercado (Open Food Facts Brasil)
    if (activeSearchTab !== 'online' && query.length >= 3) {
      if (isSearchingOnline) {
        html += `<div class="online-results-divider">🌐 Buscando marcas e produtos no Brasil para "${queryRaw}"...</div>`;
      } else if (onlineSearchResults.length > 0) {
        html += `<div class="online-results-divider">🌐 Produtos de Supermercado no Brasil (Open Food Facts)</div>`;
        html += onlineSearchResults.slice(0, 25).map(formatFoodCardHtml).join('');
      }
    }

    if (!html) {
      listEl.innerHTML = `
        <div class="empty-state-box">
          <p>Nenhum item local encontrado para "<strong>${queryRaw}</strong>".</p>
          <p style="margin-top:8px;">${isSearchingOnline ? '🌐 Buscando na base nacional online...' : 'Você pode criar uma receita ou alimento personalizado nos botões acima!'}</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = html;

    // Clicar no card abre o modal detalhado de porção/gramas
    listEl.querySelectorAll('.food-item-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const id = card.getAttribute('data-food-id');
        const foodObj =
          getAllLocalFoods().find((item) => item.id === id) ||
          onlineSearchResults.find((item) => item.id === id);
        if (!foodObj) return;

        // Se clicou direto no botão '+', adiciona a porção padrão imediatamente
        if (e.target.closest('.food-quick-add-btn')) {
          e.stopPropagation();
          addFoodEntryToDiary(
            foodObj,
            foodObj.portionGrams || 100,
            document.getElementById('searchTargetMeal').value
          );
          return;
        }

        openFoodDetailModal(foodObj);
      });
    });
  }

  // Busca Online na API do Open Food Facts Brasil
  async function searchOpenFoodFacts(silentAuto = false) {
    const queryRaw = document.getElementById('foodSearchInput').value.trim();
    if (!queryRaw || queryRaw.length < 2) {
      if (!silentAuto) {
        showToast('Digite o nome de um alimento ou marca na busca');
        document.getElementById('foodSearchInput').focus();
      }
      return;
    }

    isSearchingOnline = true;
    renderFoodSearchResults();

    try {
      const url = `https://br.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        queryRaw
      )}&search_simple=1&action=process&json=1&page_size=28`;
      const res = await fetch(url);
      const data = await res.json();

      onlineSearchResults = (data.products || [])
        .filter((p) => (p.product_name_pt || p.product_name) && p.nutriments)
        .map((p, i) => {
          const n = p.nutriments;
          const kcal100 =
            Number(n['energy-kcal_100g']) ||
            (Number(n['energy_100g']) ? Math.round(Number(n['energy_100g']) / 4.184) : 0);
          const pName = p.product_name_pt || p.product_name;
          return {
            id: `off_${p.code || i}`,
            name: p.brands ? `${pName} (${p.brands.split(',')[0].trim()})` : pName,
            category: 'Mercado Brasil 🌐',
            kcal: Math.round(kcal100),
            carbs: Number(n.carbohydrates_100g) || 0,
            protein: Number(n.proteins_100g) || 0,
            fat: Number(n.fat_100g) || 0,
            portionName: p.serving_size || 'Porção 100g',
            portionGrams: parseInt(p.serving_quantity, 10) || 100
          };
        })
        .filter((f) => f.kcal > 0 || f.protein > 0 || f.carbs > 0);
    } catch (err) {
      console.warn('Busca online indisponível no momento:', err);
    } finally {
      isSearchingOnline = false;
      renderFoodSearchResults();
    }
  }

  // ==================== LEITOR DE CÓDIGO DE BARRAS (CÂMERA + EAN) ====================
  async function startBarcodeScanner() {
    const scannerCard = document.getElementById('barcodeScannerCard');
    const statusEl = document.getElementById('scannerStatusMsg');
    scannerCard.classList.remove('hidden');
    statusEl.textContent = 'Inicializando câmera do iPhone...';

    if (typeof Html5Qrcode === 'undefined') {
      statusEl.textContent = 'Digite o código de barras manualmente abaixo.';
      return;
    }

    try {
      if (html5QrCodeScanner) {
        await stopBarcodeScanner(false);
      }
      html5QrCodeScanner = new Html5Qrcode('qrReaderBox');
      await html5QrCodeScanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 120 } },
        async (decodedText) => {
          statusEl.textContent = `Código lido: ${decodedText}! Buscando produto...`;
          document.getElementById('manualBarcodeInput').value = decodedText;
          await stopBarcodeScanner(false);
          lookupBarcodeEAN(decodedText);
        },
        () => {}
      );
      statusEl.textContent = 'Aponte a câmera para o código de barras.';
    } catch (err) {
      console.warn('Acesso à câmera indisponível ou negado:', err);
      statusEl.textContent = 'Câmera não iniciada (requer HTTPS ou permissão no iOS). Você pode digitar o código EAN abaixo:';
    }
  }

  async function stopBarcodeScanner(hideCard = true) {
    if (html5QrCodeScanner) {
      try {
        await html5QrCodeScanner.stop();
        await html5QrCodeScanner.clear();
      } catch (e) {}
      html5QrCodeScanner = null;
    }
    if (hideCard) {
      document.getElementById('barcodeScannerCard').classList.add('hidden');
    }
  }

  async function lookupBarcodeEAN(eanCode) {
    const code = (eanCode || '').trim();
    const statusEl = document.getElementById('scannerStatusMsg');
    if (!code) {
      statusEl.textContent = 'Digite um código de barras válido.';
      return;
    }

    statusEl.textContent = `Consultando código ${code} no Open Food Facts...`;
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
      const data = await res.json();

      if (data.status !== 1 || !data.product) {
        statusEl.textContent = `Produto (${code}) não encontrado na base global. Cadastre em "Criar Alimento"!`;
        return;
      }

      const p = data.product;
      const n = p.nutriments || {};
      const kcal100 =
        Number(n['energy-kcal_100g']) ||
        (Number(n['energy_100g']) ? Math.round(Number(n['energy_100g']) / 4.184) : 0);

      const scannedFood = {
        id: `ean_${code}`,
        name: p.brands ? `${p.product_name || 'Produto'} (${p.brands.split(',')[0]})` : p.product_name || `Produto ${code}`,
        category: 'Código de Barras',
        kcal: Math.round(kcal100),
        carbs: Number(n.carbohydrates_100g) || 0,
        protein: Number(n.proteins_100g) || 0,
        fat: Number(n.fat_100g) || 0,
        portionName: p.serving_size || '1 porção',
        portionGrams: parseInt(p.serving_quantity, 10) || 100
      };

      // Salvar também nos personalizados para ficar disponível offline depois
      if (!state.customFoods.some((cf) => cf.id === scannedFood.id)) {
        state.customFoods.unshift(scannedFood);
        saveState();
      }

      document.getElementById('barcodeScannerCard').classList.add('hidden');
      openFoodDetailModal(scannedFood);
    } catch (err) {
      statusEl.textContent = 'Erro ao consultar código de barras. Verifique a conexão.';
    }
  }

  // ==================== MODAL DE PORÇÃO E ADIÇÃO AO DIÁRIO ====================
  function openFoodDetailModal(food) {
    selectedFoodForModal = food;
    document.getElementById('modalFoodCategory').textContent = food.category || 'Tabela TACO';
    document.getElementById('modalFoodTitle').textContent = food.name;
    document.getElementById('modalMealSelect').value = document.getElementById('searchTargetMeal').value;

    const ingBox = document.getElementById('modalRecipeIngredientsBox');
    const ingText = document.getElementById('modalRecipeIngredientsText');
    if (food.ingredients) {
      ingText.textContent = food.ingredients;
      ingBox.classList.remove('hidden');
    } else {
      ingBox.classList.add('hidden');
    }

    const favBtn = document.getElementById('btnFavToggleModal');
    const isFav = state.favorites.includes(food.id);
    favBtn.textContent = isFav ? '★' : '☆';

    const defaultGrams = food.portionGrams || 100;
    const gramsInput = document.getElementById('modalGramsInput');
    gramsInput.value = defaultGrams;

    // Gerar chips de atalhos de porção
    const chipsContainer = document.getElementById('portionShortcuts');
    const presets = [
      { label: `${food.portionName || '1 porção'} (${defaultGrams}g)`, grams: defaultGrams },
      { label: `Meia porção (${Math.round(defaultGrams / 2)}g)`, grams: Math.round(defaultGrams / 2) },
      { label: `2 porções (${defaultGrams * 2}g)`, grams: defaultGrams * 2 },
      { label: '100g', grams: 100 }
    ];

    chipsContainer.innerHTML = presets
      .map(
        (p, idx) =>
          `<button type="button" class="portion-chip ${idx === 0 ? 'active' : ''}" data-grams="${p.grams}">${p.label}</button>`
      )
      .join('');

    chipsContainer.querySelectorAll('.portion-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chipsContainer.querySelectorAll('.portion-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        gramsInput.value = chip.getAttribute('data-grams');
        updateModalNutritionPreview();
      });
    });

    updateModalNutritionPreview();
    document.getElementById('foodDetailModal').classList.remove('hidden');
  }

  function updateModalNutritionPreview() {
    if (!selectedFoodForModal) return;
    const grams = Math.max(0, Number(document.getElementById('modalGramsInput').value) || 0);
    const factor = grams / 100;

    document.getElementById('previewKcal').textContent = Math.round(selectedFoodForModal.kcal * factor);
    document.getElementById('previewCarb').textContent = `${(selectedFoodForModal.carbs * factor).toFixed(1)}g`;
    document.getElementById('previewProt').textContent = `${(selectedFoodForModal.protein * factor).toFixed(1)}g`;
    document.getElementById('previewFat').textContent = `${(selectedFoodForModal.fat * factor).toFixed(1)}g`;
  }

  function addFoodEntryToDiary(food, grams, mealKey) {
    const g = Math.max(1, Number(grams) || 100);
    const factor = g / 100;
    const day = getDayRecord(selectedDateKey);

    day.meals[mealKey].push({
      foodId: food.id,
      name: food.name,
      grams: g,
      kcal: food.kcal * factor,
      carbs: food.carbs * factor,
      protein: food.protein * factor,
      fat: food.fat * factor
    });

    saveState();
    renderAll();
    const mealName = MEAL_CONFIG.find((m) => m.key === mealKey)?.title || 'Diário';
    showToast(`Adicionado em ${mealName}!`);
  }

  // ==================== VIEW 3: PROGRESSO, PESO & GRÁFICOS ====================
  function renderProgressView() {
    const history = (state.weightHistory || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    const currentWeight = history.length > 0 ? history[history.length - 1].weight : state.profile.weight;
    const startWeight = state.profile.startWeight || (history[0]?.weight ?? currentWeight);
    const targetWeight = state.profile.targetWeight || currentWeight;
    const diff = currentWeight - startWeight;

    document.getElementById('lblCurrentWeight').textContent = currentWeight.toFixed(1);
    document.getElementById('lblStartWeight').textContent = `${startWeight.toFixed(1)} kg`;
    document.getElementById('lblTargetWeight').textContent = `${targetWeight.toFixed(1)} kg`;
    document.getElementById('lblWeightDiff').textContent = `${diff > 0 ? '+' : ''}${diff.toFixed(1)} kg`;

    // Cálculo de IMC
    const heightM = (state.profile.height || 175) / 100;
    const bmi = currentWeight / (heightM * heightM);
    document.getElementById('lblBmiValue').textContent = bmi.toFixed(1);

    const bmiBadge = document.getElementById('bmiStatusBadge');
    if (bmi < 18.5) bmiBadge.textContent = 'Abaixo do peso';
    else if (bmi < 25) bmiBadge.textContent = 'Peso Normal';
    else if (bmi < 30) bmiBadge.textContent = 'Sobrepeso';
    else bmiBadge.textContent = 'Obesidade';

    // Lista de histórico de pesagens
    const histListEl = document.getElementById('weightHistoryList');
    histListEl.innerHTML = history
      .slice()
      .reverse()
      .slice(0, 10)
      .map(
        (entry) => `
      <div class="weight-history-item">
        <span>${parseDateKey(entry.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        <strong>${Number(entry.weight).toFixed(1)} kg</strong>
      </div>
    `
      )
      .join('');

    drawWeightChart(history, targetWeight);
    drawWeeklyCaloriesChart();
  }

  function drawWeightChart(history, targetWeight) {
    const canvas = document.getElementById('weightChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const points = history.slice(-7);
    if (points.length === 0) return;

    const weights = points.map((p) => p.weight).concat([targetWeight]);
    const minW = Math.floor(Math.min(...weights) - 1.5);
    const maxW = Math.ceil(Math.max(...weights) + 1.5);
    const padX = 44;
    const padY = 28;
    const plotW = w - padX * 2;
    const plotH = h - padY * 2;

    const toY = (val) => padY + plotH - ((val - minW) / Math.max(1, maxW - minW)) * plotH;
    const toX = (i) =>
      points.length === 1 ? w / 2 : padX + (i / (points.length - 1)) * plotW;

    // Linha tracejada da Meta de Peso
    const targetY = toY(targetWeight);
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#A3B1C2';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(padX, targetY);
    ctx.lineTo(w - padX, targetY);
    ctx.stroke();
    ctx.fillStyle = '#8395A7';
    ctx.font = '600 18px Inter, sans-serif';
    ctx.fillText(`Meta ${targetWeight}kg`, w - padX - 105, targetY - 6);
    ctx.restore();

    // Linha principal do peso
    ctx.beginPath();
    points.forEach((p, idx) => {
      const x = toX(idx);
      const y = toY(p.weight);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#20BF6B';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Pontos e rótulos
    points.forEach((p, idx) => {
      const x = toX(idx);
      const y = toY(p.weight);

      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#20BF6B';
      ctx.stroke();

      ctx.fillStyle = '#1E272E';
      ctx.font = '700 18px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.weight.toFixed(1)}`, x, y - 14);

      const dLabel = parseDateKey(p.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      ctx.fillStyle = '#8395A7';
      ctx.font = '600 16px Inter, sans-serif';
      ctx.fillText(dLabel, x, h - 5);
    });
  }

  function drawWeeklyCaloriesChart() {
    const canvas = document.getElementById('caloriesChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const daysData = [];
    let sumKcal = 0;
    let sumProt = 0;
    let sumWater = 0;
    let activeDaysCount = 0;

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const k = toDateKey(d);
      const totals = getDayTotals(k);
      daysData.push({
        label: d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''),
        consumed: totals.consumed
      });
      if (totals.consumed > 0 || totals.waterMl > 0) {
        activeDaysCount++;
        sumKcal += totals.consumed;
        sumProt += totals.prot;
        sumWater += totals.waterMl;
      }
    }

    const denom = Math.max(1, activeDaysCount);
    document.getElementById('avgWeeklyKcal').textContent = `${Math.round(sumKcal / denom)} kcal`;
    document.getElementById('avgWeeklyProt').textContent = `${Math.round(sumProt / denom)} g`;
    document.getElementById('avgWeeklyWater').textContent = `${Math.round(sumWater / denom)} ml`;

    const maxVal = Math.max(state.goals.kcal * 1.25, ...daysData.map((d) => d.consumed), 1000);
    const padX = 36;
    const padBottom = 32;
    const padTop = 24;
    const plotW = w - padX * 2;
    const plotH = h - padTop - padBottom;

    // Linha da meta diária
    const goalY = padTop + plotH - (state.goals.kcal / maxVal) * plotH;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#20BF6B';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padX, goalY);
    ctx.lineTo(w - padX, goalY);
    ctx.stroke();
    ctx.restore();

    const barWidth = 36;
    const step = plotW / daysData.length;

    daysData.forEach((d, idx) => {
      const centerX = padX + step * idx + step / 2;
      const barH = Math.max(6, (d.consumed / maxVal) * plotH);
      const y = padTop + plotH - barH;

      ctx.fillStyle = d.consumed > state.goals.kcal * 1.05 ? '#FF6B6B' : '#20BF6B';
      ctx.beginPath();
      ctx.roundRect(centerX - barWidth / 2, y, barWidth, barH, 8);
      ctx.fill();

      if (d.consumed > 0) {
        ctx.fillStyle = '#1E272E';
        ctx.font = '700 16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(d.consumed), centerX, y - 6);
      }

      ctx.fillStyle = '#8395A7';
      ctx.font = '600 16px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, centerX, h - 8);
    });
  }

  // ==================== VIEW 4: PERFIL, CALCULADORA YAZIO & BACKUP ====================
  function populateProfileForms() {
    const p = state.profile;
    document.getElementById('profGender').value = p.gender || 'male';
    document.getElementById('profAge').value = p.age || 28;
    document.getElementById('profHeight').value = p.height || 175;
    document.getElementById('profWeight').value = p.weight || 75;
    document.getElementById('profTargetWeight').value = p.targetWeight || 70;
    document.getElementById('profActivity').value = String(p.activity || 1.375);
    document.getElementById('profGoalType').value = p.goalType || 'lose';

    const g = state.goals;
    document.getElementById('goalInputKcal').value = g.kcal;
    document.getElementById('goalInputWater').value = g.water;
    document.getElementById('goalInputCarb').value = g.carb;
    document.getElementById('goalInputProt').value = g.prot;
    document.getElementById('goalInputFat').value = g.fat;

    const keyInput = document.getElementById('geminiApiKeyInput');
    if (keyInput) {
      keyInput.value = getGeminiApiKey();
    }
  }

  // ==================== AGENTE NUTRICIONISTA IA (GEMINI VISION) ====================
  const GEMINI_KEY_STORAGE = 'nutriflow_gemini_api_key';
  let lastAiAnalysisResult = null;

  function getGeminiApiKey() {
    return (localStorage.getItem(GEMINI_KEY_STORAGE) || state.geminiApiKey || '').trim();
  }

  function setGeminiApiKey(key) {
    const clean = (key || '').trim();
    localStorage.setItem(GEMINI_KEY_STORAGE, clean);
    state.geminiApiKey = clean;
    saveState();
  }

  function openAiPhotoModal() {
    const hasKey = Boolean(getGeminiApiKey());
    document.getElementById('aiInlineKeyBox').classList.toggle('hidden', hasKey);
    document.getElementById('aiTargetMealSelect').value =
      document.getElementById('searchTargetMeal')?.value || 'lunch';
    document.getElementById('aiPhotoModal').classList.remove('hidden');
  }

  function compressImageFileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1024;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
          const base64Data = dataUrl.split(',')[1];
          resolve({ dataUrl, base64Data, mimeType: 'image/jpeg' });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function callGeminiVisionAPI(apiKey, base64Data, mimeType, userHint) {
    const prompt = `Você é um nutricionista brasileiro especialista na Tabela TACO (UNICAMP) e em pratos prontos no Brasil (como feijoada, pizza, prato feito, churrasco, salgados, doces, lanches e marmitas).
Analise a imagem deste alimento/prato e estime o peso em gramas, calorias (kcal) e macronutrientes (carboidratos, proteínas e gorduras em gramas) de toda a porção visível.
${userHint ? `Observação adicional informada pelo usuário: "${userHint}".` : ''}

Retorne APENAS um objeto JSON válido (sem markdown) no seguinte formato exato:
{
  "dishName": "Nome claro do prato ou alimento em português (ex: Pizza de Calabresa (2 fatias) ou Feijoada com Arroz e Couve)",
  "totalGrams": 350,
  "totalKcal": 640,
  "totalCarbs": 62.5,
  "totalProtein": 34.0,
  "totalFat": 26.5,
  "notes": "Resumo curto de 1 frase explicando a estimativa visual da porção.",
  "items": [
    {
      "name": "Nome do ingrediente/item 1",
      "grams": 150,
      "kcal": 240,
      "carbs": 20.0,
      "protein": 18.0,
      "fat": 9.5
    }
  ]
}`;

    const models = ['gemini-2.5-flash', 'gemini-2.0-flash'];
    let lastError = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
          apiKey
        )}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeType, data: base64Data } }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          })
        });

        const data = await response.json();
        if (!response.ok) {
          lastError = new Error(data?.error?.message || `Erro HTTP ${response.status}`);
          continue;
        }

        const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = rawText.replace(/```json|```/g, '').trim();
        return JSON.parse(cleaned);
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('Não foi possível analisar a imagem no Gemini.');
  }

  async function handleAiPhotoFileSelected(file) {
    if (!file) return;
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      document.getElementById('aiInlineKeyBox').classList.remove('hidden');
      document.getElementById('aiInlineKeyInput').focus();
      showToast('Cole sua chave gratuita do Gemini primeiro!');
      return;
    }

    const previewContainer = document.getElementById('aiPreviewContainer');
    const previewImg = document.getElementById('aiPreviewImage');
    const loadingOverlay = document.getElementById('aiLoadingOverlay');
    const statusText = document.getElementById('aiStatusText');
    const resultCard = document.getElementById('aiResultCard');

    resultCard.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    loadingOverlay.classList.remove('hidden');
    statusText.textContent = 'Processando foto e consultando o Agente Gemini...';

    try {
      const { dataUrl, base64Data, mimeType } = await compressImageFileToBase64(file);
      previewImg.src = dataUrl;

      const userHint = document.getElementById('aiUserHintInput').value.trim();
      const result = await callGeminiVisionAPI(apiKey, base64Data, mimeType, userHint);
      lastAiAnalysisResult = result;

      // Preencher card de resultado
      document.getElementById('aiDishTitle').textContent = result.dishName || 'Prato Identificado';
      document.getElementById('aiDishWeightBadge').textContent = `~${Math.round(result.totalGrams || 100)}g`;
      document.getElementById('aiDishNotes').textContent = result.notes || '';
      document.getElementById('aiTotalKcal').textContent = Math.round(result.totalKcal || 0);
      document.getElementById('aiTotalCarb').textContent = `${Number(result.totalCarbs || 0).toFixed(1)}g`;
      document.getElementById('aiTotalProt').textContent = `${Number(result.totalProtein || 0).toFixed(1)}g`;
      document.getElementById('aiTotalFat').textContent = `${Number(result.totalFat || 0).toFixed(1)}g`;

      const itemsListEl = document.getElementById('aiDetectedItemsList');
      const items = Array.isArray(result.items) ? result.items : [];
      itemsListEl.innerHTML = items
        .map(
          (it) => `
          <div class="recipe-ing-item">
            <span><strong>${Math.round(it.grams || 100)}g</strong> ${it.name}</span>
            <strong>${Math.round(it.kcal || 0)} kcal</strong>
          </div>
        `
        )
        .join('');

      loadingOverlay.classList.add('hidden');
      resultCard.classList.remove('hidden');
    } catch (err) {
      console.error('Erro na análise por IA:', err);
      statusText.textContent = `Erro: ${err.message || 'Verifique sua chave de API do Gemini ou sua conexão.'}`;
    }
  }

  function calculateMifflinStJeor(e) {
    e.preventDefault();
    const gender = document.getElementById('profGender').value;
    const age = Number(document.getElementById('profAge').value) || 28;
    const height = Number(document.getElementById('profHeight').value) || 175;
    const weight = Number(document.getElementById('profWeight').value) || 75;
    const targetWeight = Number(document.getElementById('profTargetWeight').value) || 70;
    const activity = Number(document.getElementById('profActivity').value) || 1.375;
    const goalType = document.getElementById('profGoalType').value;

    // Fórmula de Mifflin-St Jeor
    const bmr =
      gender === 'male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;

    let targetKcal = Math.round(bmr * activity);
    if (goalType === 'lose') targetKcal = Math.max(1200, targetKcal - 450);
    if (goalType === 'gain') targetKcal += 300;

    // Distribuição inteligente de macros (alta proteína para preservar massa magra)
    const protGrams = Math.round(weight * 2.0);
    const fatGrams = Math.round((targetKcal * 0.27) / 9);
    const remainingKcal = Math.max(200, targetKcal - protGrams * 4 - fatGrams * 9);
    const carbGrams = Math.round(remainingKcal / 4);
    const waterMl = Math.round((weight * 35) / 250) * 250;

    state.profile = {
      ...state.profile,
      gender,
      age,
      height,
      weight,
      targetWeight,
      activity,
      goalType
    };

    state.goals = {
      kcal: targetKcal,
      carb: carbGrams,
      prot: protGrams,
      fat: fatGrams,
      water: waterMl
    };

    saveState();
    populateProfileForms();
    renderAll();
    showToast(`Novas metas calculadas: ${targetKcal} kcal/dia!`);
  }

  // ==================== NAVEGAÇÃO ENTRE ABAS (VIEWS) ====================
  function switchView(targetViewId) {
    if (targetViewId !== 'view-search') {
      stopBarcodeScanner(true);
    }

    document.querySelectorAll('.view-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === targetViewId);
    });

    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.classList.toggle('active', tab.getAttribute('data-target') === targetViewId);
    });

    if (targetViewId === 'view-search') {
      renderFoodSearchResults();
    } else if (targetViewId === 'view-progress') {
      renderProgressView();
    } else if (targetViewId === 'view-profile') {
      populateProfileForms();
    }
  }

  function renderAll() {
    renderHeaderAndWeek();
    renderDiaryView();
    if (document.getElementById('view-search').classList.contains('active')) {
      renderFoodSearchResults();
    }
    if (document.getElementById('view-progress').classList.contains('active')) {
      renderProgressView();
    }
  }

  // ==================== INICIALIZAÇÃO E EVENT LISTENERS ====================
  function initEvents() {
    // Navegação de dias
    document.getElementById('btnPrevDay').addEventListener('click', () => changeSelectedDate(-1));
    document.getElementById('btnNextDay').addEventListener('click', () => changeSelectedDate(1));
    document.getElementById('btnJumpToday').addEventListener('click', () => {
      selectedDateKey = todayKey;
      renderAll();
    });

    // Atalho editar metas
    document.getElementById('btnQuickGoals').addEventListener('click', () => switchView('view-profile'));

    // Botões rápidos de água (+250ml / -250ml)
    document.getElementById('btnWaterPlus').addEventListener('click', () => {
      const day = getDayRecord(selectedDateKey);
      day.waterMl = (day.waterMl || 0) + 250;
      saveState();
      renderAll();
      showToast('💧 +250ml de água!');
    });

    document.getElementById('btnWaterMinus').addEventListener('click', () => {
      const day = getDayRecord(selectedDateKey);
      day.waterMl = Math.max(0, (day.waterMl || 0) - 250);
      saveState();
      renderAll();
    });

    // Barra de navegação inferior
    document.querySelectorAll('.nav-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        switchView(tab.getAttribute('data-target'));
      });
    });

    // Botão central flutuante (+)
    document.getElementById('btnFabAdd').addEventListener('click', () => {
      switchView('view-search');
      document.getElementById('foodSearchInput').focus();
    });

    // Atalho para ler código de barras direto da tela inicial
    document.getElementById('btnOpenBarcodeShortcut').addEventListener('click', () => {
      switchView('view-search');
      startBarcodeScanner();
    });

    // Busca de alimentos (Híbrida: Tabela TACO + Receitas + Open Food Facts Brasil)
    const searchInput = document.getElementById('foodSearchInput');
    searchInput.addEventListener('input', () => {
      renderFoodSearchResults();
      clearTimeout(autoOnlineDebounce);
      const q = searchInput.value.trim();
      if (q.length >= 3) {
        autoOnlineDebounce = setTimeout(() => {
          searchOpenFoodFacts(true);
        }, 550);
      } else {
        onlineSearchResults = [];
        renderFoodSearchResults();
      }
    });

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(autoOnlineDebounce);
        searchOpenFoodFacts(false);
      }
    });

    document.getElementById('btnClearSearch').addEventListener('click', () => {
      searchInput.value = '';
      onlineSearchResults = [];
      renderFoodSearchResults();
      searchInput.focus();
    });

    // Abas de filtro na busca
    document.querySelectorAll('.search-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        activeSearchTab = tab.getAttribute('data-tab');
        document.querySelectorAll('.search-tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        if (activeSearchTab === 'online' && onlineSearchResults.length === 0 && searchInput.value.trim()) {
          searchOpenFoodFacts(false);
        } else {
          renderFoodSearchResults();
        }
      });
    });

    // Botões de ação na busca
    document.getElementById('btnStartScanner').addEventListener('click', startBarcodeScanner);
    document.getElementById('btnCloseScanner').addEventListener('click', () => stopBarcodeScanner(true));
    document.getElementById('btnLookupBarcode').addEventListener('click', () => {
      lookupBarcodeEAN(document.getElementById('manualBarcodeInput').value);
    });

    // Construtor de Receitas com Múltiplos Ingredientes
    const recFoodSelect = document.getElementById('recBuilderFoodSelect');
    const renderRecipeBuilderIngredients = () => {
      const listEl = document.getElementById('recBuilderIngredientsList');
      let totalG = 0;
      let totalKcal = 0;
      let totalC = 0;
      let totalP = 0;
      let totalF = 0;

      listEl.innerHTML = recipeBuilderIngredients
        .map((ing, idx) => {
          totalG += ing.grams;
          totalKcal += ing.kcal;
          totalC += ing.carbs;
          totalP += ing.protein;
          totalF += ing.fat;
          return `
            <div class="recipe-ing-item">
              <span><strong>${ing.grams}g</strong> ${ing.name} (${Math.round(ing.kcal)} kcal)</span>
              <button type="button" class="btn-delete-item" data-del-rec-ing="${idx}">✕</button>
            </div>
          `;
        })
        .join('');

      document.getElementById('recBuilderTotalGrams').textContent = `${totalG}g`;
      document.getElementById('recBuilderTotalKcal').textContent = `${Math.round(totalKcal)} kcal`;
      document.getElementById('recBuilderTotalMacros').textContent = `C: ${totalC.toFixed(1)}g · P: ${totalP.toFixed(1)}g · G: ${totalF.toFixed(1)}g`;

      listEl.querySelectorAll('[data-del-rec-ing]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.getAttribute('data-del-rec-ing'), 10);
          recipeBuilderIngredients.splice(i, 1);
          renderRecipeBuilderIngredients();
        });
      });
    };

    document.getElementById('btnOpenRecipeBuilderModal').addEventListener('click', () => {
      const tacoOnly = window.TACO_FOODS || [];
      recFoodSelect.innerHTML = tacoOnly
        .map((f) => `<option value="${f.id}">${f.name} (${f.kcal} kcal/100g)</option>`)
        .join('');
      recipeBuilderIngredients = [];
      renderRecipeBuilderIngredients();
      document.getElementById('recipeBuilderModal').classList.remove('hidden');
    });

    document.getElementById('btnCloseRecipeBuilderModal').addEventListener('click', () => {
      document.getElementById('recipeBuilderModal').classList.add('hidden');
    });

    document.getElementById('btnAddIngredientToRecipe').addEventListener('click', () => {
      const foodId = recFoodSelect.value;
      const grams = Math.max(1, Number(document.getElementById('recBuilderFoodGrams').value) || 100);
      const foodObj = getAllLocalFoods().find((f) => f.id === foodId);
      if (!foodObj) return;
      const factor = grams / 100;
      recipeBuilderIngredients.push({
        name: foodObj.name,
        grams,
        kcal: foodObj.kcal * factor,
        carbs: foodObj.carbs * factor,
        protein: foodObj.protein * factor,
        fat: foodObj.fat * factor
      });
      renderRecipeBuilderIngredients();
    });

    document.getElementById('recipeBuilderForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (recipeBuilderIngredients.length === 0) {
        showToast('Adicione pelo menos 1 ingrediente na receita!');
        return;
      }
      const name = document.getElementById('recBuilderName').value.trim();
      const servings = Math.max(1, Number(document.getElementById('recBuilderServings').value) || 1);
      const portionLabel = document.getElementById('recBuilderPortionLabel').value.trim() || '1 porção';

      const totalG = recipeBuilderIngredients.reduce((a, b) => a + b.grams, 0);
      const totalKcal = recipeBuilderIngredients.reduce((a, b) => a + b.kcal, 0);
      const totalC = recipeBuilderIngredients.reduce((a, b) => a + b.carbs, 0);
      const totalP = recipeBuilderIngredients.reduce((a, b) => a + b.protein, 0);
      const totalF = recipeBuilderIngredients.reduce((a, b) => a + b.fat, 0);

      const factor100 = 100 / Math.max(1, totalG);
      const portionGrams = Math.round(totalG / servings);
      const ingSummary = recipeBuilderIngredients.map((i) => `${i.grams}g ${i.name}`).join(' + ');

      const newRecipe = {
        id: `rec_user_${Date.now()}`,
        name,
        category: 'Minhas Receitas',
        isRecipe: true,
        portionName: portionLabel,
        portionGrams,
        kcal: Math.round(totalKcal * factor100),
        carbs: Number((totalC * factor100).toFixed(1)),
        protein: Number((totalP * factor100).toFixed(1)),
        fat: Number((totalF * factor100).toFixed(1)),
        ingredients: ingSummary
      };

      state.customFoods.unshift(newRecipe);
      state.favorites.push(newRecipe.id);
      saveState();
      document.getElementById('recipeBuilderForm').reset();
      document.getElementById('recipeBuilderModal').classList.add('hidden');
      openFoodDetailModal(newRecipe);
    });

    // Modal de detalhes de porção do alimento
    document.getElementById('modalGramsInput').addEventListener('input', () => {
      document.querySelectorAll('.portion-chip').forEach((c) => c.classList.remove('active'));
      updateModalNutritionPreview();
    });

    document.getElementById('btnFavToggleModal').addEventListener('click', () => {
      if (!selectedFoodForModal) return;
      const id = selectedFoodForModal.id;
      const idx = state.favorites.indexOf(id);
      if (idx >= 0) {
        state.favorites.splice(idx, 1);
        document.getElementById('btnFavToggleModal').textContent = '☆';
      } else {
        state.favorites.push(id);
        document.getElementById('btnFavToggleModal').textContent = '★';
      }
      saveState();
      renderFoodSearchResults();
    });

    document.getElementById('btnCancelFoodModal').addEventListener('click', () => {
      document.getElementById('foodDetailModal').classList.add('hidden');
    });

    document.getElementById('btnConfirmAddFood').addEventListener('click', () => {
      if (!selectedFoodForModal) return;
      const grams = Number(document.getElementById('modalGramsInput').value) || 100;
      const mealKey = document.getElementById('modalMealSelect').value;
      addFoodEntryToDiary(selectedFoodForModal, grams, mealKey);
      document.getElementById('foodDetailModal').classList.add('hidden');
      switchView('view-diary');
    });

    // Modal de Alimento Personalizado
    document.getElementById('btnOpenCustomFoodModal').addEventListener('click', () => {
      document.getElementById('customFoodModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseCustomModal').addEventListener('click', () => {
      document.getElementById('customFoodModal').classList.add('hidden');
    });
    document.getElementById('customFoodForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('custName').value.trim();
      const portionName = document.getElementById('custPortionName').value.trim() || '1 porção';
      const portionGrams = Math.max(1, Number(document.getElementById('custPortionGrams').value) || 100);
      const factor100 = 100 / portionGrams;

      const newFood = {
        id: `cust_${Date.now()}`,
        name,
        category: 'Meus Alimentos',
        portionName,
        portionGrams,
        kcal: Math.round((Number(document.getElementById('custKcal').value) || 0) * factor100),
        carbs: Number(((Number(document.getElementById('custCarb').value) || 0) * factor100).toFixed(1)),
        protein: Number(((Number(document.getElementById('custProt').value) || 0) * factor100).toFixed(1)),
        fat: Number(((Number(document.getElementById('custFat').value) || 0) * factor100).toFixed(1))
      };

      state.customFoods.unshift(newFood);
      state.favorites.push(newFood.id);
      saveState();
      document.getElementById('customFoodForm').reset();
      document.getElementById('customFoodModal').classList.add('hidden');
      openFoodDetailModal(newFood);
    });

    // Modal de Exercícios
    const exSelect = document.getElementById('exerciseSelect');
    const exMinInput = document.getElementById('exerciseMinutes');
    const exKcalInput = document.getElementById('exerciseKcalInput');

    if (window.EXERCISES_LIST) {
      exSelect.innerHTML = window.EXERCISES_LIST.map(
        (ex) => `<option value="${ex.id}">${ex.icon} ${ex.name}</option>`
      ).join('');
    }

    const updateExKcalCalc = () => {
      const exObj = (window.EXERCISES_LIST || []).find((x) => x.id === exSelect.value);
      const mins = Number(exMinInput.value) || 30;
      if (exObj) {
        exKcalInput.value = Math.round(exObj.kcalPerMin * mins);
      }
    };

    exSelect.addEventListener('change', updateExKcalCalc);
    exMinInput.addEventListener('input', updateExKcalCalc);

    document.getElementById('btnOpenExerciseModal').addEventListener('click', () => {
      updateExKcalCalc();
      document.getElementById('exerciseModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseExerciseModal').addEventListener('click', () => {
      document.getElementById('exerciseModal').classList.add('hidden');
    });
    document.getElementById('exerciseForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const exObj = (window.EXERCISES_LIST || []).find((x) => x.id === exSelect.value);
      const day = getDayRecord(selectedDateKey);
      day.exercises.push({
        name: exObj ? exObj.name : 'Exercício',
        icon: exObj ? exObj.icon : '🏃',
        minutes: Number(exMinInput.value) || 30,
        kcal: Number(exKcalInput.value) || 150
      });
      saveState();
      document.getElementById('exerciseModal').classList.add('hidden');
      renderAll();
      showToast('Treino registrado!');
    });

    // Modal de Peso
    document.getElementById('btnOpenWeightModal').addEventListener('click', () => {
      const lastW =
        state.weightHistory.length > 0
          ? state.weightHistory[state.weightHistory.length - 1].weight
          : state.profile.weight;
      document.getElementById('weightModalInput').value = lastW;
      document.getElementById('weightDateInput').value = selectedDateKey;
      document.getElementById('weightModal').classList.remove('hidden');
    });

    document.getElementById('btnCloseWeightModal').addEventListener('click', () => {
      document.getElementById('weightModal').classList.add('hidden');
    });

    document.getElementById('weightForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const wVal = Number(document.getElementById('weightModalInput').value);
      const wDate = document.getElementById('weightDateInput').value || todayKey;
      if (!wVal) return;

      const existingIdx = state.weightHistory.findIndex((item) => item.date === wDate);
      if (existingIdx >= 0) {
        state.weightHistory[existingIdx].weight = wVal;
      } else {
        state.weightHistory.push({ date: wDate, weight: wVal });
      }
      state.profile.weight = wVal;
      saveState();
      document.getElementById('weightModal').classList.add('hidden');
      renderAll();
      showToast('Peso registrado com sucesso!');
    });

    // Formulários de Perfil e Metas
    document.getElementById('calcProfileForm').addEventListener('submit', calculateMifflinStJeor);
    document.getElementById('manualGoalsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      state.goals = {
        kcal: Number(document.getElementById('goalInputKcal').value) || 2000,
        water: Number(document.getElementById('goalInputWater').value) || 2500,
        carb: Number(document.getElementById('goalInputCarb').value) || 200,
        prot: Number(document.getElementById('goalInputProt').value) || 140,
        fat: Number(document.getElementById('goalInputFat').value) || 60
      };
      saveState();
      renderAll();
      showToast('Metas diárias atualizadas!');
    });

    // Configuração da Chave do Gemini e Modal de Foto com IA
    const geminiConfigForm = document.getElementById('geminiConfigForm');
    if (geminiConfigForm) {
      geminiConfigForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const key = document.getElementById('geminiApiKeyInput').value.trim();
        setGeminiApiKey(key);
        showToast('Chave do Gemini salva no seu iPhone!');
      });
    }

    document.getElementById('btnOpenAiPhotoShortcut')?.addEventListener('click', openAiPhotoModal);
    document.getElementById('btnOpenAiScannerSearch')?.addEventListener('click', openAiPhotoModal);
    document.getElementById('btnCloseAiPhotoModal')?.addEventListener('click', () => {
      document.getElementById('aiPhotoModal').classList.add('hidden');
    });

    document.getElementById('btnSaveInlineKey')?.addEventListener('click', () => {
      const k = document.getElementById('aiInlineKeyInput').value.trim();
      if (!k) {
        showToast('Cole uma chave válida (AIzaSy...)');
        return;
      }
      setGeminiApiKey(k);
      document.getElementById('aiInlineKeyBox').classList.add('hidden');
      showToast('Chave salva! Agora tire ou escolha a foto do prato.');
    });

    document.getElementById('aiCameraInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAiPhotoFileSelected(e.target.files[0]);
      }
    });

    document.getElementById('aiGalleryInput')?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAiPhotoFileSelected(e.target.files[0]);
      }
    });

    document.getElementById('btnAddAiDishWhole')?.addEventListener('click', () => {
      if (!lastAiAnalysisResult) return;
      const r = lastAiAnalysisResult;
      const mealKey = document.getElementById('aiTargetMealSelect').value;
      const grams = Math.max(1, Math.round(r.totalGrams || 250));
      const factor100 = 100 / grams;

      const aiFoodObj = {
        id: `ai_${Date.now()}`,
        name: `✨ ${r.dishName || 'Prato Analisado por IA'}`,
        category: 'Foto IA (Gemini)',
        portionName: '1 prato/porção analisada',
        portionGrams: grams,
        kcal: Math.round((r.totalKcal || 0) * factor100),
        carbs: Number(((r.totalCarbs || 0) * factor100).toFixed(1)),
        protein: Number(((r.totalProtein || 0) * factor100).toFixed(1)),
        fat: Number(((r.totalFat || 0) * factor100).toFixed(1)),
        ingredients: Array.isArray(r.items)
          ? r.items.map((i) => `${Math.round(i.grams || 0)}g ${i.name}`).join(' + ')
          : r.notes || ''
      };

      state.customFoods.unshift(aiFoodObj);
      addFoodEntryToDiary(aiFoodObj, grams, mealKey);
      document.getElementById('aiPhotoModal').classList.add('hidden');
      switchView('view-diary');
    });

    document.getElementById('btnAddAiDishSeparate')?.addEventListener('click', () => {
      if (!lastAiAnalysisResult || !Array.isArray(lastAiAnalysisResult.items)) return;
      const mealKey = document.getElementById('aiTargetMealSelect').value;
      const day = getDayRecord(selectedDateKey);

      lastAiAnalysisResult.items.forEach((it) => {
        day.meals[mealKey].push({
          foodId: `ai_item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `✨ ${it.name}`,
          grams: Math.max(1, Math.round(it.grams || 100)),
          kcal: Number(it.kcal || 0),
          carbs: Number(it.carbs || 0),
          protein: Number(it.protein || 0),
          fat: Number(it.fat || 0)
        });
      });

      saveState();
      renderAll();
      document.getElementById('aiPhotoModal').classList.add('hidden');
      switchView('view-diary');
      showToast('Itens do prato adicionados ao diário!');
    });

    // Exportar / Importar / Resetar Dados
    document.getElementById('btnExportData').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nutriflow-backup-${todayKey}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('fileImportInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const imported = JSON.parse(ev.target.result);
          if (imported && imported.goals && imported.days) {
            state = imported;
            saveState();
            renderAll();
            showToast('Backup importado com sucesso!');
          } else {
            alert('Arquivo de backup inválido.');
          }
        } catch (err) {
          alert('Erro ao ler o arquivo JSON.');
        }
      };
      reader.readAsText(file);
    });

    document.getElementById('btnResetAllData').addEventListener('click', () => {
      if (confirm('Tem certeza que deseja apagar todos os registros locais?')) {
        localStorage.removeItem(STORAGE_KEY);
        state = getDefaultState();
        saveState();
        renderAll();
        showToast('Dados reiniciados');
      }
    });

    // Registrar Service Worker para funcionar Offline no iPhone
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      });
    }
  }

  // Inicializar Aplicação
  initEvents();
  renderAll();
})();

