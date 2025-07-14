/**
 * Share Local Network File - التطبيق الرئيسي
 * تطبيق مشاركة ملفات عبر الشبكة المحلية
 */

// استيراد الدوال المساعدة
import { 
  formatFileSize, 
  formatDate, 
  formatDateRelative, 
  formatDateShort, 
  formatDateFull, 
  getFileIcon, 
  getFileType, 
  escapeHtml, 
  showNotification 
} from './utils.js';

// إعداد اتصال Socket.IO
const socket = io();

// عناصر DOM
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const uploadBtn = document.getElementById('upload-btn');
const uploadProgress = document.getElementById('upload-progress');
const progressBar = uploadProgress.querySelector('.progress-bar');
const progressText = uploadProgress.querySelector('.progress-text');
const filesList = document.getElementById('files-list');
const refreshBtn = document.getElementById('refresh-btn');
const noFilesMessage = document.getElementById('no-files-message');
const networkInfo = document.getElementById('network-info');
const previewModal = new bootstrap.Modal(document.getElementById('preview-modal'));
const previewContent = document.getElementById('preview-content');
const previewFilename = document.getElementById('preview-filename');
const downloadBtn = document.getElementById('download-btn');
// تم حذف qrcodeContainer القديم
const dropArea = document.getElementById('drop-area');
const connectionStatus = document.getElementById('connection-status');
const connectedUsersCount = document.getElementById('connected-users-count');
const connectedUsersTooltip = document.getElementById('connected-users-tooltip');
// تم حذف العناصر القديمة
const browseBtn = document.getElementById('browse-btn');

// عناصر قسم المستخدمين المتصلين
const connectedUsersList = document.getElementById('connected-users-list');
const connectedUsersBadge = document.getElementById('connected-users-badge');
const noUsersMessage = document.getElementById('no-users-message');

// عناصر نموذج إرسال الملف
const sendFileModal = new bootstrap.Modal(document.getElementById('send-file-modal'));
const sendFileForm = document.getElementById('send-file-form');
const fileToSend = document.getElementById('file-to-send');
const sendToUserName = document.getElementById('send-to-user-name');
const selectedFilePreview = document.getElementById('selected-file-preview');
const selectedFileName = document.getElementById('selected-file-name');
const selectedFileSize = document.getElementById('selected-file-size');
const selectedFileIcon = document.getElementById('selected-file-icon');
const sendProgress = document.getElementById('send-progress');
const confirmSendBtn = document.getElementById('confirm-send-btn');

// متغيرات لتتبع معلومات المستخدمين
let currentUserInfo = null;
let connectedUserNames = [];
let connectedUsersDetails = [];
let selectedTargetUser = null;

// دالة لتنسيق مدة الاتصال
function formatConnectionDuration(seconds) {
  if (seconds < 60) {
    return `${seconds} ثانية`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} دقيقة`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours} ساعة${minutes > 0 ? ` و ${minutes} دقيقة` : ''}` : `${minutes} دقيقة`;
  }
}

