// Функция для копирования списка запланированных фильмов в буфер обмена
function copyScheduledMoviesToClipboard() {
  // Получаем только запланированные фильмы
  const scheduledMovies = getSortedWatchlist().filter(item => item.planDate);
  
  if (scheduledMovies.length === 0) {
    alert("Нет запланированных фильмов для копирования");
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
      alert(`Список из ${scheduledMovies.length} запланированных фильмов скопирован в буфер обмена`);
    })
    .catch(err => {
      console.error("Ошибка при копировании в буфер обмена:", err);
      alert("Не удалось скопировать список в буфер обмена");
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
