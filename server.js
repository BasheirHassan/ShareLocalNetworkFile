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
    const uploaderSocketId = req.body.uploaderSocketId; // معرف المستخدم الذي رفع الملف

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

      // الحصول على معلومات المستخدم الذي رفع الملف
      const uploaderInfo = connectedUsersList.get(uploaderSocketId);
      const uploaderName = uploaderInfo ? uploaderInfo.name : 'مستخدم مجهول';

      // إضافة الملف إلى قائمة الملفات المشتركة
      const fileInfo = {
        id: Date.now().toString(),
        name: fileName,
        path: `/uploads/${fileName}`,
        size: file.size,
        type: file.mimetype,
        uploadTime: new Date().toISOString(),
        isPrivate: false, // ملف عام
        uploadedBy: uploaderName,
        uploaderSocketId: uploaderSocketId
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

// مسار للحصول على قائمة الملفات المشتركة العامة فقط
app.get('/files', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // تصفية الملفات العامة فقط
  const publicFiles = sharedFiles.filter(file => !file.isPrivate);

  // التأكد من الترميز الصحيح لأسماء الملفات
  const filesWithCorrectEncoding = publicFiles.map(file => ({
    ...file,
    name: sanitizeFileName(file.name)
  }));

  res.json(filesWithCorrectEncoding);
});

// مسار للحصول على الملفات الخاصة للمستخدم الحالي
app.get('/files/private/:socketId', (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const socketId = req.params.socketId;
  const userInfo = connectedUsersList.get(socketId);

  if (!userInfo) {
    return res.status(404).json({ status: false, message: 'المستخدم غير موجود' });
  }

  // تصفية الملفات الخاصة المرسلة للمستخدم الحالي أو المرسلة منه
  const privateFiles = sharedFiles.filter(file =>
    file.isPrivate && (
      file.recipientName === userInfo.name ||
      file.senderName === userInfo.name
    )
  );

  // التأكد من الترميز الصحيح لأسماء الملفات
  const filesWithCorrectEncoding = privateFiles.map(file => ({
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

// مسار لإرسال ملف لمستخدم محدد (ملف خاص)
app.post('/send-file', (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ status: false, message: 'لم يتم اختيار ملف' });
    }

    const targetUser = req.body.targetUser;
    const senderSocketId = req.body.senderSocketId;

    if (!targetUser) {
      return res.status(400).json({ status: false, message: 'لم يتم تحديد المستخدم المستهدف' });
    }

    // البحث عن المستخدم المستهدف
    const targetUserInfo = Array.from(connectedUsersList.values()).find(user => user.name === targetUser);
    if (!targetUserInfo) {
      return res.status(404).json({ status: false, message: 'المستخدم المستهدف غير متصل' });
    }

    // الحصول على معلومات المرسل
    const senderInfo = connectedUsersList.get(senderSocketId);
    const senderName = senderInfo ? senderInfo.name : req.body.senderName || 'مستخدم مجهول';

    const file = req.files.file;
    const fileName = sanitizeFileName(file.name);
    const fileExtension = path.extname(fileName);
    const timestamp = Date.now();
    const uniqueFileName = `private_${timestamp}_${fileName}`;
    const filePath = path.join(uploadsDir, uniqueFileName);

    // نقل الملف إلى مجلد التحميلات
    file.mv(filePath, (err) => {
      if (err) {
        return res.status(500).json({ status: false, message: err.message });
      }

      // إضافة الملف إلى قائمة الملفات المشتركة كملف خاص
      const fileInfo = {
        id: timestamp.toString(),
        name: fileName,
        path: `/uploads/${uniqueFileName}`,
        size: file.size,
        type: file.mimetype,
        uploadTime: new Date().toISOString(),
        isPrivate: true, // ملف خاص
        senderName: senderName,
        recipientName: targetUser,
        senderSocketId: senderSocketId,
        recipientSocketId: targetUserInfo.id
      };

      sharedFiles.push(fileInfo);

      // إرسال الملف للمستخدم المستهدف
      const targetSocket = io.sockets.sockets.get(targetUserInfo.id);
      if (targetSocket) {
        targetSocket.emit('file-received', {
          fileName: fileName,
          senderName: senderName,
          fileUrl: fileInfo.path,
          fileInfo: fileInfo
        });

        // إرسال تأكيد للمرسل
        res.status(200).json({
          status: true,
          message: `تم إرسال الملف "${fileName}" إلى ${targetUser} بنجاح`,
          file: fileInfo
        });

        // إرسال إشعار للمرسل والمستقبل فقط بالملف الجديد (ليس لجميع المستخدمين)
        const senderSocket = io.sockets.sockets.get(senderSocketId);
        if (senderSocket) {
          senderSocket.emit('new-private-file', fileInfo);
        }
        targetSocket.emit('new-private-file', fileInfo);
      } else {
        // المستخدم المستهدف غير متصل
        res.status(404).json({ status: false, message: 'المستخدم المستهدف غير متصل حالياً' });
      }
    });
  } catch (err) {
    res.status(500).json({ status: false, message: err.message });
  }
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
    duration: Math.floor((new Date() - new Date(user.joinTime)) / 1000), // بالثواني
    deviceType: user.deviceType || 'غير معروف',
    deviceName: user.deviceName || 'جهاز غير معروف',
    browser: user.browser || 'متصفح غير معروف',
    os: user.os || 'نظام تشغيل غير معروف',
    ip: user.ip
  }));
}