// دالة لتحديث قائمة المستخدمين المتصلين
function updateConnectedUsersList(usersDetails = []) {
  if (!connectedUsersList) return;

  // تحديث عدد المستخدمين في البطاقة
  if (connectedUsersBadge) {
    connectedUsersBadge.textContent = usersDetails.length;
  }

  // إذا لم يكن هناك مستخدمون متصلون
  if (usersDetails.length === 0) {
    connectedUsersList.innerHTML = '';
    if (noUsersMessage) {
      noUsersMessage.classList.remove('d-none');
    }
    return;
  }

  // إخفاء رسالة عدم وجود مستخدمين
  if (noUsersMessage) {
    noUsersMessage.classList.add('d-none');
  }

  // إنشاء قائمة المستخدمين
  let html = '';
  usersDetails.forEach((user, index) => {
    const duration = formatConnectionDuration(user.duration);
    const isCurrentUser = currentUserInfo && user.name === currentUserInfo.name;
    const userIcon = isCurrentUser ? 'bi-person-fill-check text-warning' : 'bi-person-circle text-primary';
    const userClass = isCurrentUser ? 'user-item current-user' : 'user-item';
    const userBadge = isCurrentUser ? '<span class="badge bg-warning text-dark ms-2">أنت</span>' : '';

    // تحديد أيقونة نوع الجهاز
    let deviceIcon = 'bi-laptop';
    if (user.deviceType === 'هاتف ذكي') {
      deviceIcon = 'bi-phone';
    } else if (user.deviceType === 'تابلت') {
      deviceIcon = 'bi-tablet';
    }

    // إخفاء زر الإرسال للمستخدم الحالي
    const sendButton = isCurrentUser ? '' : `
      <button class="btn btn-outline-primary btn-sm send-file-btn"
              onclick="openSendFileModal('${user.name}')"
              title="إرسال ملف">
        <i class="bi bi-send"></i>
      </button>
    `;

    html += `
      <div class="list-group-item ${userClass} d-flex align-items-center justify-content-between p-3">
        <div class="d-flex align-items-center flex-grow-1">
          <i class="bi ${userIcon} me-3 fs-5"></i>
          <div class="flex-grow-1">
            <div class="d-flex align-items-center">
              <span class="fw-semibold">${escapeHtml(user.name)}</span>
              ${userBadge}
              <span class="user-status-indicator ms-2"></span>
            </div>
            <div class="user-duration">متصل منذ ${duration}</div>
            <div class="user-device-info d-flex align-items-center gap-2 mt-1">
              <div class="d-flex align-items-center text-muted small">
                <i class="bi ${deviceIcon} me-1"></i>
                <span>${escapeHtml(user.deviceName || 'جهاز غير معروف')}</span>
              </div>
              <div class="d-flex align-items-center text-muted small">
                <i class="bi bi-globe me-1"></i>
                <span>${escapeHtml(user.browser || 'متصفح غير معروف')}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="d-flex align-items-center gap-2">
          ${sendButton}
        </div>
      </div>
    `;
  });

  connectedUsersList.innerHTML = html;
}

// دالة لفتح نموذج إرسال الملف
function openSendFileModal(targetUserName) {
  selectedTargetUser = targetUserName;
  if (sendToUserName) {
    sendToUserName.textContent = targetUserName;
  }

  // إعادة تعيين النموذج
  if (sendFileForm) {
    sendFileForm.reset();
  }
  if (selectedFilePreview) {
    selectedFilePreview.classList.add('d-none');
  }
  if (sendProgress) {
    sendProgress.classList.add('d-none');
  }
  if (confirmSendBtn) {
    confirmSendBtn.disabled = false;
    confirmSendBtn.innerHTML = '<i class="bi bi-send me-1"></i>إرسال الملف';
  }

  sendFileModal.show();
}

// جعل دالة openSendFileModal متاحة عالمياً
window.openSendFileModal = openSendFileModal;

