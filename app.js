/* app.js — Firestore(공개 읽기) + Firebase Auth(로그인 쓰기) 버전 */

const COLLECTION = "recipes";

// ---------- utils ----------
function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
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
    return String(iso);
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

// ---------- Firebase getters ----------
function getFS() {
  const db = window.__db;
  const fs = window.__fs;
  if (!db || !fs) {
    throw new Error("Firebase Firestore가 초기화되지 않았습니다. index.html의 모듈 스크립트를 확인하세요.");
  }
  return { db, ...fs };
}

function getAuthStuff() {
  const auth = window.__auth;
  const fns = window.__authFns;
  if (!auth || !fns) {
    throw new Error("Firebase Auth가 초기화되지 않았습니다. index.html의 모듈 스크립트를 확인하세요.");
  }
  return { auth, ...fns };
}

// ---------- Firestore helpers ----------
async function loadRecipesFromCloud() {
  const { db, collection, getDocs, query, orderBy } = getFS();
  const q = query(collection(db, COLLECTION), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function addRecipeToCloud(recipe) {
  const { db, collection, addDoc } = getFS();
  const docRef = await addDoc(collection(db, COLLECTION), recipe);
  return docRef.id;
}

async function deleteRecipeFromCloud(id) {
  const { db, doc, deleteDoc } = getFS();
  await deleteDoc(doc(db, COLLECTION, id));
}

// ---------- state ----------
let recipes = [];
let queryText = "";
let currentUser = null; // Firebase user

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
const $imageFile = document.getElementById("imageFileInput"); // 파일 업로드 input
const $ingredients = document.getElementById("ingredientsInput");
const $steps = document.getElementById("stepsInput");

// ---------- Auth UI (JS가 자동 생성) ----------
let $authWrap = null;
let $loginBtn = null;
let $logoutBtn = null;
let $userLabel = null;

function ensureAuthUI() {
  const host = document.querySelector(".list-header");
  if (!host) return;

  $authWrap = document.createElement("div");
  $authWrap.style.display = "flex";
  $authWrap.style.alignItems = "center";
  $authWrap.style.gap = "8px";

  $userLabel = document.createElement("div");
  $userLabel.style.fontSize = "12px";
  $userLabel.style.color = "rgba(255,255,255,0.75)";
  $userLabel.textContent = "로그인 필요(쓰기 기능)";

  $loginBtn = document.createElement("button");
  $loginBtn.className = "btn btn--primary";
  $loginBtn.textContent = "Google 로그인";

  $logoutBtn = document.createElement("button");
  $logoutBtn.className = "btn btn--ghost";
  $logoutBtn.textContent = "로그아웃";

  $authWrap.appendChild($userLabel);
  $authWrap.appendChild($loginBtn);
  $authWrap.appendChild($logoutBtn);

  // 기존 맨위로 버튼 옆에 배치
  const rightSide = host.lastElementChild?.parentElement === host ? host : host;
  // list-header는 flex로 justify-between이라 보통 마지막이 버튼 영역
  // 안전하게 host에 그냥 append
  host.appendChild($authWrap);

  // 이벤트 바인딩
  $loginBtn.addEventListener("click", async () => {
    try {
      const { auth, GoogleAuthProvider, signInWithPopup } = getAuthStuff();
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      alert("로그인에 실패했어요. 팝업 차단을 해제했는지 확인해줘!");
    }
  });

  $logoutBtn.addEventListener("click", async () => {
    try {
      const { auth, signOut } = getAuthStuff();
      await signOut(auth);
    } catch (err) {
      console.error(err);
      alert("로그아웃에 실패했어요.");
    }
  });

  syncAuthUI();
}

function syncAuthUI() {
  const isLoggedIn = !!currentUser;
  if ($userLabel) {
    $userLabel.textContent = isLoggedIn
      ? `로그인됨: ${currentUser.displayName || currentUser.email || currentUser.uid}`
      : "로그인 필요(쓰기 기능)";
  }
  if ($loginBtn) $loginBtn.style.display = isLoggedIn ? "none" : "inline-flex";
  if ($logoutBtn) $logoutBtn.style.display = isLoggedIn ? "inline-flex" : "none";
}

// ---------- modal ----------
function openModal() {
  if (!currentUser) {
    alert("레시피 등록은 로그인 후에 가능해요!");
    return;
  }
  $modal.classList.remove("hidden");
  $modal.setAttribute("aria-hidden", "false");
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
  if ($imageFile) $imageFile.value = "";
}

// ESC 닫기
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$modal.classList.contains("hidden")) closeModal();
});

