const USER_LIST_LIMIT = 30;
const USERS_API_URL = window.Pupsik.apiUrl("/api/admin?action=users");
let usersList = [];
let usersLoaded = false;
let usersLoadingPromise = null;

const USER_PICKER_INPUTS = [
  { id: "watchOrderBy", type: "movies" },
  { id: "rouletteOrderBy", type: "movies" },
  { id: "fortuneWinnerOrderBy", type: "movies" },
  { id: "gameOrderBy", type: "games" },
  { id: "playedGameOrderBy", type: "games" },
  { id: "editPlayedGameOrderBy", type: "games" },
];

function normalizeUserName(name) {
  return (name || "").trim();
}

async function waitForSupabaseClientForUsers(timeoutMs = 10000) {
  if (supabaseClient && typeof supabaseClient.from === "function") {
    return supabaseClient;
  }
  if (usersLoadingPromise) return usersLoadingPromise;
  const start = Date.now();
  usersLoadingPromise = new Promise((resolve, reject) => {
    const interval = setInterval(() => {
      if (supabaseClient && typeof supabaseClient.from === "function") {
        clearInterval(interval);
        usersLoadingPromise = null;
        resolve(supabaseClient);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        usersLoadingPromise = null;
        reject(new Error("Supabase client is not ready"));
      }
    }, 200);
  });
  return usersLoadingPromise;
}

async function loadUsersFromSupabase({ force = false } = {}) {
  if (usersLoaded && !force) return usersList;
  try {
    const client = await waitForSupabaseClientForUsers();
    const { data, error } = await client
      .from("users")
      .select("user, movies, games");
    if (error) throw error;
    usersList = Array.isArray(data)
      ? data.map((row) => ({
          user: row.user,
          movies: Number(row.movies ?? 0) || 0,
          games: Number(row.games ?? 0) || 0,
        }))
      : [];
    usersLoaded = true;
    return usersList;
  } catch (err) {
    console.error("Failed to load users list", err);
    return [];
  }
}

function sortUsersForType(type) {
  const key = type === "games" ? "games" : "movies";
  return [...usersList]
    .sort((a, b) => {
      const countDiff = (b[key] || 0) - (a[key] || 0);
      if (countDiff !== 0) return countDiff;
      return (a.user || "")
        .localeCompare(b.user || "", "ru", { sensitivity: "base" });
    })
    .slice(0, USER_LIST_LIMIT);
}

function getPickerDropdown(input) {
  if (!input) return null;
  const container = input.closest(".user-picker-input");
  if (!container) return null;
  return container.querySelector(".user-picker-dropdown");
}

function renderUserSuggestions(input, type) {
  const dropdown = getPickerDropdown(input);
  if (!dropdown) return;
  const searchValue = normalizeUserName(input.value).toLowerCase();
  loadUsersFromSupabase().then(() => {
    const sorted = sortUsersForType(type);
    const filtered = sorted.filter((item) =>
      item.user.toLowerCase().includes(searchValue)
    );
    dropdown.innerHTML = "";
    if (!filtered.length) {
      dropdown.classList.remove("is-visible");
      return;
    }
    filtered.forEach((item) => {
      const row = document.createElement("div");
      row.className = "user-picker-item";
      row.dataset.userName = item.user;

      const nameWrap = document.createElement("div");
      nameWrap.className = "user-picker-name";
      nameWrap.textContent = item.user;

      const count = document.createElement("span");
      count.className = "user-picker-count";
      count.textContent = String(type === "games" ? item.games : item.movies);
      nameWrap.appendChild(count);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "user-picker-delete";
      deleteBtn.textContent = "×";
      deleteBtn.title = "Удалить пользователя";
      deleteBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        await deleteUserFromSupabase(item.user);
        renderUserSuggestions(input, type);
      });

      row.appendChild(nameWrap);
      row.appendChild(deleteBtn);

      row.addEventListener("click", () => {
        input.value = item.user;
        dropdown.classList.remove("is-visible");
        input.focus();
      });

      dropdown.appendChild(row);
    });
    dropdown.classList.add("is-visible");
  });
}

function setupUserPickerField(inputId, type) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const dropdown = getPickerDropdown(input);
  const showSuggestions = () => renderUserSuggestions(input, type);
  input.addEventListener("input", showSuggestions);
  input.addEventListener("focus", showSuggestions);
  input.addEventListener("blur", () => {
    const dropdownElem = getPickerDropdown(input);
    if (!dropdownElem) return;
    setTimeout(() => dropdownElem.classList.remove("is-visible"), 200);
  });
  if (dropdown) {
    dropdown.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
  }
}

async function deleteUserFromSupabase(name) {
  const normalized = normalizeUserName(name);
  if (!normalized) return;
  try {
    const token = localStorage.getItem("adminToken") || "";
    if (!token) {
      throw new Error("Admin token is missing");
    }

    const response = await fetch(USERS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "delete",
        userName: normalized,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Failed to delete user: ${response.status}`
      );
    }

    const deletedUserName = payload?.item?.user || normalized;
    usersList = usersList.filter((item) => item.user !== deletedUserName);
    usersLoaded = true;
  } catch (err) {
    console.error("Failed to delete user", err);
  }
}

async function recordUserOrder({ userName, type }) {
  const normalized = normalizeUserName(userName);
  if (!normalized) return;
  try {
    const token = localStorage.getItem("adminToken") || "";
    if (!token) {
      throw new Error("Admin token is missing");
    }

    const response = await fetch(USERS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "increment",
        userName: normalized,
        type,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Failed to update user stats: ${response.status}`
      );
    }

    const item = payload?.item;
    if (item?.user) {
      usersList = usersList.filter((entry) => entry.user !== item.user);
      usersList.push({
        user: item.user,
        movies: Number(item.movies ?? 0) || 0,
        games: Number(item.games ?? 0) || 0,
      });
    }
    usersLoaded = true;
  } catch (err) {
    console.error("Failed to update user stats", err);
  }
}

async function removeUserOrder({ userName, type }) {
  const normalized = normalizeUserName(userName);
  if (!normalized) return;

  try {
    const token = localStorage.getItem("adminToken") || "";
    if (!token) {
      throw new Error("Admin token is missing");
    }

    const response = await fetch(USERS_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: "decrement",
        userName: normalized,
        type,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload?.error || `Failed to decrement user stats: ${response.status}`
      );
    }

    const item = payload?.item;
    if (payload?.deleted && item?.user) {
      usersList = usersList.filter((entry) => entry.user !== item.user);
    } else if (item?.user) {
      usersList = usersList.filter((entry) => entry.user !== item.user);
      usersList.push({
        user: item.user,
        movies: Number(item.movies ?? 0) || 0,
        games: Number(item.games ?? 0) || 0,
      });
    }

    usersLoaded = true;
  } catch (err) {
    console.error("Failed to decrement user stats", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  USER_PICKER_INPUTS.forEach(({ id, type }) => setupUserPickerField(id, type));
});