// دالة لتحديث tooltip عدد المتصلين
function updateConnectedUsersTooltip(count, usersDetails = []) {
  if (!connectedUsersTooltip) return;

  let tooltipContent = '';

  if (count === 0) {
    tooltipContent = `
      <div class="text-center p-2">
        <i class="bi bi-person-x text-muted fs-4"></i>
        <div class="mt-2 fw-bold text-muted">لا يوجد مستخدمون متصلون</div>
      </div>
    `;
  } else if (count === 1) {
    tooltipContent = `
      <div class="text-center p-2">
        <i class="bi bi-person-check text-success fs-4"></i>
        <div class="mt-2 fw-bold text-success">مستخدم واحد متصل</div>
      </div>
    `;
    if (usersDetails.length > 0) {
      const user = usersDetails[0];
      const duration = formatConnectionDuration(user.duration);
      const isCurrentUser = currentUserInfo && user.name === currentUserInfo.name;
      const userIcon = isCurrentUser ? 'bi-person-fill-check text-warning' : 'bi-person-circle text-primary';
      const userLabel = isCurrentUser ? ' (أنت)' : '';
      const userBadge = isCurrentUser ? '<span class="badge bg-warning text-dark ms-1">أنت</span>' : '';

      // تحديد أيقونة نوع الجهاز
      let deviceIcon = 'bi-laptop';
      if (user.deviceType === 'هاتف ذكي') {
        deviceIcon = 'bi-phone';
      } else if (user.deviceType === 'تابلت') {
        deviceIcon = 'bi-tablet';
      }

      tooltipContent += `
        <hr class="my-2">
        <div class="p-2 bg-light rounded">
          <div class="d-flex align-items-center mb-1">
            <i class="bi ${userIcon} me-2"></i>
            <span class="fw-semibold">${user.name}</span>
            ${userBadge}
          </div>
          <div class="text-muted small mb-1">
            <i class="bi bi-clock me-1"></i>متصل منذ ${duration}
          </div>
          <div class="text-muted small">
            <i class="bi ${deviceIcon} me-1"></i>${user.deviceName || 'جهاز غير معروف'}
            <span class="mx-1">•</span>
            <i class="bi bi-globe me-1"></i>${user.browser || 'متصفح غير معروف'}
          </div>
        </div>
      `;
    }
  } else {
    tooltipContent = `
      <div class="text-center p-2">
        <i class="bi bi-people-fill text-success fs-4"></i>
        <div class="mt-2 fw-bold text-success">${count} مستخدم متصل</div>
      </div>
    `;
    if (usersDetails.length > 0) {
      tooltipContent += '<hr class="my-2"><div class="px-2">';
      usersDetails.forEach((user, index) => {
        const duration = formatConnectionDuration(user.duration);
        const isCurrentUser = currentUserInfo && user.name === currentUserInfo.name;
        const userIcon = isCurrentUser ? 'bi-person-fill-check text-warning' : 'bi-person-circle text-primary';
        const userBadge = isCurrentUser ? '<span class="badge bg-warning text-dark ms-1">أنت</span>' : '';
        const bgClass = isCurrentUser ? 'bg-warning bg-opacity-10' : 'bg-light';

        // تحديد أيقونة نوع الجهاز
        let deviceIcon = 'bi-laptop';
        if (user.deviceType === 'هاتف ذكي') {
          deviceIcon = 'bi-phone';
        } else if (user.deviceType === 'تابلت') {
          deviceIcon = 'bi-tablet';
        }

        tooltipContent += `
          <div class="p-2 mb-2 ${bgClass} rounded border">
            <div class="d-flex align-items-center justify-content-between mb-1">
              <div class="d-flex align-items-center">
                <i class="bi ${userIcon} me-2"></i>
                <span class="fw-semibold small">${user.name}</span>
                ${userBadge}
              </div>
            </div>
            <div class="text-muted small mb-1">
              <i class="bi bi-clock me-1"></i>متصل منذ ${duration}
            </div>
            <div class="text-muted small">
              <i class="bi ${deviceIcon} me-1"></i>${user.deviceName || 'جهاز غير معروف'}
              <span class="mx-1">•</span>
              <i class="bi bi-globe me-1"></i>${user.browser || 'متصفح غير معروف'}
            </div>
          </div>
        `;
      });
      tooltipContent += '</div>';
    }
  }

  // تحديث tooltip
  const tooltip = bootstrap.Tooltip.getInstance(connectedUsersTooltip);
  if (tooltip) {
    tooltip.dispose();
  }

  connectedUsersTooltip.setAttribute('title', tooltipContent);
  new bootstrap.Tooltip(connectedUsersTooltip, {
    html: true,
    placement: 'bottom',
    trigger: 'hover focus',
    customClass: 'users-tooltip'
  });
}

// عناصر الإحصائيات في header قسم الملفات المشتركة
const headerTotalFiles = document.getElementById('header-total-files');
const headerTotalSize = document.getElementById('header-total-size');
const headerTotalDownloads = document.getElementById('header-total-downloads');

// تخزين الملفات الحالية
let currentFiles = [];

// دالة لتنظيف اسم الملف وضمان الترميز الصحيح
function sanitizeFileName(fileName) {
  try {
    // إذا كان الاسم يحتوي على ترميز خاطئ، حاول إصلاحه
    if (fileName.includes('Ù') || fileName.includes('Ø')) {
      // محاولة فك الترميز الخاطئ
      try {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8');
        const bytes = encoder.encode(fileName);
        fileName = decoder.decode(bytes);
      } catch (e) {
        console.log('خطأ في إصلاح ترميز اسم الملف:', e.message);
      }
    }
    return fileName;
  } catch (error) {
    console.error('خطأ في تنظيف اسم الملف:', error);
    return fileName;
  }
}

// الحصول على عنوان الخادم
const serverUrl = window.location.href;

// إنشاء رمز QR مصغر للزاوية
const miniQrcodeContainer = document.getElementById('mini-qrcode');
if (miniQrcodeContainer) {
  new QRCode(miniQrcodeContainer, {
    text: serverUrl,
    width: 120,
    height: 120,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H
  });
}

// دالة لإظهار/إخفاء رمز QR المصغر
function toggleMiniQR() {
  const miniQrPopup = document.getElementById('mini-qr-popup');
  if (miniQrPopup) {
    miniQrPopup.classList.toggle('d-none');
  }
}

