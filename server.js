/**
 * Share Local Network File - خادم التطبيق
 * تطبيق مشاركة ملفات بين الأجهزة على نفس الشبكة المحلية
 * يدعم رفع وتنزيل ومعاينة الملفات مع واجهة عربية سهلة الاستخدام
 */

const express = require('express');
const fileUpload = require('express-fileupload');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
require('dotenv').config();
const ip = require('ip');

// تعيين ترميز UTF-8 للعملية
process.env.NODE_OPTIONS = '--max-old-space-size=4096';
if (process.platform === 'win32') {
  process.env.CHCP = '65001'; // UTF-8 encoding for Windows
}

// إنشاء تطبيق Express
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// إعداد المجلد الذي سيتم تخزين الملفات فيه
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// الإعدادات الوسيطة
app.use(express.json({ charset: 'utf-8' }));
app.use(express.urlencoded({ extended: true, charset: 'utf-8' }));
app.use(fileUpload({
  createParentPath: true,
  limits: { fileSize: 1024 * 1024 * 1024 }, // حد أقصى 1 جيجابايت
  parseNested: true,
  useTempFiles: false,
  tempFileDir: '/tmp/',
  preserveExtension: true,
  safeFileNames: false, // للسماح بالأحرف العربية
  defCharset: 'utf8',
  defParamCharset: 'utf8'
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// إعداد headers للترميز الصحيح
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  next();
});

// قائمة لتخزين الملفات المشتركة
let sharedFiles = [];

// إعدادات حذف الملفات القديمة
const FILE_CLEANUP_CONFIG = {
  // عمر الملف بالساعات (افتراضي: 24 ساعة)
  maxFileAge: process.env.MAX_FILE_AGE_HOURS || 24,
  // تفعيل الحذف التلقائي عند بدء التطبيق
  autoCleanupOnStart: process.env.AUTO_CLEANUP_ON_START !== 'false',
  // تفعيل الحذف التلقائي الدوري
  enablePeriodicCleanup: process.env.ENABLE_PERIODIC_CLEANUP !== 'false',
  // فترة الحذف الدوري بالساعات (افتراضي: كل 6 ساعات)
  cleanupInterval: process.env.CLEANUP_INTERVAL_HOURS || 6
};

// دالة لحذف الملفات القديمة
function cleanupOldFiles() {
  try {
    const now = new Date();
    const maxAge = FILE_CLEANUP_CONFIG.maxFileAge * 60 * 60 * 1000; // تحويل إلى ميلي ثانية
    let deletedCount = 0;
    let deletedSize = 0;

    console.log(`🧹 بدء عملية تنظيف الملفات القديمة (أقدم من ${FILE_CLEANUP_CONFIG.maxFileAge} ساعة)...`);

    // فحص الملفات في القائمة
    const filesToDelete = sharedFiles.filter(file => {
      const fileAge = now - new Date(file.uploadTime);
      return fileAge > maxAge;
    });

    // حذف الملفات القديمة
    filesToDelete.forEach(file => {
      const filePath = path.join(__dirname, 'uploads', path.basename(file.path));

      try {
        // التحقق من وجود الملف قبل الحذف
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          fs.unlinkSync(filePath);
          deletedSize += stats.size;
          console.log(`🗑️ تم حذف الملف: ${file.name}`);
        }

        // إزالة الملف من القائمة
        const index = sharedFiles.findIndex(f => f.id === file.id);
        if (index !== -1) {
          sharedFiles.splice(index, 1);
          deletedCount++;

          // إرسال إشعار للمستخدمين المتصلين بحذف الملف
          io.emit('delete-file', file.id);
        }
      } catch (error) {
        console.error(`❌ خطأ في حذف الملف ${file.name}:`, error.message);
      }
    });

    // فحص الملفات الموجودة في المجلد ولكن غير مسجلة في القائمة
    if (fs.existsSync(uploadsDir)) {
      const filesInDir = fs.readdirSync(uploadsDir);

      filesInDir.forEach(fileName => {
        const filePath = path.join(uploadsDir, fileName);
        const stats = fs.statSync(filePath);
        const fileAge = now - stats.mtime;

        // إذا كان الملف قديم وغير موجود في القائمة
        if (fileAge > maxAge && !sharedFiles.find(f => path.basename(f.path) === fileName)) {
          try {
            fs.unlinkSync(filePath);
            deletedSize += stats.size;
            deletedCount++;
            console.log(`🗑️ تم حذف ملف غير مسجل: ${fileName}`);
          } catch (error) {
            console.error(`❌ خطأ في حذف الملف غير المسجل ${fileName}:`, error.message);
          }
        }
      });
    }

    const deletedSizeMB = (deletedSize / (1024 * 1024)).toFixed(2);
    console.log(`✅ تم الانتهاء من التنظيف: حُذف ${deletedCount} ملف بحجم إجمالي ${deletedSizeMB} ميجابايت`);

    return { deletedCount, deletedSize };
  } catch (error) {
    console.error('❌ خطأ في عملية تنظيف الملفات:', error);
    return { deletedCount: 0, deletedSize: 0 };
  }
}

