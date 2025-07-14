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
// تم حذف العناصر القديمة
const browseBtn = document.getElementById('browse-btn');

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

socket.on('disconnect', () => {
  console.log('انقطع الاتصال بالخادم');
  showNotification('انقطع الاتصال بالخادم', 'warning');
});

// تحميل قائمة الملفات عند بدء التطبيق
updateFilesList();

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