// إخفاء رمز QR المصغر عند النقر خارجه
document.addEventListener('click', function(event) {
  const miniQrPopup = document.getElementById('mini-qr-popup');
  const qrButton = event.target.closest('[onclick="toggleMiniQR()"]');

  if (miniQrPopup && !miniQrPopup.contains(event.target) && !qrButton) {
    miniQrPopup.classList.add('d-none');
  }
});

// جعل دالة toggleMiniQR متاحة عالمياً
window.toggleMiniQR = toggleMiniQR;

// معالجة تغيير الملف المختار للإرسال
if (fileToSend) {
  fileToSend.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file && selectedFilePreview) {
      // عرض معاينة الملف
      selectedFileName.textContent = file.name;
      selectedFileSize.textContent = formatFileSize(file.size);
      selectedFileIcon.className = `bi ${getFileIcon(file.type)} me-2 fs-4`;
      selectedFilePreview.classList.remove('d-none');
    } else if (selectedFilePreview) {
      selectedFilePreview.classList.add('d-none');
    }
  });
}

// معالجة زر تأكيد الإرسال
if (confirmSendBtn) {
  confirmSendBtn.addEventListener('click', async function() {
    const file = fileToSend.files[0];
    if (!file) {
      showNotification('يرجى اختيار ملف للإرسال', 'warning');
      return;
    }

    if (!selectedTargetUser) {
      showNotification('خطأ في تحديد المستخدم المستهدف', 'danger');
      return;
    }

    await sendFileToUser(file, selectedTargetUser);
  });
}

// دالة إرسال ملف لمستخدم محدد
async function sendFileToUser(file, targetUserName) {
  if (!file || !targetUserName) {
    showNotification('معلومات الإرسال غير مكتملة', 'danger');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('targetUser', targetUserName);
  formData.append('senderName', currentUserInfo?.name || 'مستخدم مجهول');

  // تعطيل زر الإرسال وإظهار شريط التقدم
  confirmSendBtn.disabled = true;
  confirmSendBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>جاري الإرسال...';
  sendProgress.classList.remove('d-none');
  const progressBar = sendProgress.querySelector('.progress-bar');
  const progressText = sendProgress.querySelector('.progress-text');
  progressBar.style.width = '0%';
  progressBar.setAttribute('aria-valuenow', 0);
  if (progressText) {
    progressText.textContent = '0%';
  }

  try {
    const xhr = new XMLHttpRequest();

    // تتبع تقدم الإرسال
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        progressBar.style.width = percentComplete + '%';
        progressBar.setAttribute('aria-valuenow', percentComplete);
        if (progressText) {
          progressText.textContent = Math.round(percentComplete) + '%';
        }
      }
    });

    await new Promise((resolve, reject) => {
      xhr.addEventListener('load', function() {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          showNotification(`تم إرسال الملف "${file.name}" إلى ${targetUserName} بنجاح`, 'success');
          sendFileModal.hide();
          resolve();
        } else {
          let errorMessage = `فشل في إرسال الملف "${file.name}"`;
          try {
            const response = JSON.parse(xhr.responseText);
            errorMessage = response.message || errorMessage;
          } catch (e) {}
          showNotification(errorMessage, 'danger');
          reject(new Error(errorMessage));
        }
      });

      xhr.addEventListener('error', function() {
        showNotification(`حدث خطأ في الاتصال أثناء إرسال "${file.name}"`, 'danger');
        reject(new Error('خطأ في الاتصال'));
      });

      xhr.open('POST', '/send-file', true);
      xhr.send(formData);
    });
  } catch (error) {
    console.error('خطأ في إرسال الملف:', error);
  } finally {
    // إعادة تفعيل زر الإرسال وإخفاء شريط التقدم
    confirmSendBtn.disabled = false;
    confirmSendBtn.innerHTML = '<i class="bi bi-send me-1"></i>إرسال الملف';
    sendProgress.classList.add('d-none');
  }
}

// عرض معلومات الشبكة
if (networkInfo) {
  networkInfo.innerHTML = `
    <div class="d-flex align-items-center justify-content-center">
      <i class="bi bi-wifi me-2"></i>
      <span>عنوان الخادم: <strong>${serverUrl}</strong></span>
    </div>
  `;
}

