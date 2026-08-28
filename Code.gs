/*************************************************************
 * 우리반 학생 개별 상담 관리 시스템 - 서버 코드 (Code.gs)
 *
 *  [구조]
 *   GitHub Pages(index.html)  ──요청──▶  이 스크립트  ──▶  구글 시트
 *                             ◀─응답───
 *
 *  - 비밀번호 검사, 시트 조회는 전부 이 파일(서버)에서 이루어집니다.
 *  - 시트 주소·비밀번호는 절대 브라우저로 나가지 않습니다.
 *
 *  [처음 하실 일]
 *   1) 저장 후 상단 함수 목록에서 '초기설정' 선택 → 실행 → 권한 승인
 *   2) 배포 → 새 배포 → 웹 앱 → 실행: 나 / 액세스: 모든 사용자
 *   3) 나온 주소를 index.html 의 API_URL 에 붙여넣기
 *************************************************************/

/* ══════════════════════════════════════════════════════════
   1. 기본 설정
   ══════════════════════════════════════════════════════════ */

var SPREADSHEET_ID = '1SUzjzlI4KxJrpFMPbPeXTsZOPmH9MeniXDp7h04Zrz4';

var SHEET_COUNSEL = '상담내용';
var SHEET_GRADE   = '내신성적';
var SHEET_TARGET  = '학생 목표';                 // 희망 대학 · 희망 학과 시트
var SHEET_ACCOUNT = '계정';                      // 로그인 계정 시트 (자동 생성됩니다)

var TARGET_KEYWORDS = ['학생', '목표'];          // '학생목표', '1학년 학생 목표' 등도 인식

// 로그인 유지 시간 (시간 단위). 이 시간이 지나면 다시 비밀번호를 입력해야 합니다.
var TOKEN_HOURS = 12;

// 학년 표기와 사용할 반 목록
var GRADE_LABEL = '1학년';
var CLASS_LIST  = [1, 2, 3, 4, 5, 6, 7];

// 자동 인식이 실패했을 때 사용할 기본 열 위치 (0부터 셈)
// A=반, B=번호, C=이름, D=희망 대학, E=희망 학과
var TARGET_MAP_FALLBACK = { c: 0, n: 1, nm: 2, uni: 3, major: 4 };

// 모의고사 시트 설정 (시트가 없으면 자동으로 건너뜁니다)
var MOCK_SHEETS = [
  { key: 'm3',  name: '모의고사_3월',  keywords: ['3월',  '모의'] },
  { key: 'm6',  name: '모의고사_6월',  keywords: ['6월',  '모의'] },
  { key: 'm9',  name: '모의고사_9월',  keywords: ['9월',  '모의'] },
  { key: 'm10', name: '모의고사_10월', keywords: ['10월', '모의'] }
];

var MOCK_SUBJECTS = ['국어', '수학', '영어', '통합사회', '통합과학', '한국사'];

var MOCK_MAP_FALLBACK = {
  '국어':     { s: 3,  g: 6  },
  '수학':     { s: 7,  g: 10 },
  '영어':     { s: 11, g: 12 },
  '통합사회': { s: 13, g: 16 },
  '통합과학': { s: 17, g: 20 },
  '한국사':   { s: 21, g: 22 }
};

var SUBJECTS = [
  { name: '공통국어1', start: 3   },
  { name: '공통국어2', start: 14  },
  { name: '공통수학1', start: 25  },
  { name: '공통수학2', start: 36  },
  { name: '공통영어1', start: 47  },
  { name: '공통영어2', start: 58  },
  { name: '통합사회1', start: 69  },
  { name: '통합사회2', start: 80  },
  { name: '통합과학1', start: 91  },
  { name: '통합과학2', start: 102 },
  { name: '한국사1',   start: 113 },
  { name: '한국사2',   start: 124 }
];

// 계정 시트 열 위치 (0부터 셈)
var ACC = {
  name:    0,   // A 이름
  grade:   1,   // B 학년
  cls:     2,   // C 반
  role:    3,   // D 역할 (담임 / 관리자)
  status:  4,   // E 상태 (대기 / 승인 / 정지)
  hash:    5,   // F 비밀번호(암호화)
  applied: 6,   // G 신청일시
  ok:      7,   // H 승인일시
  last:    8,   // I 최근 접속
  memo:    9    // J 메모
};

var ACC_HEADERS = ['이름', '학년', '반', '역할', '상태', '비밀번호(암호화)',
                   '신청일시', '승인일시', '최근 접속', '메모'];


/* ══════════════════════════════════════════════════════════
   2. 웹 요청 처리 (GitHub Pages 화면이 여기로 연락합니다)
   ══════════════════════════════════════════════════════════ */

function doPost(e) {
  var req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut_({ ok: false, error: '요청 형식이 올바르지 않습니다.' });
  }
  return jsonOut_(handle_(req));
}

/**
 * 브라우저 보안(CORS) 문제로 POST가 막히는 환경을 위한 예비 통로입니다.
 * 주소창에 그냥 접속하면 서버가 살아 있는지만 알려줍니다.
 */