// دالة لتنظيف اسم الملف وضمان الترميز الصحيح
function sanitizeFileName(fileName) {
  try {
    // تحويل من Buffer إلى string إذا لزم الأمر
    if (Buffer.isBuffer(fileName)) {
      fileName = fileName.toString('utf8');
    }

    // إذا كان الاسم مُرمز بشكل خاطئ، حاول إصلاحه
    if (fileName.includes('Ù') || fileName.includes('Ø')) {
      // محاولة فك الترميز الخاطئ وإعادة ترميزه بشكل صحيح
      try {
        const buffer = Buffer.from(fileName, 'latin1');
        fileName = buffer.toString('utf8');
      } catch (e) {
        console.log('خطأ في إصلاح ترميز اسم الملف:', e.message);
      }
    }

    // إزالة الأحرف غير المرغوب فيها مع الحفاظ على العربية
    fileName = fileName.replace(/[<>:"/\\|?*]/g, '_');

    return fileName;
  } catch (error) {
    console.error('خطأ في تنظيف اسم الملف:', error);
    return fileName;
  }
}

// مسار الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// مسار لرفع الملفات
app.post('/upload', (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ status: false, message: 'لم يتم اختيار أي ملف' });
    }

    const file = req.files.file;

    // تنظيف اسم الملف وضمان الترميز الصحيح
    const originalFileName = sanitizeFileName(file.name);
    console.log('اسم الملف الأصلي:', originalFileName);

    const fileExtension = path.extname(originalFileName);
    const fileNameWithoutExt = path.basename(originalFileName, fileExtension);
    const randomNum = Math.floor(Math.random() * 1000000); // رقم عشوائي بين 0 و 999999
    const newFileName = `${fileNameWithoutExt}_${randomNum}${fileExtension}`;
    const fileName = newFileName;
    const filePath = path.join(uploadsDir, newFileName);

    console.log('اسم الملف الجديد:', fileName);

    // نقل الملف إلى مجلد التحميلات
    file.mv(filePath, (err) => {
      if (err) {
        return res.status(500).json({ status: false, message: err.message });
      }

      // إضافة الملف إلى قائمة الملفات المشتركة
      const fileInfo = {
        id: Date.now().toString(),
        name: fileName,
        path: `/uploads/${fileName}`,
        size: file.size,
        type: file.mimetype,
        uploadTime: new Date().toISOString()
      };

      sharedFiles.push(fileInfo);

      // إرسال إشعار للمستخدمين الآخرين بوجود ملف جديد
      io.emit('new-file', fileInfo);

      return res.status(200).json({
        status: true,
        message: 'تم رفع الملف بنجاح',
        file: fileInfo
      });
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
});

// مسار للحصول على قائمة الملفات المشتركة
app.get('/files', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // التأكد من الترميز الصحيح لأسماء الملفات
  const filesWithCorrectEncoding = sharedFiles.map(file => ({
    ...file,
    name: sanitizeFileName(file.name)
  }));

  res.json(filesWithCorrectEncoding);
});

