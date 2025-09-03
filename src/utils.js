function debounce(func, delay) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function showSearchLoading(containerId, listId) {
  const container = document.getElementById(containerId);
  const list = document.getElementById(listId);
  if (!container || !list) return;
  container.style.display = "block";
  list.innerHTML =
    '<div class="autocomplete-loading"><span class="loading-spinner"></span></div>';
}
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderEmptyState(container, message) {
  const wrapper = document.createElement("div");
  wrapper.className = "empty-state";

  const img = document.createElement("img");
  img.src = "images/Sad_Winston.webp";
  img.alt = message;
  wrapper.appendChild(img);

  const text = document.createElement("p");
  text.textContent = message;
  wrapper.appendChild(text);

  container.appendChild(wrapper);
}