function doGet(e) {
  var p = (e && e.parameter) || {};

  if (!p.action) {
    return jsonOut_({ ok: true, data: { message: '상담 시스템 서버가 정상 작동 중입니다.' } });
  }

  var req = {};
  if (p.payload) {
    try { req = JSON.parse(p.payload); } catch (err) { req = {}; }
  }
  req.action = p.action;

  var result = handle_(req);

  // JSONP (callback 이 있으면 함수 호출 형태로 감싸서 돌려줍니다)
  if (p.callback) {
    return ContentService
        .createTextOutput(p.callback + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return jsonOut_(result);
}

function jsonOut_(obj) {
  return ContentService
      .createTextOutput(JSON.stringify(obj))
      .setMimeType(ContentService.MimeType.JSON);
}

function ok_(data)    { return { ok: true,  data: data }; }
function err_(msg)    { return { ok: false, error: msg }; }
function needLogin_() { return { ok: false, error: '로그인이 필요합니다.', needLogin: true }; }


/** 요청 종류에 따라 알맞은 처리를 연결합니다. */
function handle_(req) {
  var action = String((req && req.action) || '');

  try {
    switch (action) {

      /* 로그인 없이 가능한 요청 */
      case 'ping':
        return ok_({ message: 'ok', classList: CLASS_LIST, gradeLabel: GRADE_LABEL });

      case 'login':
        return apiLogin_(req);

      case 'requestAccount':
        return apiRequestAccount_(req);

      /* 아래는 모두 로그인(토큰)이 필요한 요청 */
      case 'me':
      case 'getStudents':
      case 'saveCounseling':
      case 'saveTarget':
      case 'logout':
        var user = verifyToken_(req.token);
        if (!user) return needLogin_();

        if (action === 'me')            return ok_(publicUser_(user));
        if (action === 'getStudents')   return apiGetStudents_(req, user);
        if (action === 'saveCounseling')return apiSaveCounseling_(req, user);
        if (action === 'saveTarget')    return apiSaveTarget_(req, user);
        if (action === 'logout')        { dropToken_(req.token); return ok_({ message: '로그아웃되었습니다.' }); }
        break;

      default:
        return err_('알 수 없는 요청입니다: ' + action);
    }
  } catch (e2) {
    return err_('서버 오류: ' + e2.toString());
  }
  return err_('처리하지 못했습니다.');
}


/* ══════════════════════════════════════════════════════════
   3. 비밀번호 · 로그인 처리
   ══════════════════════════════════════════════════════════ */

/** 비밀번호를 안전하게 섞기 위한 고유값. 처음 한 번 자동 생성됩니다. */
function getSalt_() {
  var props = PropertiesService.getScriptProperties();
  var salt = props.getProperty('PW_SALT');
  if (!salt) {
    salt = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('PW_SALT', salt);
  }
  return salt;
}

/** 비밀번호를 되돌릴 수 없는 형태로 바꿉니다. 시트에는 이 값만 저장됩니다. */
function hashPw_(plain) {
  var raw = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      getSalt_() + '::' + String(plain),
      Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    return ('0' + (b & 0xFF).toString(16)).slice(-2);
  }).join('');
}

/** 헷갈리는 글자(0 O 1 l I)를 뺀 8자리 비밀번호를 만듭니다. */
function makePassword_() {
  var chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var out = '';
  for (var i = 0; i < 8; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

function nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy.MM.dd HH:mm');
}


/* ── 접속증(토큰) 관리 ──────────────────────────────── */

function issueToken_(user) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var data = {
    name: user.name,
    cls:  user.cls,
    role: user.role,
    exp:  Date.now() + TOKEN_HOURS * 60 * 60 * 1000
  };
  PropertiesService.getScriptProperties().setProperty('TK_' + token, JSON.stringify(data));
  return token;
}

function verifyToken_(token) {
  if (!token) return null;
  var key = 'TK_' + String(token);
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(key);
  if (!raw) return null;

  var data;
  try { data = JSON.parse(raw); } catch (e) { props.deleteProperty(key); return null; }

  if (!data.exp || Date.now() > data.exp) {
    props.deleteProperty(key);
    return null;
  }
  return data;
}

function dropToken_(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('TK_' + String(token));
}

/** 만료된 접속증을 정리합니다. (로그인할 때마다 가볍게 실행) */
function cleanTokens_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('TK_') !== 0) return;
    try {
      var d = JSON.parse(all[k]);
      if (!d.exp || now > d.exp) props.deleteProperty(k);
    } catch (e) {
      props.deleteProperty(k);
    }
  });
}

function publicUser_(user) {
  return {
    name: user.name,
    classNum: user.cls,
    role: user.role,
    gradeLabel: GRADE_LABEL,
    classList: CLASS_LIST
  };
}


/* ── 로그인 ────────────────────────────────────────── */

function apiLogin_(req) {
  var pw = String((req && req.password) || '').trim();
  if (!pw) return err_('비밀번호를 입력해 주세요.');

  var ss = getSpreadsheet_();
  var sheet = ensureAccountSheet_(ss);
  var data = sheet.getDataRange().getValues();
  var target = hashPw_(pw);

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (String(row[ACC.hash] || '') !== target) continue;

    var status = String(row[ACC.status] || '').trim();
    if (status === '정지') return err_('사용이 중지된 계정입니다. 관리자에게 문의해 주세요.');
    if (status !== '승인') return err_('아직 승인되지 않은 계정입니다.');

    var user = {
      name: String(row[ACC.name] || '선생님').trim(),
      cls:  toInt_(row[ACC.cls]),
      role: String(row[ACC.role] || '담임').trim()
    };
    if (isNaN(user.cls)) user.cls = CLASS_LIST[0];

    sheet.getRange(i + 1, ACC.last + 1).setValue(nowStr_());
    cleanTokens_();

    var token = issueToken_(user);
    var out = publicUser_(user);
    out.token = token;
    return ok_(out);
  }

  Utilities.sleep(600);   // 무작위 대입 시도를 늦춥니다.
  return err_('비밀번호가 올바르지 않습니다.');
}


/* ── 계정 신청 ─────────────────────────────────────── */

function apiRequestAccount_(req) {
  var name  = String((req && req.name)  || '').trim();
  var cls   = toInt_(req && req.classNum);
  var memo  = String((req && req.memo)  || '').trim();

  if (!name) return err_('이름을 입력해 주세요.');
  if (isNaN(cls)) return err_('담당 반을 선택해 주세요.');

  var ss = getSpreadsheet_();
  var sheet = ensureAccountSheet_(ss);
  var data = sheet.getDataRange().getValues();

  // 같은 이름·반으로 이미 대기 중이면 중복 신청을 막습니다.
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ACC.name] || '').trim() === name &&
        toInt_(data[i][ACC.cls]) === cls) {
      var st = String(data[i][ACC.status] || '').trim();
      if (st === '대기')  return err_('이미 신청하셨습니다. 관리자 승인을 기다려 주세요.');
      if (st === '승인')  return err_('이미 발급된 계정이 있습니다. 관리자에게 문의해 주세요.');
    }
  }

  var newRow = [];
  for (var k = 0; k < ACC_HEADERS.length; k++) newRow.push('');
  newRow[ACC.name]    = name;
  newRow[ACC.grade]   = GRADE_LABEL;
  newRow[ACC.cls]     = cls;
  newRow[ACC.role]    = '담임';
  newRow[ACC.status]  = '대기';
  newRow[ACC.applied] = nowStr_();
  newRow[ACC.memo]    = memo;

  sheet.appendRow(newRow);

  return ok_({ message: '신청이 접수되었습니다. 관리자 승인 후 비밀번호가 발급됩니다.' });
}


/* ══════════════════════════════════════════════════════════
   4. 데이터 요청 처리 (로그인한 사람만)
   ══════════════════════════════════════════════════════════ */

function apiGetStudents_(req, user) {
  var cls = toInt_(req.classNum);
  if (isNaN(cls)) cls = user.cls;
  return ok_({ classNum: cls, students: getStudentsByClass(cls) });
}