// دالة لتحليل User Agent واستخراج معلومات الجهاز
function parseUserAgent(userAgent) {
  if (!userAgent) {
    return {
      deviceType: 'غير معروف',
      deviceName: 'جهاز غير معروف',
      browser: 'متصفح غير معروف',
      os: 'نظام تشغيل غير معروف'
    };
  }

  let deviceType = 'كمبيوتر';
  let deviceName = 'جهاز كمبيوتر';
  let browser = 'متصفح غير معروف';
  let os = 'نظام تشغيل غير معروف';

  // تحديد نوع الجهاز
  if (/Mobile|Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
    if (/iPad/i.test(userAgent)) {
      deviceType = 'تابلت';
      deviceName = 'iPad';
    } else if (/iPhone/i.test(userAgent)) {
      deviceType = 'هاتف ذكي';
      deviceName = 'iPhone';
    } else if (/Android/i.test(userAgent)) {
      if (/Mobile/i.test(userAgent)) {
        deviceType = 'هاتف ذكي';
        deviceName = 'هاتف أندرويد';
      } else {
        deviceType = 'تابلت';
        deviceName = 'تابلت أندرويد';
      }
    } else {
      deviceType = 'هاتف ذكي';
      deviceName = 'هاتف ذكي';
    }
  }

  // تحديد المتصفح
  if (/Chrome/i.test(userAgent) && !/Edge/i.test(userAgent)) {
    browser = 'Chrome';
  } else if (/Firefox/i.test(userAgent)) {
    browser = 'Firefox';
  } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
    browser = 'Safari';
  } else if (/Edge/i.test(userAgent)) {
    browser = 'Edge';
  } else if (/Opera/i.test(userAgent)) {
    browser = 'Opera';
  }

  // تحديد نظام التشغيل
  if (/Windows NT 10/i.test(userAgent)) {
    os = 'Windows 10/11';
  } else if (/Windows NT 6.3/i.test(userAgent)) {
    os = 'Windows 8.1';
  } else if (/Windows NT 6.1/i.test(userAgent)) {
    os = 'Windows 7';
  } else if (/Windows/i.test(userAgent)) {
    os = 'Windows';
  } else if (/Mac OS X/i.test(userAgent)) {
    os = 'macOS';
  } else if (/Linux/i.test(userAgent)) {
    os = 'Linux';
  } else if (/Android/i.test(userAgent)) {
    const androidMatch = userAgent.match(/Android (\d+\.?\d*)/);
    os = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
  } else if (/iOS/i.test(userAgent) || /iPhone OS/i.test(userAgent)) {
    const iosMatch = userAgent.match(/OS (\d+_?\d*)/);
    os = iosMatch ? `iOS ${iosMatch[1].replace('_', '.')}` : 'iOS';
  }

  return { deviceType, deviceName, browser, os };
}