// buttons
$addBtn?.addEventListener("click", openModal);
$emptyAddBtn?.addEventListener("click", openModal);
$backdrop?.addEventListener("click", closeModal);
$closeBtn?.addEventListener("click", closeModal);
$cancelBtn?.addEventListener("click", closeModal);
$resetBtn?.addEventListener("click", resetForm);

$toTopBtn?.addEventListener("click", () => {
  $search.value = "";
  queryText = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
});

// ---------- search ----------
$search?.addEventListener("input", (e) => {
  queryText = e.target.value || "";
  render();
});

// ---------- submit (쓰기: 로그인 필요 + ownerUid 저장) ----------
$form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  if (!currentUser) {
    alert("레시피 저장은 로그인 후에 가능해요!");
    return;
  }

  const name = $name.value.trim();
  if (!name) {
    $name.focus();
    return;
  }

  const file = $imageFile?.files?.[0] || null;

  // base64 저장이라 용량 제한 권장(700KB)
  if (file && file.size > 700 * 1024) {
    alert("이미지 파일이 너무 커요. 700KB 이하로 줄여서 다시 선택해줘!");
    return;
  }

  let imageData = "";
  if (file) {
    try {
      imageData = await fileToDataUrl(file);
    } catch (err) {
      console.error(err);
      alert("이미지를 읽는 데 실패했어요.");
      return;
    }
  }

  const recipe = {
    localId: uid(), // 선택(디버깅용)
    ownerUid: currentUser.uid, // ✅ 중요: 규칙에서 검사함
    ownerName: currentUser.displayName || currentUser.email || "", // 선택
    name,
    base: $base.value.trim(),
    ingredients: $ingredients.value.trim(),
    steps: $steps.value.trim(),
    imageData,
    createdAt: new Date().toISOString(),
  };

  let id = "";
  try {
    id = await addRecipeToCloud(recipe);
  } catch (err) {
    console.error(err);
    alert("저장에 실패했어요. Firestore 규칙/권한을 확인해줘!");
    return;
  }

  // 즉시 반영
  recipes = [{ id, ...recipe }, ...recipes];

  resetForm();
  closeModal();
  render();
});

// ---------- render ----------
function getFiltered() {
  const q = queryText.trim().toLowerCase();
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

  // 삭제 이벤트: 내 레시피(ownerUid==내 uid)만 버튼이 생성되므로 여기서는 실행만
  $recipes.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!currentUser) {
        alert("삭제는 로그인 후에 가능해요!");
        return;
      }

      const id = btn.getAttribute("data-del");
      if (!id) return;

      const ok = confirm("이 레시피를 삭제할까요?");
      if (!ok) return;

      try {
        await deleteRecipeFromCloud(id);
      } catch (err) {
        console.error(err);
        alert("삭제에 실패했어요. (권한/규칙/네트워크 확인)");
        return;
      }

      recipes = recipes.filter((r) => r.id !== id);
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

  const canDelete =
    currentUser && r.ownerUid && currentUser.uid === r.ownerUid;

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
        <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
          <div style="min-width:0;">
            <h2 class="name" title="${name}">${name}</h2>
            <div class="base" title="${base}">
              ${base ? `베이스 주종: ${base}` : `베이스 주종: (미입력)`}
            </div>
          </div>

          ${
            canDelete
              ? `<button class="del-btn" data-del="${r.id}" title="삭제">삭제</button>`
              : ``
          }
        </div>
      </div>
    </div>

    <details class="details">
      <summary>제조법 보기</summary>
      <div class="details__content">
        <div class="block-title">재료</div>
        <pre class="pre">${ing || "(없음)"}</pre>

        <div class="block-title">제조법</div>
        <pre class="pre">${steps || "(없음)"}</pre>

        <div class="time">저장 시간: ${time}</div>
      </div>
    </details>
  </article>
  `;
}

// ---------- init ----------
async function init() {
  // 1) Auth 상태 구독
  try {
    const { auth, onAuthStateChanged } = getAuthStuff();
    onAuthStateChanged(auth, (user) => {
      currentUser = user || null;
      syncAuthUI();
      render(); // 삭제 버튼 표시 갱신
    });
  } catch (err) {
    console.error(err);
  }

  // 2) Auth UI 생성
  ensureAuthUI();

  // 3) 공개 읽기: 레시피 로드
  try {
    recipes = await loadRecipesFromCloud();
  } catch (err) {
    console.error(err);
    alert("레시피를 불러오지 못했어요. Firestore 규칙(read)과 네트워크를 확인해줘!");
    recipes = [];
  }

  render();
}

init();