// وظيفة رفع الملفات
async function uploadFile(file) {
  if (!file) {
    showNotification('يرجى اختيار ملف أولاً', 'danger');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  // تعطيل زر الرفع وإظهار شريط التقدم
  uploadBtn.disabled = true;
  uploadBtn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>جاري الرفع...';
  uploadProgress.classList.remove('d-none');
  progressBar.style.width = '0%';
  progressBar.setAttribute('aria-valuenow', 0);
  if (progressText) {
    progressText.textContent = '0%';
  }

  try {
    const xhr = new XMLHttpRequest();

    // تتبع تقدم الرفع
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        progressBar.style.width = percentComplete + '%';
        progressBar.setAttribute('aria-valuenow', percentComplete);
        if (progressText) {
          progressText.textContent = Math.round(percentComplete) + '%';
        }
      }
    });

    await new Promise((resolve, reject) => {
      xhr.addEventListener('load', function() {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          showNotification(`تم رفع الملف ${file.name} بنجاح`, 'success');
          resolve();
        } else {
          let errorMessage = `حدث خطأ أثناء رفع الملف ${file.name}`;
          try {
            const response = JSON.parse(xhr.responseText);
            errorMessage = response.message || errorMessage;
          } catch (e) {}
          showNotification(errorMessage, 'danger');
          reject(new Error(errorMessage));
        }
      });

      xhr.addEventListener('error', function() {
        showNotification(`حدث خطأ في الاتصال بالخادم أثناء رفع ${file.name}`, 'danger');
        reject(new Error('خطأ في الاتصال بالخادم'));
      });

      xhr.open('POST', '/upload', true);
      xhr.send(formData);
    });
  } catch (error) {
    console.error('خطأ في رفع الملف:', error);
  } finally {
    // إعادة تفعيل زر الرفع وإخفاء شريط التقدم بعد كل ملف
    uploadBtn.disabled = false;
    uploadBtn.innerHTML = '<i class="bi bi-cloud-upload me-2"></i><span>رفع الملفات</span>';
    uploadProgress.classList.add('d-none');
  }
}

// معالجة نموذج رفع الملفات
uploadForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  // إذا كان هناك ملفات مختارة من مربع الحوار، قم برفعها
  if (fileInput.files.length > 0) {
    for (const file of fileInput.files) {
      await uploadFile(file);
    }
  } else {
    showNotification('يرجى اختيار ملف أو سحبه وإفلاته للرفع', 'warning');
  }
});

// معالجة أحداث السحب والإسقاط
dropArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropArea.classList.add('border-primary');
});

dropArea.addEventListener('dragleave', () => {
  dropArea.classList.remove('border-primary');
});

dropArea.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropArea.classList.remove('border-primary');

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    for (const file of files) {
      await uploadFile(file);
    }
  }
});

// معالجة النقر على منطقة السحب والإفلات لفتح مربع حوار اختيار الملفات
dropArea.addEventListener('click', () => {
  fileInput.click();
});

// معالجة تغييرات مربع حوار اختيار الملفات
fileInput.addEventListener('change', async (e) => {
  for (const file of e.target.files) {
    await uploadFile(file);
  }
});