function apiSaveCounseling_(req, user) {
  var res = saveCounseling(req.classNum, req.studentNum, req.studentName,
                           req.text, req.timeStr || nowStr_());
  if (!res.success) return err_(res.error || '저장하지 못했습니다.');
  return ok_(res);
}

function apiSaveTarget_(req, user) {
  var res = saveStudentTarget(req.classNum, req.studentNum, req.studentName,
                              req.targetUni, req.targetMajor);
  if (!res.success) return err_(res.error || '저장하지 못했습니다.');
  return ok_(res);
}


/* ══════════════════════════════════════════════════════════
   5. 관리자 메뉴 (구글 시트 상단에 나타납니다)
   ══════════════════════════════════════════════════════════ */

function onOpen() {
  try {
    SpreadsheetApp.getUi()
        .createMenu('🔐 상담시스템 관리')
        .addItem('① 처음 설정하기 (관리자 계정 만들기)', 'menuInit')
        .addSeparator()
        .addItem('② 선택한 줄 승인하기', 'menuApproveSelected')
        .addItem('③ 대기 중인 신청 모두 승인하기', 'menuApproveAllPending')
        .addSeparator()
        .addItem('④ 선택한 줄 비밀번호 재발급', 'menuResetSelected')
        .addItem('⑤ 선택한 줄 사용 정지 / 해제', 'menuToggleSelected')
        .addSeparator()
        .addItem('⑥ 시트 연결 상태 점검', 'menuCheckSetup')
        .addToUi();
  } catch (e) { /* 메뉴를 못 만들어도 무시 */ }
}

function menuInit() {
  var r = initSystem_();
  showMsg_('처음 설정 완료', r);
}

/**
 * 스크립트 편집기에서 직접 실행할 때 쓰는 함수입니다.
 * 실행 후 '실행 기록(로그)'에 관리자 비밀번호가 표시됩니다.
 */
function 초기설정() {
  Logger.log(initSystem_().replace(/<[^>]+>/g, ''));
}

function initSystem_() {
  var ss = getSpreadsheet_();
  if (!ss) return '❌ 스프레드시트를 열 수 없습니다. SPREADSHEET_ID를 확인해 주세요.';

  var sheet = ensureAccountSheet_(ss);
  getSalt_();

  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ACC.role] || '').trim() === '관리자' &&
        String(data[i][ACC.status] || '').trim() === '승인') {
      return '이미 관리자 계정이 있습니다.<br><br>' +
             '비밀번호를 잊으셨다면 관리자 줄을 선택한 뒤<br>' +
             "메뉴에서 <b>'④ 선택한 줄 비밀번호 재발급'</b>을 눌러 주세요.";
    }
  }

  var pw = makePassword_();
  var newRow = [];
  for (var k = 0; k < ACC_HEADERS.length; k++) newRow.push('');
  newRow[ACC.name]    = '관리자';
  newRow[ACC.grade]   = GRADE_LABEL;
  newRow[ACC.cls]     = CLASS_LIST[0];
  newRow[ACC.role]    = '관리자';
  newRow[ACC.status]  = '승인';
  newRow[ACC.hash]    = hashPw_(pw);
  newRow[ACC.applied] = nowStr_();
  newRow[ACC.ok]      = nowStr_();
  newRow[ACC.memo]    = '최초 관리자';
  sheet.appendRow(newRow);

  return "'계정' 시트를 만들고 관리자 계정을 발급했습니다.<br><br>" +
         '<div style="font-size:22px;font-weight:800;letter-spacing:2px;' +
         'background:#eff6ff;border:2px solid #3b82f6;border-radius:10px;' +
         'padding:14px;text-align:center;margin:10px 0">' + pw + '</div>' +
         '⚠️ 이 비밀번호는 <b>지금만</b> 볼 수 있습니다. 반드시 메모해 두세요.';
}

function menuApproveSelected() {
  var ss = getSpreadsheet_();
  var sheet = ensureAccountSheet_(ss);
  var ui = SpreadsheetApp.getUi();

  if (SpreadsheetApp.getActiveSheet().getName() !== sheet.getName()) {
    ui.alert("'" + SHEET_ACCOUNT + "' 시트에서 승인할 줄을 클릭한 뒤 다시 눌러 주세요.");
    return;
  }

  var row = SpreadsheetApp.getActiveRange().getRow();
  if (row < 2) { ui.alert('머리글이 아닌, 승인할 사람의 줄을 클릭해 주세요.'); return; }

  var name = String(sheet.getRange(row, ACC.name + 1).getValue() || '').trim();
  if (!name) { ui.alert('빈 줄입니다. 이름이 있는 줄을 클릭해 주세요.'); return; }

  var pw = approveRow_(sheet, row);
  showMsg_('승인 완료',
      '<b>' + name + '</b> 선생님의 비밀번호가 발급되었습니다.<br><br>' +
      '<div style="font-size:22px;font-weight:800;letter-spacing:2px;' +
      'background:#eff6ff;border:2px solid #3b82f6;border-radius:10px;' +
      'padding:14px;text-align:center;margin:10px 0">' + pw + '</div>' +
      '⚠️ 이 비밀번호는 <b>지금만</b> 볼 수 있습니다.<br>본인에게 직접 전달해 주세요.');
}

function menuApproveAllPending() {
  var ss = getSpreadsheet_();
  var sheet = ensureAccountSheet_(ss);
  var data = sheet.getDataRange().getValues();

  var results = [];
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][ACC.status] || '').trim() !== '대기') continue;
    var pw = approveRow_(sheet, i + 1);
    results.push({
      name: String(data[i][ACC.name] || '').trim(),
      cls:  data[i][ACC.cls],
      pw:   pw
    });
  }

  if (!results.length) { showMsg_('승인할 신청 없음', '대기 중인 신청이 없습니다.'); return; }

  var html = '<table style="width:100%;border-collapse:collapse;font-size:14px">' +
             '<tr style="background:#f1f5f9"><th style="padding:6px;border:1px solid #cbd5e1">이름</th>' +
             '<th style="padding:6px;border:1px solid #cbd5e1">반</th>' +
             '<th style="padding:6px;border:1px solid #cbd5e1">비밀번호</th></tr>';
  results.forEach(function (r) {
    html += '<tr><td style="padding:6px;border:1px solid #cbd5e1">' + r.name + '</td>' +
            '<td style="padding:6px;border:1px solid #cbd5e1;text-align:center">' + r.cls + '반</td>' +
            '<td style="padding:6px;border:1px solid #cbd5e1;text-align:center;' +
            'font-weight:800;letter-spacing:1px">' + r.pw + '</td></tr>';
  });
  html += '</table><br>⚠️ 이 비밀번호들은 <b>지금만</b> 볼 수 있습니다. 메모 후 각자에게 전달해 주세요.';

  showMsg_(results.length + '명 승인 완료', html);
}