// مسار لحذف ملف
app.delete('/files/:id', (req, res) => {
  const fileId = req.params.id;
  const fileIndex = sharedFiles.findIndex(file => file.id === fileId);

  if (fileIndex === -1) {
    return res.status(404).json({ status: false, message: 'الملف غير موجود' });
  }

  const file = sharedFiles[fileIndex];
  const filePath = path.join(__dirname, 'uploads', path.basename(file.path));

  // حذف الملف من القرص
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      return res.status(500).json({ status: false, message: err.message });
    }

    // حذف الملف من القائمة
    sharedFiles.splice(fileIndex, 1);

    // إرسال إشعار للمستخدمين الآخرين بحذف الملف
    io.emit('delete-file', fileId);

    return res.status(200).json({ status: true, message: 'تم حذف الملف بنجاح' });
  });
});

// مسار لحذف الملفات القديمة يدوياً
app.post('/cleanup-old-files', (req, res) => {
  try {
    const result = cleanupOldFiles();

    res.json({
      status: true,
      message: `تم حذف ${result.deletedCount} ملف قديم بنجاح`,
      deletedCount: result.deletedCount,
      deletedSize: result.deletedSize,
      deletedSizeMB: (result.deletedSize / (1024 * 1024)).toFixed(2)
    });
  } catch (error) {
    console.error('خطأ في تنظيف الملفات:', error);
    res.status(500).json({
      status: false,
      message: 'حدث خطأ أثناء تنظيف الملفات القديمة'
    });
  }
});

// مسار للحصول على إعدادات التنظيف
app.get('/cleanup-settings', (req, res) => {
  res.json({
    status: true,
    settings: FILE_CLEANUP_CONFIG,
    currentFileCount: sharedFiles.length,
    uploadsDir: uploadsDir
  });
});

// متغير لتتبع عدد المتصلين ومعلوماتهم
let connectedUsers = 0;
let connectedUsersList = new Map(); // Map لتخزين معلومات المستخدمين

// دالة لتوليد اسم مستخدم تلقائي
function generateUserName() {
  const adjectives = ['سريع', 'ذكي', 'نشط', 'مبدع', 'ماهر', 'خبير', 'متقن', 'بارع'];
  const nouns = ['مستخدم', 'زائر', 'ضيف', 'عضو', 'مشارك', 'متصفح', 'مطور', 'مساعد'];

  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNumber = Math.floor(Math.random() * 999) + 1;

  return `${randomAdjective} ${randomNoun} ${randomNumber}`;
}

// دالة للحصول على قائمة أسماء المستخدمين المتصلين
function getConnectedUserNames() {
  return Array.from(connectedUsersList.values()).map(user => user.name);
}

// دالة للحصول على معلومات مفصلة عن المستخدمين المتصلين
function getConnectedUsersDetails() {
  return Array.from(connectedUsersList.values()).map(user => ({
    name: user.name,
    joinTime: user.joinTime,
    duration: Math.floor((new Date() - new Date(user.joinTime)) / 1000) // بالثواني
  }));
}