// إعداد Socket.IO للاتصال المباشر
io.on('connection', (socket) => {
  // إنشاء معلومات المستخدم الجديد
  const userName = generateUserName();
  const userAgent = socket.handshake.headers['user-agent'];
  const deviceInfo = parseUserAgent(userAgent);

  const userInfo = {
    id: socket.id,
    name: userName,
    joinTime: new Date().toISOString(),
    ip: socket.handshake.address,
    userAgent: userAgent,
    deviceType: deviceInfo.deviceType,
    deviceName: deviceInfo.deviceName,
    browser: deviceInfo.browser,
    os: deviceInfo.os
  };

  // إضافة المستخدم إلى القائمة
  connectedUsersList.set(socket.id, userInfo);
  connectedUsers++;

  // معالجة طلب استخدام اسم محفوظ
  socket.on('request-saved-username', (data) => {
    const { savedUsername } = data;

    if (!savedUsername || typeof savedUsername !== 'string') {
      return;
    }

    const trimmedUsername = savedUsername.trim();

    // التحقق من صحة الاسم المحفوظ
    if (trimmedUsername.length >= 2 && trimmedUsername.length <= 30) {
      const allowedPattern = /^[\u0600-\u06FFa-zA-Z0-9\s\-_\.]+$/;
      if (allowedPattern.test(trimmedUsername)) {
        // التحقق من عدم تكرار الاسم
        const existingUser = Array.from(connectedUsersList.values()).find(
          user => user.name === trimmedUsername && user.id !== socket.id
        );

        if (!existingUser) {
          // تحديث اسم المستخدم
          const oldUsername = userInfo.name;
          userInfo.name = trimmedUsername;
          connectedUsersList.set(socket.id, userInfo);

          // إرسال معلومات المستخدم المحدثة
          socket.emit('user-info', userInfo);

          // إرسال تحديث قائمة المستخدمين لجميع المتصلين
          const userNames = getConnectedUserNames();
          const usersDetails = getConnectedUsersDetails();
          io.emit('connected-users-update', {
            count: connectedUsers,
            userNames: userNames,
            usersDetails: usersDetails
          });

          console.log(`تم استخدام الاسم المحفوظ: "${trimmedUsername}" بدلاً من "${oldUsername}"`);
        }
      }
    }
  });

  console.log(`مستخدم جديد متصل: ${userName} - العدد الحالي: ${connectedUsers}`);

  // إرسال قائمة الملفات العامة للمستخدم الجديد
  const publicFiles = sharedFiles.filter(file => !file.isPrivate);
  socket.emit('all-files', publicFiles);

  // إرسال قائمة الملفات الخاصة للمستخدم الجديد
  const privateFiles = sharedFiles.filter(file =>
    file.isPrivate && (
      file.recipientName === userInfo.name ||
      file.senderName === userInfo.name
    )
  );
  socket.emit('all-private-files', privateFiles);

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

  // معالجة تحديث اسم المستخدم
  socket.on('update-username', (data) => {
    const { newUsername } = data;
    const userInfo = connectedUsersList.get(socket.id);

    if (!userInfo) {
      socket.emit('username-update-error', {
        error: 'معلومات المستخدم غير متوفرة'
      });
      return;
    }

    // التحقق من صحة اسم المستخدم
    if (!newUsername || typeof newUsername !== 'string') {
      socket.emit('username-update-error', {
        error: 'اسم المستخدم غير صحيح'
      });
      return;
    }

    const trimmedUsername = newUsername.trim();

    // التحقق من الطول
    if (trimmedUsername.length < 2 || trimmedUsername.length > 30) {
      socket.emit('username-update-error', {
        error: 'اسم المستخدم يجب أن يكون بين 2 و 30 حرف'
      });
      return;
    }

    // التحقق من الأحرف المسموحة
    const allowedPattern = /^[\u0600-\u06FFa-zA-Z0-9\s\-_\.]+$/;
    if (!allowedPattern.test(trimmedUsername)) {
      socket.emit('username-update-error', {
        error: 'اسم المستخدم يحتوي على أحرف غير مسموحة'
      });
      return;
    }

    // التحقق من عدم تكرار الاسم
    const existingUser = Array.from(connectedUsersList.values()).find(
      user => user.name === trimmedUsername && user.id !== socket.id
    );

    if (existingUser) {
      socket.emit('username-update-error', {
        error: 'اسم المستخدم مستخدم بالفعل'
      });
      return;
    }

    // حفظ الاسم القديم للإشعارات
    const oldUsername = userInfo.name;

    // تحديث اسم المستخدم
    userInfo.name = trimmedUsername;
    connectedUsersList.set(socket.id, userInfo);

    // إرسال تأكيد التحديث للمستخدم
    socket.emit('username-updated', {
      oldUsername,
      newUsername: trimmedUsername
    });

    // إرسال معلومات المستخدم المحدثة
    socket.emit('user-info', userInfo);

    // إرسال تحديث قائمة المستخدمين لجميع المتصلين
    const userNames = getConnectedUserNames();
    const usersDetails = getConnectedUsersDetails();
    io.emit('connected-users-update', {
      count: connectedUsers,
      userNames: userNames,
      usersDetails: usersDetails
    });

    // إشعار المستخدمين الآخرين بتغيير الاسم
    socket.broadcast.emit('user-name-changed', {
      oldName: oldUsername,
      newName: trimmedUsername
    });

    console.log(`تم تحديث اسم المستخدم من "${oldUsername}" إلى "${trimmedUsername}"`);
  });

  // معالجة إرسال ملف من العميل
  socket.on('send-file-to-user', (data) => {
    const { targetUserName, fileData, fileName, fileSize, fileType } = data;
    const senderInfo = connectedUsersList.get(socket.id);

    if (!senderInfo) {
      socket.emit('file-sent-error', {
        fileName,
        recipientName: targetUserName,
        error: 'معلومات المرسل غير متوفرة'
      });
      return;
    }

    // البحث عن المستخدم المستهدف
    const targetUserInfo = Array.from(connectedUsersList.values()).find(user => user.name === targetUserName);
    if (!targetUserInfo) {
      socket.emit('file-sent-error', {
        fileName,
        recipientName: targetUserName,
        error: 'المستخدم غير متصل'
      });
      return;
    }

    // إرسال الملف للمستخدم المستهدف
    const targetSocket = io.sockets.sockets.get(targetUserInfo.id);
    if (targetSocket) {
      targetSocket.emit('file-received', {
        fileName,
        senderName: senderInfo.name,
        fileData,
        fileSize,
        fileType
      });

      // تأكيد الإرسال للمرسل
      socket.emit('file-sent-success', {
        fileName,
        recipientName: targetUserName
      });
    } else {
      socket.emit('file-sent-error', {
        fileName,
        recipientName: targetUserName,
        error: 'فشل في الاتصال بالمستخدم'
      });
    }
  });

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