function approveRow_(sheet, row) {
  var pw = makePassword_();
  sheet.getRange(row, ACC.hash + 1).setValue(hashPw_(pw));
  sheet.getRange(row, ACC.status + 1).setValue('승인');
  sheet.getRange(row, ACC.ok + 1).setValue(nowStr_());
  if (!String(sheet.getRange(row, ACC.role + 1).getValue() || '').trim()) {
    sheet.getRange(row, ACC.role + 1).setValue('담임');
  }
  if (!String(sheet.getRange(row, ACC.grade + 1).getValue() || '').trim()) {
    sheet.getRange(row, ACC.grade + 1).setValue(GRADE_LABEL);
  }
  return pw;
}

function menuResetSelected() {
  var sheet = ensureAccountSheet_(getSpreadsheet_());
  var ui = SpreadsheetApp.getUi();

  if (SpreadsheetApp.getActiveSheet().getName() !== sheet.getName()) {
    ui.alert("'" + SHEET_ACCOUNT + "' 시트에서 해당 줄을 클릭한 뒤 다시 눌러 주세요.");
    return;
  }
  var row = SpreadsheetApp.getActiveRange().getRow();
  if (row < 2) { ui.alert('비밀번호를 새로 만들 사람의 줄을 클릭해 주세요.'); return; }

  var name = String(sheet.getRange(row, ACC.name + 1).getValue() || '').trim();
  if (!name) { ui.alert('빈 줄입니다.'); return; }

  var pw = approveRow_(sheet, row);
  showMsg_('비밀번호 재발급',
      '<b>' + name + '</b> 선생님의 새 비밀번호입니다.<br>' +
      '<span style="color:#b91c1c">이전 비밀번호는 더 이상 쓸 수 없습니다.</span><br><br>' +
      '<div style="font-size:22px;font-weight:800;letter-spacing:2px;' +
      'background:#eff6ff;border:2px solid #3b82f6;border-radius:10px;' +
      'padding:14px;text-align:center;margin:10px 0">' + pw + '</div>');
}

function menuToggleSelected() {
  var sheet = ensureAccountSheet_(getSpreadsheet_());
  var ui = SpreadsheetApp.getUi();

  if (SpreadsheetApp.getActiveSheet().getName() !== sheet.getName()) {
    ui.alert("'" + SHEET_ACCOUNT + "' 시트에서 해당 줄을 클릭한 뒤 다시 눌러 주세요.");
    return;
  }
  var row = SpreadsheetApp.getActiveRange().getRow();
  if (row < 2) { ui.alert('대상이 되는 줄을 클릭해 주세요.'); return; }

  var name = String(sheet.getRange(row, ACC.name + 1).getValue() || '').trim();
  var cur = String(sheet.getRange(row, ACC.status + 1).getValue() || '').trim();
  var next = (cur === '정지') ? '승인' : '정지';

  sheet.getRange(row, ACC.status + 1).setValue(next);
  ui.alert(name + ' 선생님의 상태를 [' + next + ']로 바꿨습니다.');
}

function menuCheckSetup() {
  var ss = getSpreadsheet_();
  if (!ss) { showMsg_('점검 결과', '❌ 스프레드시트를 열 수 없습니다.'); return; }

  var lines = ['<b>스프레드시트:</b> ' + ss.getName(), '<br><b>필요한 시트</b><br>'];
  var need = [
    { n: SHEET_ACCOUNT, k: ['계정'] },
    { n: SHEET_COUNSEL, k: ['상담'] },
    { n: SHEET_GRADE,   k: ['내신'] },
    { n: SHEET_TARGET,  k: TARGET_KEYWORDS }
  ].concat(MOCK_SHEETS.map(function (m) { return { n: m.name, k: m.keywords }; }));

  need.forEach(function (it) {
    var f = findSheet_(ss, it.n, it.k);
    lines.push((f ? '✅ ' : '❌ ') + it.n + (f ? ' → [' + f.getName() + ']' : ' → 없음') + '<br>');
  });

  lines.push('<br><b>반별 학생 수</b><br>');
  CLASS_LIST.forEach(function (c) {
    lines.push(c + '반: ' + getStudentsByClass(c).length + '명<br>');
  });

  showMsg_('점검 결과', lines.join(''));
}

function showMsg_(title, html) {
  try {
    var out = HtmlService.createHtmlOutput(
        '<div style="font-family:Pretendard,Malgun Gothic,sans-serif;font-size:14px;' +
        'line-height:1.7;padding:6px">' + html + '</div>')
        .setWidth(430).setHeight(340);
    SpreadsheetApp.getUi().showModalDialog(out, title);
  } catch (e) {
    Logger.log(title + '\n' + String(html).replace(/<[^>]+>/g, ''));
  }
}

/** '계정' 시트가 없으면 만들어 줍니다. */
function ensureAccountSheet_(ss) {
  if (!ss) throw new Error('스프레드시트를 열 수 없습니다.');

  var sheet = ss.getSheetByName(SHEET_ACCOUNT);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_ACCOUNT);
    sheet.getRange(1, 1, 1, ACC_HEADERS.length).setValues([ACC_HEADERS]);
    sheet.getRange(1, 1, 1, ACC_HEADERS.length)
         .setFontWeight('bold').setBackground('#e2e8f0');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(ACC.hash + 1, 90);
    sheet.getRange(1, ACC.hash + 1).setNote(
        '비밀번호를 되돌릴 수 없게 바꾼 값입니다. 사람이 읽을 수 없으며, 직접 수정하지 마세요.');
  }
  return sheet;
}


/* ══════════════════════════════════════════════════════════
   6. 데이터 조회 (기존 로직 그대로)
   ══════════════════════════════════════════════════════════ */

function getSpreadsheet_() {
  var ss = null;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    ss = null;
  }
  if (!ss && SPREADSHEET_ID) {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return ss;
}

function normalize_(s) {
  return String(s || '').replace(/\s+/g, '').toLowerCase();
}

function findSheet_(ss, wantedName, keywords) {
  if (!ss) return null;

  var sheet = ss.getSheetByName(wantedName);
  if (sheet) return sheet;

  var all = ss.getSheets();
  var target = normalize_(wantedName);

  for (var i = 0; i < all.length; i++) {
    if (normalize_(all[i].getName()) === target) return all[i];
  }

  if (keywords && keywords.length) {
    for (var j = 0; j < all.length; j++) {
      var n = normalize_(all[j].getName());
      var allMatch = true;
      for (var k = 0; k < keywords.length; k++) {
        if (n.indexOf(normalize_(keywords[k])) === -1) { allMatch = false; break; }
      }
      if (allMatch) return all[j];
    }
  }
  return null;
}

