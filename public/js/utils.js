/**
 * ملف المساعدات - Share Local Network File
 * يحتوي على دوال مساعدة للتطبيق
 */

/**
 * تنسيق حجم الملف بصيغة مقروءة
 * @param {number} bytes - حجم الملف بالبايت
 * @returns {string} - حجم الملف بصيغة مقروءة
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 بايت';
  
  const sizes = ['بايت', 'كيلوبايت', 'ميجابايت', 'جيجابايت', 'تيرابايت'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * تنسيق التاريخ بصيغة مقروءة
 * @param {string} dateString - التاريخ بصيغة ISO
 * @returns {string} - التاريخ بصيغة مقروءة
 */
function formatDate(dateString) {
  // التحقق من وجود dayjs
  if (typeof dayjs !== 'undefined') {
    try {
      return dayjs(dateString).format('DD MMM YYYY, h:mm A');
    } catch (error) {
      console.warn('خطأ في dayjs، استخدام JavaScript العادي:', error);
    }
  }

  // استخدام JavaScript العادي كبديل
  const date = new Date(dateString);
  return date.toLocaleString('ar-SA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * تنسيق التاريخ النسبي (منذ كم من الوقت)
 * @param {string} dateString - التاريخ بصيغة ISO
 * @returns {string} - التاريخ النسبي (مثل: منذ دقيقتين، منذ ساعة)
 */
function formatDateRelative(dateString) {
  // التحقق من وجود dayjs
  if (typeof dayjs !== 'undefined') {
    try {
      return dayjs(dateString).fromNow();
    } catch (error) {
      console.warn('خطأ في dayjs، استخدام JavaScript العادي:', error);
    }
  }

  // استخدام JavaScript العادي كبديل
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'الآن';
  if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
  if (diffHours < 24) return `منذ ${diffHours} ساعة`;
  if (diffDays < 30) return `منذ ${diffDays} يوم`;

  return formatDate(dateString);
}

/**
 * تنسيق التاريخ بصيغة مختصرة
 * @param {string} dateString - التاريخ بصيغة ISO
 * @returns {string} - التاريخ بصيغة مختصرة
 */
function formatDateShort(dateString) {
  // التحقق من وجود dayjs
  if (typeof dayjs !== 'undefined') {
    try {
      return dayjs(dateString).format('DD/MM/YYYY');
    } catch (error) {
      console.warn('خطأ في dayjs، استخدام JavaScript العادي:', error);
    }
  }

  // استخدام JavaScript العادي كبديل
  const date = new Date(dateString);
  return date.toLocaleDateString('ar-SA');
}

/**
 * تنسيق التاريخ بصيغة كاملة
 * @param {string} dateString - التاريخ بصيغة ISO
 * @returns {string} - التاريخ بصيغة كاملة
 */
function formatDateFull(dateString) {
  // التحقق من وجود dayjs
  if (typeof dayjs !== 'undefined') {
    try {
      return dayjs(dateString).format('dddd، DD MMMM YYYY الساعة h:mm A');
    } catch (error) {
      console.warn('خطأ في dayjs، استخدام JavaScript العادي:', error);
    }
  }

  // استخدام JavaScript العادي كبديل
  const date = new Date(dateString);
  return date.toLocaleString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * الحصول على أيقونة الملف بناءً على نوعه
 * @param {string} mimeType - نوع الملف
 * @returns {string} - اسم الأيقونة
 */
function getFileIcon(mimeType) {
  if (mimeType.startsWith('image/')) {
    return 'bi-file-image';
  } else if (mimeType.startsWith('video/')) {
    return 'bi-file-play';
  } else if (mimeType.startsWith('audio/')) {
    return 'bi-file-music';
  } else if (mimeType === 'application/pdf') {
    return 'bi-file-pdf';
  } else if (mimeType.startsWith('text/')) {
    return 'bi-file-text';
  } else if (mimeType === 'application/json') {
    return 'bi-file-code';
  } else if (mimeType.includes('word') || mimeType.includes('document')) {
    return 'bi-file-word';
  } else if (mimeType.includes('excel') || mimeType.includes('sheet')) {
    return 'bi-file-excel';
  } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
    return 'bi-file-ppt';
  } else if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) {
    return 'bi-file-zip';
  } else {
    return 'bi-file-earmark';
  }
}

/**
 * الحصول على نوع الملف بصيغة مقروءة
 * @param {string} mimeType - نوع الملف
 * @returns {string} - نوع الملف بصيغة مقروءة
 */
function getFileType(mimeType) {
  if (mimeType.startsWith('image/')) {
    return 'صورة';
  } else if (mimeType.startsWith('video/')) {
    return 'فيديو';
  } else if (mimeType.startsWith('audio/')) {
    return 'ملف صوتي';
  } else if (mimeType === 'application/pdf') {
    return 'PDF';
  } else if (mimeType.startsWith('text/')) {
    return 'ملف نصي';
  } else if (mimeType === 'application/json') {
    return 'JSON';
  } else if (mimeType.includes('word') || mimeType.includes('document')) {
    return 'مستند';
  } else if (mimeType.includes('excel') || mimeType.includes('sheet')) {
    return 'جدول بيانات';
  } else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) {
    return 'عرض تقديمي';
  } else if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) {
    return 'ملف مضغوط';
  } else {
    return 'ملف';
  }
}

/**
 * تهرب الأحرف الخاصة في النص
 * @param {string} text - النص المراد تهريب أحرفه الخاصة
 * @returns {string} - النص بعد تهريب الأحرف الخاصة
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * عرض إشعار للمستخدم
 * @param {string} message - نص الإشعار
 * @param {string} type - نوع الإشعار (success, danger, warning, info)
 * @param {object} toastElement - عنصر الإشعار (اختياري)
 */
function showNotification(message, type = 'success', toastElement = null) {
  const toast = toastElement || document.getElementById('notification-toast');
  const toastIcon = document.getElementById('toast-icon');
  const toastTitle = document.getElementById('toast-title');
  const messageElement = document.getElementById('notification-message');

  // إزالة الفئات السابقة
  toast.classList.remove('text-bg-success', 'text-bg-danger', 'text-bg-warning', 'text-bg-info');

  // تحديد الأيقونة والعنوان حسب النوع
  let icon, title, bgClass;
  switch (type) {
    case 'success':
      icon = 'bi-check-circle-fill text-success';
      title = 'نجح';
      bgClass = 'text-bg-success';
      break;
    case 'danger':
      icon = 'bi-x-circle-fill text-danger';
      title = 'خطأ';
      bgClass = 'text-bg-danger';
      break;
    case 'warning':
      icon = 'bi-exclamation-triangle-fill text-warning';
      title = 'تحذير';
      bgClass = 'text-bg-warning';
      break;
    case 'info':
      icon = 'bi-info-circle-fill text-info';
      title = 'معلومات';
      bgClass = 'text-bg-info';
      break;
    default:
      icon = 'bi-check-circle-fill text-success';
      title = 'إشعار';
      bgClass = 'text-bg-success';
  }

  // تحديث العناصر
  if (toastIcon) {
    toastIcon.className = `bi ${icon} me-2`;
  }
  if (toastTitle) {
    toastTitle.textContent = title;
  }
  if (messageElement) {
    messageElement.textContent = message;
  }

  // إظهار الإشعار
  const bsToast = new bootstrap.Toast(toast);
  bsToast.show();
}

// تصدير الدوال للاستخدام في ملفات أخرى
export {
  formatFileSize,
  formatDate,
  formatDateRelative,
  formatDateShort,
  formatDateFull,
  getFileIcon,
  getFileType,
  escapeHtml,
  showNotification
};