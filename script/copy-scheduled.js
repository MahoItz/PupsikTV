// Функция для копирования списка запланированных фильмов в буфер обмена
function copyScheduledMoviesToClipboard() {
  // Получаем только запланированные фильмы
  const scheduledMovies = getSortedWatchlist().filter(item => item.planDate);
  
  if (scheduledMovies.length === 0) {
    showToastNotification("Нет запланированных фильмов для копирования", "warning");
    return;
  }
  
  // Форматируем список
  let formattedList = "";
  scheduledMovies.forEach((movie, index) => {
    const num = index + 1;
    const title = movie.title || "";
    const year = movie.year || "";
    const orderBy = movie.orderBy || "";
    
    // Получаем время начала и конца
    const planDate = new Date(movie.planDate);
    const startTime = formatTime(planDate);
    
    // Вычисляем время окончания (начало + длительность фильма + 10 мин перерыв)
    let endTime = "";
    if (movie.length) {
      const duration = parseDuration(movie.length);
      const endDate = new Date(planDate.getTime() + (duration + 10) * 60000);
      
      // Округляем вверх до ближайших 5 минут
      const minutes = endDate.getMinutes();
      const remainder = minutes % 5;
      if (remainder !== 0) {
        endDate.setMinutes(minutes + (5 - remainder));
        endDate.setSeconds(0);
        endDate.setMilliseconds(0);
      }
      
      endTime = formatTime(endDate);
    }
    
    // Формируем строку для каждого фильма
    formattedList += `${num}) "${title}" ${year} год, заказ ${orderBy}\n`;
    if (endTime) {
      formattedList += `С ${startTime} - ${endTime} по Мск\n`;
    } else {
      formattedList += `С ${startTime} по Мск\n`;
    }
    
    // Добавляем пустую строку между фильмами, кроме последнего
    if (index < scheduledMovies.length - 1) {
      formattedList += "\n";
    }
  });
  
  // Копируем в буфер обмена
  navigator.clipboard.writeText(formattedList)
    .then(() => {
      showToastNotification(`Список из ${scheduledMovies.length} запланированных фильмов скопирован в буфер обмена`, "success");
    })
    .catch(err => {
      console.error("Ошибка при копировании в буфер обмена:", err);
      showToastNotification("Не удалось скопировать список в буфер обмена", "error");
    });
}

// Вспомогательная функция для парсинга длительности фильма
function parseDuration(durationStr) {
  if (!durationStr) return 0;
  const str = String(durationStr).trim();
  
  // Try H:MM format
  if (str.includes(":")) {
    const parts = str.split(":");
    if (parts.length === 2) {
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      return h * 60 + m;
    }
  }
  
  // Try plain number (minutes)
  return parseInt(str, 10) || 0;
}

// Вспомогательная функция для форматирования времени
function formatTime(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function showToastNotification(message, type = "success") {
  const normalizedType = ["success", "warning", "error"].includes(type) ? type : "success";
  let container = document.getElementById("toastContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast-notification toast-${normalizedType}`;
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => {
      toast.remove();
      if (!container.hasChildNodes()) {
        container.remove();
      }
    }, 280);
  }, 2600);
}