function cellText_(row, index) {
  if (index === undefined || index === null || index < 0) return '-';
  var v = row[index];
  if (v === undefined || v === null || String(v).trim() === '') return '-';
  return String(v).trim();
}

function cellPlain_(row, index) {
  var t = cellText_(row, index);
  return (t === '-') ? '' : t;
}

function toInt_(v) {
  if (v === undefined || v === null) return NaN;
  var n = parseInt(String(v).replace(/[^0-9\-]/g, ''), 10);
  return isNaN(n) ? NaN : n;
}


/* ── 학생 목표 시트 구조 자동 분석 ───────────────── */

function analyzeTargetSheet_(values) {
  var result = {
    startRow: 1,
    headerRow: 0,
    cols: {
      c: TARGET_MAP_FALLBACK.c,
      n: TARGET_MAP_FALLBACK.n,
      nm: TARGET_MAP_FALLBACK.nm,
      uni: TARGET_MAP_FALLBACK.uni,
      major: TARGET_MAP_FALLBACK.major
    },
    detected: false,
    labels: []
  };
  if (!values || !values.length) return result;

  var headerRow = -1;
  var limit = Math.min(values.length, 5);
  for (var r = 0; r < limit; r++) {
    var joined = values[r].map(function (c) { return String(c || ''); }).join('');
    if (/대학|학과|전공|학부/.test(joined)) { headerRow = r; break; }
  }
  if (headerRow === -1) return result;

  var labels = values[headerRow].map(function (c) { return normalize_(c); });
  result.labels = labels;
  result.headerRow = headerRow;
  result.startRow = headerRow + 1;

  var cols = { c: -1, n: -1, nm: -1, uni: -1, major: -1 };
  var uniPrefer = 99, majorPrefer = 99;

  for (var i = 0; i < labels.length; i++) {
    var lb = labels[i];
    if (!lb) continue;

    if (/학과|전공|학부/.test(lb)) {
      var mp = /희망|목표|지망|순위/.test(lb) ? 1 : 2;
      if (mp < majorPrefer) { cols.major = i; majorPrefer = mp; }
      continue;
    }
    if (/대학/.test(lb)) {
      var up = /희망|목표|지망|순위/.test(lb) ? 1 : 2;
      if (up < uniPrefer) { cols.uni = i; uniPrefer = up; }
      continue;
    }
    if (cols.c === -1 && (lb === '반' || lb.indexOf('학급') !== -1 || lb.indexOf('학반') !== -1)) {
      cols.c = i; continue;
    }
    if (cols.n === -1 && (lb === '번' || lb.indexOf('번호') !== -1)) {
      cols.n = i; continue;
    }
    if (cols.nm === -1 && (lb.indexOf('이름') !== -1 || lb.indexOf('성명') !== -1)) {
      cols.nm = i; continue;
    }
  }

  if (cols.c  === -1) cols.c  = TARGET_MAP_FALLBACK.c;
  if (cols.n  === -1) cols.n  = TARGET_MAP_FALLBACK.n;
  if (cols.nm === -1) cols.nm = TARGET_MAP_FALLBACK.nm;

  result.detected = (cols.uni !== -1 || cols.major !== -1);
  if (cols.uni   === -1) cols.uni   = TARGET_MAP_FALLBACK.uni;
  if (cols.major === -1) cols.major = TARGET_MAP_FALLBACK.major;

  result.cols = cols;
  return result;
}


/* ── 모의고사 시트 구조 자동 분석 ────────────────── */

function analyzeMockSheet_(values) {
  var result = { startRow: 1, cols: {}, detected: false, labels: [] };
  if (!values || values.length < 2) return result;

  var row1 = values[0];
  var row2 = values.length > 1 ? values[1] : [];

  var fill1 = [];
  var last = '';
  for (var i = 0; i < row1.length; i++) {
    var v = String(row1[i] || '').trim();
    if (v !== '') last = v;
    fill1[i] = last;
  }

  var row2IsHeader = false;
  if (row2.length) {
    var joined2 = row2.map(function (c) { return String(c || ''); }).join('');
    if (isNaN(toInt_(row2[0])) || /점수|등급|백분위/.test(joined2)) {
      row2IsHeader = /점수|등급|백분위/.test(joined2);
    }
  }

  var labels = [];
  var width = Math.max(row1.length, row2.length);
  for (var c = 0; c < width; c++) {
    var a = fill1[c] || '';
    var b = row2IsHeader ? String(row2[c] || '').trim() : '';
    labels[c] = normalize_(a + b);
  }
  result.labels = labels;
  result.startRow = row2IsHeader ? 2 : 1;

  var found = 0;
  MOCK_SUBJECTS.forEach(function (sub) {
    var key = normalize_(sub);
    var scoreCol = -1, gradeCol = -1, prefer = 99;

    for (var c2 = 0; c2 < labels.length; c2++) {
      var lb = labels[c2];
      if (!lb || lb.indexOf(key) === -1) continue;

      if (lb.indexOf('등급') !== -1) {
        if (gradeCol === -1) gradeCol = c2;
      } else if (lb.indexOf('백분위') !== -1) {
        // 백분위는 점수로 쓰지 않습니다.
      } else if (lb.indexOf('원점수') !== -1) {
        if (prefer > 1) { scoreCol = c2; prefer = 1; }
      } else if (lb.indexOf('표준점수') !== -1) {
        if (prefer > 2) { scoreCol = c2; prefer = 2; }
      } else if (lb.indexOf('점수') !== -1) {
        if (prefer > 3) { scoreCol = c2; prefer = 3; }
      }
    }

    if (scoreCol !== -1 || gradeCol !== -1) {
      result.cols[sub] = { s: scoreCol, g: gradeCol };
      found++;
    }
  });

  if (found >= 3) {
    result.detected = true;
    MOCK_SUBJECTS.forEach(function (sub) {
      if (!result.cols[sub]) result.cols[sub] = MOCK_MAP_FALLBACK[sub];
    });
  } else {
    result.cols = MOCK_MAP_FALLBACK;
  }
  return result;
}