// دالة لتنظيف الملفات القديمة
async function cleanupOldFiles() {
  try {
    console.log('🧹 بدء تنظيف الملفات القديمة...');

    const response = await fetch('/cleanup-old-files', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (data.status) {
      if (data.deletedCount > 0) {
        console.log(`✅ تم حذف ${data.deletedCount} ملف قديم (${data.deletedSizeMB} ميجابايت)`);
        showNotification(`تم تنظيف ${data.deletedCount} ملف قديم`, 'info');
        // تحديث قائمة الملفات بعد التنظيف
        updateFilesList();
      } else {
        console.log('✅ لا توجد ملفات قديمة للحذف');
      }
    } else {
      console.error('❌ فشل في تنظيف الملفات:', data.message);
    }
  } catch (error) {
    console.error('❌ خطأ في تنظيف الملفات:', error);
  }
}

// تحديث قائمة الملفات
function updateFilesList() {
  fetch('/files')
    .then(response => response.json())
    .then(files => {
      // تنظيف أسماء الملفات
      currentFiles = files.map(file => ({
        ...file,
        name: sanitizeFileName(file.name)
      }));
      renderFilesList();
    })
    .catch(error => {
      console.error('خطأ في جلب قائمة الملفات:', error);
      showNotification('تعذر تحديث قائمة الملفات', 'danger');
    });
}

// تحديث إحصائيات الملفات
function updateFileStats() {
  const fileCount = currentFiles.length;
  const totalSizeBytes = currentFiles.reduce((sum, file) => sum + (file.size || 0), 0);
  const totalSizeFormatted = formatFileSize(totalSizeBytes);

  // تحديث الإحصائيات في header قسم الملفات المشتركة
  if (headerTotalFiles) headerTotalFiles.textContent = fileCount;
  if (headerTotalSize) headerTotalSize.textContent = totalSizeFormatted;

  // تحديث عدد التنزيلات (يمكن تطويره لاحقاً لحفظ العدد الفعلي)
  if (headerTotalDownloads) headerTotalDownloads.textContent = '0';

  // يمكن إضافة إحصائيات أخرى هنا
}

// عرض قائمة الملفات
function renderFilesList() {
  if (currentFiles.length === 0) {
    filesList.innerHTML = '';
    noFilesMessage.classList.remove('d-none');
    updateFileStats();
    return;
  }

  noFilesMessage.classList.add('d-none');
  
  // فرز الملفات بحسب تاريخ الرفع (الأحدث أولاً)
  currentFiles.sort((a, b) => new Date(b.uploadTime) - new Date(a.uploadTime));
  
  let html = '';
  currentFiles.forEach(file => {
    const fileSize = formatFileSize(file.size);
    const fileDate = formatDate(file.uploadTime);
    const fileDateRelative = formatDateRelative(file.uploadTime);
    const fileIcon = getFileIcon(file.type);
    const cleanFileName = sanitizeFileName(file.name);

    html += `
      <tr class="file-row" data-file-id="${file.id}">
        <td>
          <div class="d-flex align-items-center">
            <i class="bi ${fileIcon} file-icon"></i>
            <span class="file-name">${escapeHtml(cleanFileName)}</span>
          </div>
        </td>
        <td>${getFileType(file.type)}</td>
        <td>${fileSize}</td>
        <td>
          <span class="text-muted small" title="${fileDate}">${fileDateRelative}</span>
          <br>
          <small class="text-secondary">${fileDate}</small>
        </td>
        <td class="file-actions text-center">
          <button class="btn btn-sm btn-outline-primary action-btn preview-btn" title="معاينة">
            <i class="bi bi-eye"></i>
          </button>
          <a href="${file.path}" download="${cleanFileName}" class="btn btn-sm btn-outline-success action-btn" title="تنزيل">
            <i class="bi bi-download"></i>
          </a>
          <button class="btn btn-sm btn-outline-danger action-btn delete-btn" title="حذف">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
  });
  
  filesList.innerHTML = html;
  
  // إضافة مستمعي الأحداث لأزرار الإجراءات
  document.querySelectorAll('.preview-btn').forEach(btn => {
    btn.addEventListener('click', handlePreview);
  });
  
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', handleDelete);
  });

  // تحديث الإحصائيات
  updateFileStats();
}

// معالجة معاينة الملف
function handlePreview(e) {
  const fileId = e.currentTarget.closest('.file-row').dataset.fileId;
  const file = currentFiles.find(f => f.id === fileId);

  if (!file) return;

  const cleanFileName = sanitizeFileName(file.name);
  previewFilename.textContent = cleanFileName;
  downloadBtn.href = file.path;
  downloadBtn.download = cleanFileName;

  // تحديد نوع المحتوى وعرضه بالشكل المناسب
  if (file.type.startsWith('image/')) {
    // معاينة الصور
    previewContent.innerHTML = `<img src="${file.path}" alt="${file.name}" class="preview-image">`;
  } else if (file.type.startsWith('video/')) {
    // معاينة الفيديو
    previewContent.innerHTML = `
      <video src="${file.path}" controls class="preview-video">
        متصفحك لا يدعم تشغيل الفيديو
      </video>
    `;
  } else if (file.type.startsWith('audio/')) {
    // معاينة الصوت
    previewContent.innerHTML = `
      <audio src="${file.path}" controls class="preview-audio">
        متصفحك لا يدعم تشغيل الصوت
      </audio>
    `;
  } else if (file.type === 'application/pdf') {
    // معاينة ملفات PDF
    previewContent.innerHTML = `<iframe src="${file.path}" class="preview-pdf"></iframe>`;
  } else if (file.type.startsWith('text/') || file.type === 'application/json') {
    // معاينة الملفات النصية
    fetch(file.path)
      .then(response => response.text())
      .then(text => {
        previewContent.innerHTML = `<pre class="preview-text">${escapeHtml(text)}</pre>`;
      })
      .catch(error => {
        previewContent.innerHTML = `
          <div class="preview-other">
            <i class="bi bi-exclamation-circle preview-icon"></i>
            <p>تعذر تحميل محتوى الملف</p>
          </div>
        `;
      });
  } else {
    // ملفات أخرى غير قابلة للمعاينة
    previewContent.innerHTML = `
      <div class="preview-other">
        <i class="bi ${getFileIcon(file.type)} preview-icon"></i>
        <p>لا يمكن معاينة هذا النوع من الملفات</p>
        <p>يمكنك تنزيل الملف لعرضه</p>
      </div>
    `;
  }

  previewModal.show();
}

// معالجة حذف الملف
function handleDelete(e) {
  const fileId = e.currentTarget.closest('.file-row').dataset.fileId;
  const file = currentFiles.find(f => f.id === fileId);

  if (!file) return;

  const cleanFileName = sanitizeFileName(file.name);

  if (confirm(`هل أنت متأكد من حذف الملف "${cleanFileName}"؟`)) {
    fetch(`/files/${fileId}`, {
      method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
      if (data.status) {
        showNotification(`تم حذف الملف ${cleanFileName} بنجاح`, 'success');
        // إزالة الملف من القائمة المحلية
        const index = currentFiles.findIndex(f => f.id === fileId);
        if (index !== -1) {
          currentFiles.splice(index, 1);
          renderFilesList();
        }
      } else {
        showNotification(data.message || 'فشل في حذف الملف', 'danger');
      }
    })
    .catch(error => {
      console.error('خطأ في حذف الملف:', error);
      showNotification('حدث خطأ أثناء حذف الملف', 'danger');
    });
  }
}

// مستمعي الأحداث
refreshBtn.addEventListener('click', updateFilesList);

// مستمع حدث زر التنظيف
const cleanupBtn = document.getElementById('cleanup-btn');
cleanupBtn.addEventListener('click', async () => {
  // تأكيد من المستخدم قبل التنظيف
  if (confirm('هل أنت متأكد من حذف جميع الملفات القديمة؟\nسيتم حذف الملفات الأقدم من 24 ساعة.')) {
    // تعطيل الزر أثناء التنظيف
    cleanupBtn.disabled = true;
    cleanupBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>جاري التنظيف...';

    try {
      await cleanupOldFiles();
    } finally {
      // إعادة تفعيل الزر
      cleanupBtn.disabled = false;
      cleanupBtn.innerHTML = '<i class="bi bi-trash3 me-1"></i>تنظيف';
    }
  }
});

// مستمع حدث زر التصفح
browseBtn.addEventListener('click', (e) => {
  e.stopPropagation(); // منع انتشار الحدث لمنطقة السحب والإفلات
  fileInput.click();
});

// مستمعي أحداث Socket.IO
socket.on('connect', () => {
  console.log('تم الاتصال بالخادم');

  // تحديث حالة الاتصال
  if (connectionStatus) {
    connectionStatus.textContent = 'متصل';
    connectionStatus.parentElement.classList.remove('text-danger');
    connectionStatus.parentElement.classList.add('text-light');
  }
});

socket.on('all-files', (files) => {
  // تنظيف أسماء الملفات
  currentFiles = files.map(file => ({
    ...file,
    name: sanitizeFileName(file.name)
  }));
  renderFilesList();
});

socket.on('new-file', (file) => {
  // تنظيف اسم الملف الجديد
  const cleanFile = {
    ...file,
    name: sanitizeFileName(file.name)
  };

  // إضافة الملف الجديد إلى القائمة
  const existingIndex = currentFiles.findIndex(f => f.id === cleanFile.id);
  if (existingIndex !== -1) {
    currentFiles[existingIndex] = cleanFile;
  } else {
    currentFiles.push(cleanFile);
    showNotification('تم إضافة ملف جديد: ' + cleanFile.name, 'info');
  }
  renderFilesList();
});

socket.on('delete-file', (fileId) => {
  // حذف الملف من القائمة
  const index = currentFiles.findIndex(f => f.id === fileId);
  if (index !== -1) {
    currentFiles.splice(index, 1);
    renderFilesList();
  }
});

socket.on('user-info', (userInfo) => {
  // حفظ معلومات المستخدم الحالي
  currentUserInfo = userInfo;
  console.log('معلومات المستخدم:', userInfo);
});

socket.on('connected-users-update', (data) => {
  const { count, userNames, usersDetails } = data;
  connectedUserNames = userNames;
  connectedUsersDetails = usersDetails || [];

  // تحديث عدد المتصلين في شريط التنقل
  if (connectedUsersCount) {
    connectedUsersCount.textContent = count;

    // إضافة تأثير بصري عند تغيير العدد
    connectedUsersCount.parentElement.classList.add('text-warning');
    setTimeout(() => {
      connectedUsersCount.parentElement.classList.remove('text-warning');
      connectedUsersCount.parentElement.classList.add('text-light');
    }, 1000);

    // تحديث النص بناءً على العدد
    const textElement = document.querySelector('#connected-users-tooltip small');
    if (textElement) {
      if (count === 0) {
        textElement.textContent = 'غير متصل';
        textElement.className = 'text-danger';
      } else if (count === 1) {
        textElement.textContent = 'متصل';
        textElement.className = 'text-muted';
      } else {
        textElement.textContent = 'متصل';
        textElement.className = 'text-muted';
      }
    }

    // تحديث لون الأيقونة بناءً على العدد
    const iconElement = document.querySelector('#connected-users-tooltip .bi-people-fill');
    if (iconElement) {
      if (count === 0) {
        iconElement.className = 'bi bi-people-fill me-2 text-muted fs-5';
      } else {
        iconElement.className = 'bi bi-people-fill me-2 text-success fs-5';
      }
    }
  }

  // تحديث tooltip مع تفاصيل المستخدمين
  updateConnectedUsersTooltip(count, connectedUsersDetails);

  // تحديث قائمة المستخدمين المتصلين
  updateConnectedUsersList(connectedUsersDetails);

  console.log(`عدد المتصلين الحالي: ${count}، التفاصيل:`, connectedUsersDetails);
});

socket.on('user-joined', (data) => {
  const userName = data?.name || 'مستخدم جديد';
  showNotification(`انضم ${userName}`, 'info');
});

socket.on('user-left', (data) => {
  const userName = data?.name || 'أحد المستخدمين';
  showNotification(`غادر ${userName}`, 'warning');
});

// استقبال ملف مرسل من مستخدم آخر
socket.on('file-received', (data) => {
  const { fileName, senderName, fileUrl } = data;
  showNotification(
    `تم استلام ملف "${fileName}" من ${senderName}`,
    'info',
    {
      action: {
        text: 'تنزيل',
        callback: () => {
          const link = document.createElement('a');
          link.href = fileUrl;
          link.download = fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    }
  );
});

// إشعار بنجاح إرسال الملف
socket.on('file-sent-success', (data) => {
  const { fileName, recipientName } = data;
  showNotification(`تم إرسال "${fileName}" إلى ${recipientName} بنجاح`, 'success');
});

// إشعار بفشل إرسال الملف
socket.on('file-sent-error', (data) => {
  const { fileName, recipientName, error } = data;
  showNotification(`فشل في إرسال "${fileName}" إلى ${recipientName}: ${error}`, 'danger');
});

socket.on('disconnect', () => {
  console.log('انقطع الاتصال بالخادم');
  showNotification('انقطع الاتصال بالخادم', 'warning');

  // تحديث حالة الاتصال
  if (connectionStatus) {
    connectionStatus.textContent = 'غير متصل';
    connectionStatus.parentElement.classList.add('text-danger');
    connectionStatus.parentElement.classList.remove('text-light');
  }
});

// تحميل قائمة الملفات عند بدء التطبيق
updateFilesList();

// تحديث tooltip عدد المتصلين كل 30 ثانية لإظهار مدة الاتصال المحدثة
setInterval(() => {
  if (connectedUsersDetails.length > 0) {
    // تحديث مدة الاتصال للمستخدمين
    const updatedDetails = connectedUsersDetails.map(user => ({
      ...user,
      duration: user.duration + 30 // إضافة 30 ثانية
    }));
    connectedUsersDetails = updatedDetails;

    // تحديث tooltip
    updateConnectedUsersTooltip(connectedUsersDetails.length, connectedUsersDetails);

    // تحديث قائمة المستخدمين المتصلين
    updateConnectedUsersList(connectedUsersDetails);
  }
}, 30000); // كل 30 ثانية

// تنظيف الملفات القديمة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  // تهيئة tooltips
  const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
  const tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
    return new bootstrap.Tooltip(tooltipTriggerEl);
  });

  // انتظار ثانية واحدة لضمان تحميل كامل للصفحة
  setTimeout(() => {
    cleanupOldFiles();
  }, 1000);
});
