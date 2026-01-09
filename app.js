const STORAGE_KEY = "cocktail_recipes_v1";

// ---------- utils ----------
function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadRecipes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function saveRecipes(recipes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

// ---------- state ----------
let recipes = loadRecipes();
let query = "";

// ---------- dom ----------
const $search = document.getElementById("searchInput");
const $recipes = document.getElementById("recipes");
const $empty = document.getElementById("emptyState");
const $totalCount = document.getElementById("totalCount");
const $filteredCount = document.getElementById("filteredCount");

const $addBtn = document.getElementById("addBtn");
const $emptyAddBtn = document.getElementById("emptyAddBtn");
const $toTopBtn = document.getElementById("toTopBtn");

const $modal = document.getElementById("modalRoot");
const $backdrop = document.getElementById("modalBackdrop");
const $closeBtn = document.getElementById("closeBtn");
const $cancelBtn = document.getElementById("cancelBtn");
const $resetBtn = document.getElementById("resetBtn");
const $form = document.getElementById("recipeForm");

const $name = document.getElementById("nameInput");
const $base = document.getElementById("baseInput");
const $imageFile = document.getElementById("imageFileInput");
const $ingredients = document.getElementById("ingredientsInput");
const $steps = document.getElementById("stepsInput");

// ---------- modal ----------
function openModal() {
  $modal.classList.remove("hidden");
  $modal.setAttribute("aria-hidden", "false");
  // 포커스
  setTimeout(() => $name.focus(), 0);
}

function closeModal() {
  $modal.classList.add("hidden");
  $modal.setAttribute("aria-hidden", "true");
}

function resetForm() {
  $name.value = "";
  $base.value = "";
  $ingredients.value = "";
  $steps.value = "";
  $imageFile.value = ""; // 파일 입력 초기화
}


// ESC 닫기
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$modal.classList.contains("hidden")) closeModal();
});

$addBtn.addEventListener("click", openModal);
$emptyAddBtn.addEventListener("click", openModal);
$backdrop.addEventListener("click", closeModal);
$closeBtn.addEventListener("click", closeModal);
$cancelBtn.addEventListener("click", closeModal);
$resetBtn.addEventListener("click", resetForm);

$toTopBtn.addEventListener("click", () => {
  $search.value = "";
  query = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
});

// ---------- search ----------
$search.addEventListener("input", (e) => {
  query = e.target.value || "";
  render();
});

// ---------- submit ----------
$form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const name = $name.value.trim();
  if (!name) {
    $name.focus();
    return;
  }

  // 파일(선택)
  const file = $imageFile.files?.[0] || null;

  // 너무 큰 파일은 막기 (예: 1MB 제한)
  if (file && file.size > 1024 * 1024) {
    alert("이미지 파일이 너무 커요. 1MB 이하로 줄여서 다시 선택해줘!");
    return;
  }

  let imageData = "";
  if (file) {
    try {
      imageData = await fileToDataUrl(file);
    } catch {
      alert("이미지를 읽는 데 실패했어요. 다른 파일로 시도해줘!");
      return;
    }
  }

  const newRecipe = {
    id: uid(),
    name,
    base: $base.value.trim(),
    ingredients: $ingredients.value.trim(),
    steps: $steps.value.trim(),
    imageData,                 // ✅ 파일 기반 이미지 저장
    createdAt: new Date().toISOString(),
  };

  recipes = [newRecipe, ...recipes];

  // localStorage 용량 초과 대비(try/catch)
  try {
    saveRecipes(recipes);
  } catch {
    alert("저장 공간이 부족해서 실패했어요. 이미지 크기를 줄이거나 레시피 일부를 삭제해줘!");
    // 저장 실패 시 롤백
    recipes = recipes.slice(1);
    return;
  }

  resetForm();
  closeModal();
  render();
});

// ---------- render ----------
function getFiltered() {
  const q = query.trim().toLowerCase();
  if (!q) return recipes;
  return recipes.filter((r) => {
    const hay = `${r.name} ${r.base} ${r.ingredients} ${r.steps}`.toLowerCase();
    return hay.includes(q);
  });
}

function render() {
  const filtered = getFiltered();

  $totalCount.textContent = String(recipes.length);
  $filteredCount.textContent = String(filtered.length);

  if (filtered.length === 0) {
    $recipes.innerHTML = "";
    $empty.classList.remove("hidden");
    return;
  } else {
    $empty.classList.add("hidden");
  }

  $recipes.innerHTML = filtered.map(renderCard).join("");

  // delete 버튼 이벤트 바인딩
  $recipes.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-del");
      recipes = recipes.filter((r) => r.id !== id);
      saveRecipes(recipes);
      render();
    });
  });
}

function renderCard(r) {
  const name = escapeHtml(r.name);
  const base = escapeHtml(r.base || "");
  const ing = escapeHtml(r.ingredients || "");
  const steps = escapeHtml(r.steps || "");
  const time = escapeHtml(formatTime(r.createdAt));
  const img = escapeHtml(r.imageData || "");

  return `
  <article class="card">
    <div class="card__body">
      <div class="thumb">
        ${
          img
            ? `<img src="${img}" alt="${name}" />`
            : `<div class="thumb__placeholder">칵테일사진</div>`
        }
      </div>

      <div class="info">
        <h2 class="name">${name}</h2>
        <div class="base">${base ? `베이스 주종: ${base}` : `베이스 주종: (미입력)`}</div>
      </div>
    </div>

    <details class="details">
      <summary>제조법 보기</summary>
      <div class="details__content">
        <div class="block-title">재료</div>
        <pre class="pre">${ing || "(없음)"}</pre>

        <div class="block-title">제조법</div>
        <pre class="pre">${steps || "(없음)"}</pre>
        ${img ? `<div class="preview"><img src="${img}" alt="${name}"/></div>` : ""}

        <div class="time">저장 시간: ${time}</div>
      </div>
    </details>
  </article>
  `;
}


// ---------- init ----------
render();