/* ── 5등급 → 9등급 환산 ──────────────────────────────
   시트의 5등급은 그대로 두고, 화면에서만 9등급을 함께 계산합니다.

   방법 : 내신성적 시트에 있는 전교생 점수로 석차백분율을 다시 구한 뒤
          9등급제 기준(4·11·23·40·60·77·89·96%)을 적용합니다.
   기준 : 1차등급 → 1차시험 점수 / 2차등급 → 2차시험 점수
          최종등급 → 환산총점 (수행 포함)
   동점 : 석차백분율 = (석차 + (동석차 - 1) / 2) ÷ 인원수 × 100
          — 선생님 시트의 계산 방식과 동일합니다.
   ────────────────────────────────────────────────── */

var GRADE9_CUTS = [4, 11, 23, 40, 60, 77, 89, 96];   // 이 값 이하이면 해당 등급

function toNum_(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  var n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return (isNaN(n)) ? null : n;
}

function round_(n, digits) {
  var p = Math.pow(10, digits);
  return Math.round(n * p) / p;
}

function grade9From_(pct) {
  if (pct === null || pct === undefined) return null;
  for (var i = 0; i < GRADE9_CUTS.length; i++) {
    if (pct <= GRADE9_CUTS[i]) return i + 1;
  }
  return 9;
}

/** 점수 목록을 받아 '점수 → 석차백분율' 변환기를 만듭니다. */
function makeRanker_(values) {
  var n = values.length;
  if (!n) return null;

  var sorted = values.slice().sort(function (a, b) { return b - a; });   // 높은 점수부터
  var higher = {}, equal = {};

  for (var i = 0; i < sorted.length; i++) {
    var key = String(sorted[i]);
    if (equal[key] === undefined) { higher[key] = i; equal[key] = 0; }
    equal[key]++;
  }

  return function (v) {
    var k = String(v);
    if (equal[k] === undefined) return null;
    var rank = higher[k] + 1;
    return (rank + (equal[k] - 1) / 2) / n * 100;
  };
}

/** 과목별로 1차·2차·최종 석차백분율 변환기를 미리 만들어 둡니다. */
function buildGradeRanks_(gData) {
  var ranks = [];

  SUBJECTS.forEach(function (subj, si) {
    var i = subj.start;
    var v1 = [], v2 = [], vf = [];

    for (var r = 1; r < gData.length; r++) {
      var row = gData[r];
      if (isNaN(toInt_(row[0])) || isNaN(toInt_(row[1]))) continue;   // 반·번호 없는 줄 제외

      var s1  = toNum_(row[i + 0]);   // 1차시험
      var s2  = toNum_(row[i + 2]);   // 2차시험
      var e1  = toNum_(row[i + 4]);   // 1차수행
      var e2  = toNum_(row[i + 5]);   // 2차수행
      var tot = toNum_(row[i + 6]);   // 환산총점

      if (s1 !== null) v1.push(s1);
      if (s2 !== null) v2.push(s2);
      if (tot !== null && (s1 !== null || s2 !== null || e1 !== null || e2 !== null)) vf.push(tot);
    }

    ranks[si] = {
      first:  makeRanker_(v1),
      second: makeRanker_(v2),
      final:  makeRanker_(vf),
      n:      vf.length
    };
  });

  return ranks;
}


/* ── 학급별 학생 조회 ────────────────────────────── */