// إعداد Socket.IO للاتصال المباشر
io.on('connection', (socket) => {
  // إنشاء معلومات المستخدم الجديد
  const userName = generateUserName();
  const userInfo = {
    id: socket.id,
    name: userName,
    joinTime: new Date().toISOString(),
    ip: socket.handshake.address
  };

  // إضافة المستخدم إلى القائمة
  connectedUsersList.set(socket.id, userInfo);
  connectedUsers++;

  console.log(`مستخدم جديد متصل: ${userName} - العدد الحالي: ${connectedUsers}`);

  // إرسال قائمة الملفات الحالية للمستخدم الجديد
  socket.emit('all-files', sharedFiles);

  // إرسال معلومات المستخدم الجديد
  socket.emit('user-info', userInfo);

  // إرسال عدد المتصلين وقائمة أسمائهم لجميع المستخدمين
  const userNames = getConnectedUserNames();
  const usersDetails = getConnectedUsersDetails();
  io.emit('connected-users-update', {
    count: connectedUsers,
    userNames: userNames,
    usersDetails: usersDetails
  });

  // إرسال إشعار للمستخدمين الآخرين (ليس للمستخدم الجديد نفسه)
  if (connectedUsers > 1) {
    socket.broadcast.emit('user-joined', { name: userName });
  }

  socket.on('disconnect', () => {
    // إزالة المستخدم من القائمة
    const disconnectedUser = connectedUsersList.get(socket.id);
    connectedUsersList.delete(socket.id);
    connectedUsers--;

    console.log(`انقطع اتصال المستخدم: ${disconnectedUser?.name || 'غير معروف'} - العدد الحالي: ${connectedUsers}`);

    // إرسال عدد المتصلين المحدث وقائمة أسمائهم لجميع المستخدمين
    const userNames = getConnectedUserNames();
    const usersDetails = getConnectedUsersDetails();
    io.emit('connected-users-update', {
      count: connectedUsers,
      userNames: userNames,
      usersDetails: usersDetails
    });

    // إرسال إشعار للمستخدمين المتبقين
    if (connectedUsers > 0 && disconnectedUser) {
      socket.broadcast.emit('user-left', { name: disconnectedUser.name });
    }
  });
});

// تشغيل الخادم
const PORT = process.env.PORT || 3001;
const BASE_URL = process.env.BASE_URL || `http://localhost`;
const NETWORK_INTERFACE = process.env.NETWORK_INTERFACE;

server.listen(PORT, () => {
  let localIp = 'localhost';
  if (NETWORK_INTERFACE) {
    try {
      localIp = ip.address(NETWORK_INTERFACE);
    } catch (e) {
      console.warn(`تحذير: واجهة الشبكة ${NETWORK_INTERFACE} غير موجودة أو غير نشطة. سيتم استخدام localhost.`);
    }
  } else {
    localIp = ip.address();
  }

  console.log(`🚀 Share Local Network File - الخادم يعمل على المنفذ ${PORT}`);
  console.log(`🌐 يمكنك الوصول للتطبيق محلياً عبر: ${BASE_URL}:${PORT}`);
  console.log(`📱 يمكن للأجهزة الأخرى على نفس الشبكة الوصول عبر: http://${localIp}:${PORT}`);

  // تنظيف الملفات القديمة عند بدء الخادم
  if (FILE_CLEANUP_CONFIG.autoCleanupOnStart) {
    console.log('🚀 تشغيل التنظيف التلقائي للملفات القديمة عند بدء الخادم...');
    setTimeout(() => {
      cleanupOldFiles();
    }, 2000); // انتظار ثانيتين لضمان تحميل كامل للخادم
  }

  // إعداد التنظيف الدوري
  if (FILE_CLEANUP_CONFIG.enablePeriodicCleanup) {
    const intervalMs = FILE_CLEANUP_CONFIG.cleanupInterval * 60 * 60 * 1000; // تحويل إلى ميلي ثانية
    console.log(`⏰ تم تفعيل التنظيف الدوري كل ${FILE_CLEANUP_CONFIG.cleanupInterval} ساعة`);

    setInterval(() => {
      console.log('⏰ تشغيل التنظيف الدوري المجدول...');
      cleanupOldFiles();
    }, intervalMs);
  }

  console.log(`📁 إعدادات التنظيف: حذف الملفات الأقدم من ${FILE_CLEANUP_CONFIG.maxFileAge} ساعة`);
});