function getStudentsByClass(classNum) {
  var classInt = toInt_(classNum);
  if (isNaN(classInt)) return [];

  var ss = getSpreadsheet_();
  if (!ss) {
    Logger.log('스프레드시트를 열 수 없습니다.');
    return [];
  }

  var studentsMap = {};

  function ensureStudent(sNum, sName) {
    if (!studentsMap[sNum]) {
      studentsMap[sNum] = {
        classNum: classInt,
        number: sNum,
        name: sName || (sNum + '번 학생'),
        targetUni: '',
        targetMajor: '',
        lastCounselingDate: '상담 기록 없음',
        counselingHistory: [],
        schoolGrades: [],
        summary: null,
        mockExams: { m3: [], m6: [], m9: [], m10: [] }
      };
    }
    if (sName) studentsMap[sNum].name = sName;
    return studentsMap[sNum];
  }

  try {
    // 1. 학생 목표 (희망 대학 · 희망 학과)
    var targetSheet = findSheet_(ss, SHEET_TARGET, TARGET_KEYWORDS);
    if (targetSheet) {
      var tData = targetSheet.getDataRange().getValues();
      var tInfo = analyzeTargetSheet_(tData);

      for (var t = tInfo.startRow; t < tData.length; t++) {
        var tRow = tData[t];
        var tClass = toInt_(tRow[tInfo.cols.c]);
        var tNum   = toInt_(tRow[tInfo.cols.n]);
        if (tClass !== classInt || isNaN(tNum) || !tNum) continue;

        var stu0 = ensureStudent(tNum, String(tRow[tInfo.cols.nm] || '').trim());
        stu0.targetUni   = cellPlain_(tRow, tInfo.cols.uni);
        stu0.targetMajor = cellPlain_(tRow, tInfo.cols.major);
      }
    }

    // 2. 내신 성적
    var gradeSheet = findSheet_(ss, SHEET_GRADE, ['내신']);
    if (gradeSheet) {
      var gData = gradeSheet.getDataRange().getValues();
      var ranks = buildGradeRanks_(gData);          // 전교생 기준 석차백분율 변환기

      for (var r = 1; r < gData.length; r++) {
        var gRow = gData[r];
        var gClass = toInt_(gRow[0]);
        var gNum = toInt_(gRow[1]);
        if (gClass !== classInt || isNaN(gNum) || !gNum) continue;

        var stu = ensureStudent(gNum, String(gRow[2] || '').trim());
        stu.schoolGrades = [];

        // 평균 계산용 누적값
        var acc = { n5: 0, s5: 0, n9: 0, s9: 0, nSc: 0, sSc: 0, nP: 0, sP: 0 };

        SUBJECTS.forEach(function (subj, si) {
          var i = subj.start;
          var rk = ranks[si] || {};

          var exam1  = cellPlain_(gRow, i + 0);   // 1차시험
          var grade1 = cellPlain_(gRow, i + 1);   // 1차등급
          var exam2  = cellPlain_(gRow, i + 2);   // 2차시험
          var grade2 = cellPlain_(gRow, i + 3);   // 2차등급
          var eval1  = cellPlain_(gRow, i + 4);   // 1차수행
          var eval2  = cellPlain_(gRow, i + 5);   // 2차수행
          var total  = cellPlain_(gRow, i + 6);   // 환산총점
          var fGrade = cellPlain_(gRow, i + 7);   // 최종등급
          var ach1   = cellPlain_(gRow, i + 8);   // 1차성취도
          var ach2   = cellPlain_(gRow, i + 9);   // 2차성취도
          var fAch   = cellPlain_(gRow, i + 10);  // 최종성취도

          var has1 = (exam1 !== '' || eval1 !== '');
          var has2 = (exam2 !== '' || eval2 !== '');
          var hasAny = has1 || has2;

          // ── 9등급 환산 ──
          var n1 = toNum_(gRow[i + 0]);
          var n2 = toNum_(gRow[i + 2]);
          var nt = toNum_(gRow[i + 6]);

          var pct1 = (has1   && n1 !== null && rk.first)  ? rk.first(n1)  : null;
          var pct2 = (has2   && n2 !== null && rk.second) ? rk.second(n2) : null;
          var pctF = (hasAny && nt !== null && rk.final)  ? rk.final(nt)  : null;

          var g1nine = grade9From_(pct1);
          var g2nine = grade9From_(pct2);
          var gFnine = grade9From_(pctF);

          // ── 평균 누적 ──
          if (hasAny) {
            var g5 = toNum_(fGrade);
            if (g5 !== null) { acc.s5 += g5; acc.n5++; }
            if (gFnine !== null) { acc.s9 += gFnine; acc.n9++; }
            if (nt !== null) { acc.sSc += nt; acc.nSc++; }
            if (pctF !== null) { acc.sP += pctF; acc.nP++; }
          }

          stu.schoolGrades.push({
            subject: subj.name,
            exam1:  has1 ? exam1  : '',
            grade1: has1 ? grade1 : '',
            eval1:  has1 ? eval1  : '',
            achievement1: has1 ? ach1 : '',
            exam2:  has2 ? exam2  : '',
            grade2: has2 ? grade2 : '',
            eval2:  has2 ? eval2  : '',
            achievement2: has2 ? ach2 : '',
            totalScore:       hasAny ? total  : '',
            finalGrade:       hasAny ? fGrade : '',
            finalAchievement: hasAny ? fAch   : '',
            hasData: hasAny,

            // 9등급제 환산 결과
            grade1_9:    (g1nine === null) ? '' : String(g1nine),
            grade2_9:    (g2nine === null) ? '' : String(g2nine),
            finalGrade9: (gFnine === null) ? '' : String(gFnine),
            pct1:      (pct1 === null) ? '' : round_(pct1, 1),
            pct2:      (pct2 === null) ? '' : round_(pct2, 1),
            pctFinal:  (pctF === null) ? '' : round_(pctF, 1)
          });
        });

        stu.summary = {
          subjectCount: acc.n5 || acc.n9,
          avg5:     acc.n5  ? round_(acc.s5  / acc.n5,  2) : null,
          avg9:     acc.n9  ? round_(acc.s9  / acc.n9,  2) : null,
          avgScore: acc.nSc ? round_(acc.sSc / acc.nSc, 1) : null,
          avgPct:   acc.nP  ? round_(acc.sP  / acc.nP,  1) : null
        };
      }
    }

    // 3. 모의고사 성적 (3·6·9·10월)
    MOCK_SHEETS.forEach(function (cfg) {
      var sheet = findSheet_(ss, cfg.name, cfg.keywords);
      if (!sheet) return;

      var mData = sheet.getDataRange().getValues();
      if (mData.length < 2) return;

      var info = analyzeMockSheet_(mData);

      for (var m = info.startRow; m < mData.length; m++) {
        var mRow = mData[m];
        var mClass = toInt_(mRow[0]);
        var mNum = toInt_(mRow[1]);
        if (mClass !== classInt || isNaN(mNum) || !mNum) continue;

        var stu2 = ensureStudent(mNum, String(mRow[2] || '').trim());
        stu2.mockExams[cfg.key] = MOCK_SUBJECTS.map(function (sub) {
          var col = info.cols[sub] || { s: -1, g: -1 };
          return {
            subject: sub,
            score: cellText_(mRow, col.s),
            grade: cellText_(mRow, col.g)
          };
        });
      }
    });

    // 4. 상담 기록
    var counselSheet = findSheet_(ss, SHEET_COUNSEL, ['상담']);
    if (counselSheet) {
      var cData = counselSheet.getDataRange().getValues();
      for (var i2 = 1; i2 < cData.length; i2++) {
        var cRow = cData[i2];
        var cClass = toInt_(cRow[0]);
        var cNum = toInt_(cRow[1]);
        if (cClass !== classInt || isNaN(cNum) || !cNum) continue;

        var stu3 = ensureStudent(cNum, String(cRow[2] || '').trim());
        var history = [];
        var lastDate = '상담 기록 없음';

        for (var col2 = 3; col2 < cRow.length; col2++) {
          var cellVal = String(cRow[col2] || '').trim();
          if (cellVal === '') continue;
          history.push(cellVal);
          var dateMatch = cellVal.match(/^\[(.*?)\]/);
          if (dateMatch) lastDate = dateMatch[1];
        }

        stu3.lastCounselingDate = lastDate;
        stu3.counselingHistory = history.reverse();
      }
    }

    var keys = Object.keys(studentsMap)
        .map(Number)
        .sort(function (a, b) { return a - b; });

    return keys.map(function (k) { return studentsMap[k]; });

  } catch (err) {
    Logger.log('getStudentsByClass 오류: ' + err.toString());
    return [];
  }
}


/* ── 상담 저장 ───────────────────────────────────── */

function saveCounseling(classNum, studentNum, studentName, counselText, timeStr) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, error: '다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    var classInt = toInt_(classNum);
    var numInt = toInt_(studentNum);
    var text = String(counselText || '').trim();

    if (isNaN(classInt) || isNaN(numInt) || !text) {
      return { success: false, error: '반, 번호, 상담 내용을 모두 확인해 주세요.' };
    }

    var ss = getSpreadsheet_();
    var sheet = findSheet_(ss, SHEET_COUNSEL, ['상담']);
    if (!sheet) {
      return { success: false, error: "'" + SHEET_COUNSEL + "' 시트를 찾을 수 없습니다." };
    }

    var data = sheet.getDataRange().getValues();
    var targetRow = -1;

    for (var i = 1; i < data.length; i++) {
      if (toInt_(data[i][0]) === classInt && toInt_(data[i][1]) === numInt) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      sheet.appendRow([classInt, numInt, String(studentName || '')]);
      targetRow = sheet.getLastRow();
    }

    var lastCol = Math.max(sheet.getLastColumn(), 4);
    var rowVals = sheet.getRange(targetRow, 1, 1, lastCol).getValues()[0];

    var targetCol = 4;
    while (targetCol - 1 < rowVals.length &&
           String(rowVals[targetCol - 1] || '').trim() !== '') {
      targetCol++;
    }

    sheet.getRange(targetRow, targetCol).setValue('[' + timeStr + ']\n' + text);

    return { success: true, column: targetCol, timeStr: timeStr };

  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


/* ── 희망 대학 · 희망 학과 저장 ──────────────────── */

function saveStudentTarget(classNum, studentNum, studentName, targetUni, targetMajor) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, error: '다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    var classInt = toInt_(classNum);
    var numInt   = toInt_(studentNum);

    if (isNaN(classInt) || isNaN(numInt)) {
      return { success: false, error: '반과 번호를 확인해 주세요.' };
    }

    var uni   = String(targetUni   || '').trim();
    var major = String(targetMajor || '').trim();

    var ss = getSpreadsheet_();
    var sheet = findSheet_(ss, SHEET_TARGET, TARGET_KEYWORDS);
    if (!sheet) {
      return { success: false, error: "'" + SHEET_TARGET + "' 시트를 찾을 수 없습니다." };
    }

    var data = sheet.getDataRange().getValues();
    var info = analyzeTargetSheet_(data);

    var targetRow = -1;
    for (var i = info.startRow; i < data.length; i++) {
      if (toInt_(data[i][info.cols.c]) === classInt &&
          toInt_(data[i][info.cols.n]) === numInt) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow === -1) {
      var width = Math.max(info.cols.c, info.cols.n, info.cols.nm,
                           info.cols.uni, info.cols.major) + 1;
      var newRow = [];
      for (var k = 0; k < width; k++) newRow.push('');
      newRow[info.cols.c]     = classInt;
      newRow[info.cols.n]     = numInt;
      newRow[info.cols.nm]    = String(studentName || '');
      newRow[info.cols.uni]   = uni;
      newRow[info.cols.major] = major;

      sheet.appendRow(newRow);
      targetRow = sheet.getLastRow();
    } else {
      sheet.getRange(targetRow, info.cols.uni   + 1).setValue(uni);
      sheet.getRange(targetRow, info.cols.major + 1).setValue(major);
    }

    return { success: true, row: targetRow, targetUni: uni, targetMajor: major };

  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


/* ══════════════════════════════════════════════════════════
   7. 점검용 함수 (스크립트 편집기에서 직접 실행)
   ══════════════════════════════════════════════════════════ */

function checkSetup() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  Logger.log('✅ 스프레드시트: ' + ss.getName());
  Logger.log('── 실제 시트 탭 목록 ──');
  ss.getSheets().forEach(function (s) { Logger.log('   [' + s.getName() + ']'); });

  Logger.log('── 필요한 시트 확인 ──');
  var need = [
    { n: SHEET_COUNSEL, k: ['상담'] },
    { n: SHEET_GRADE,   k: ['내신'] },
    { n: SHEET_TARGET,  k: TARGET_KEYWORDS }
  ].concat(MOCK_SHEETS.map(function (m) { return { n: m.name, k: m.keywords }; }));

  need.forEach(function (it) {
    var f = findSheet_(ss, it.n, it.k);
    Logger.log((f ? '✅ ' : '❌ ') + it.n + (f ? ' → [' + f.getName() + ']' : ' → 없음'));
  });

  Logger.log('── 반별 학생 수 ──');
  CLASS_LIST.forEach(function (c) {
    Logger.log(c + '반: ' + getStudentsByClass(c).length + '명');
  });
}

function checkTargetSheet() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  var sheet = findSheet_(ss, SHEET_TARGET, TARGET_KEYWORDS);
  Logger.log('════════ ' + SHEET_TARGET + ' ════════');
  if (!sheet) {
    Logger.log('❌ 시트를 찾지 못했습니다. 탭 이름을 확인해 주세요.');
    Logger.log('   현재 탭 목록: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(' | '));
    return;
  }

  Logger.log('✅ 찾은 시트 이름: [' + sheet.getName() + ']');
  var v = sheet.getDataRange().getValues();
  Logger.log('행 수: ' + v.length + ' / 열 수: ' + (v[0] ? v[0].length : 0));

  var info = analyzeTargetSheet_(v);
  Logger.log('자동 인식: ' + (info.detected ? '성공' : '실패 → 기본 위치(A·B·C·D·E열) 사용'));
  Logger.log('머리글 행(0부터): ' + info.headerRow + ' / 데이터 시작 행: ' + info.startRow);
  Logger.log('   반 열 ' + info.cols.c + ' / 번호 열 ' + info.cols.n + ' / 이름 열 ' + info.cols.nm);
  Logger.log('   희망 대학 열 ' + info.cols.uni + ' / 희망 학과 열 ' + info.cols.major);

  if (v[info.headerRow]) {
    Logger.log('── 머리글 ──');
    Logger.log(v[info.headerRow].slice(0, 15).join(' | '));
  }
  for (var i = info.startRow; i < Math.min(info.startRow + 3, v.length); i++) {
    Logger.log('── 데이터 예시 ──');
    Logger.log(v[i].slice(0, 15).join(' | '));
  }
}

function checkMockSheets() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  MOCK_SHEETS.forEach(function (cfg) {
    var sheet = findSheet_(ss, cfg.name, cfg.keywords);
    Logger.log('════════ ' + cfg.name + ' ════════');
    if (!sheet) { Logger.log('❌ 시트를 찾지 못했습니다.'); return; }

    Logger.log('✅ 찾은 시트 이름: [' + sheet.getName() + ']');
    var v = sheet.getDataRange().getValues();
    Logger.log('행 수: ' + v.length + ' / 열 수: ' + (v[0] ? v[0].length : 0));

    var info = analyzeMockSheet_(v);
    Logger.log('자동 인식: ' + (info.detected ? '성공' : '실패 → 기본 위치 사용'));
    Logger.log('데이터 시작 행(0부터): ' + info.startRow);
    MOCK_SUBJECTS.forEach(function (sub) {
      var c = info.cols[sub] || {};
      Logger.log('   ' + sub + ' → 점수 열 ' + c.s + ' / 등급 열 ' + c.g);
    });

    Logger.log('── 1행 머리글 ──');
    if (v[0]) Logger.log(v[0].slice(0, 25).join(' | '));
    if (v[1]) { Logger.log('── 2행 ──'); Logger.log(v[1].slice(0, 25).join(' | ')); }
    if (v[info.startRow]) {
      Logger.log('── 첫 데이터 행 ──');
      Logger.log(v[info.startRow].slice(0, 25).join(' | '));
    }
  });
}
