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
 *      (새 배포는 이때 딱 한 번만 합니다)
 *   3) 나온 주소를 index.html 의 API_URL 에 붙여넣기
 *
 *  [나중에 이 코드를 고쳤을 때]
 *   배포 → 배포 관리 → 연필(✏️) → 버전: 새 버전 → 배포
 *   ※ 주소는 그대로 유지됩니다. [새 배포]는 다시 누르지 마세요.
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
  { key: 'm3',  name: '모의고사_3월',  label: '3월',  keywords: ['3월',  '모의'] },
  { key: 'm6',  name: '모의고사_6월',  label: '6월',  keywords: ['6월',  '모의'] },
  { key: 'm9',  name: '모의고사_9월',  label: '9월',  keywords: ['9월',  '모의'] },
  { key: 'm10', name: '모의고사_10월', label: '10월', keywords: ['10월', '모의'] }
];

var MOCK_SUBJECTS = ['국어', '수학', '영어', '통합사회', '통합과학', '한국사'];

// s=원점수 / t=표준점수 / p=백분위 / g=등급  (-1 이면 그 열이 없다는 뜻)
// 영어·한국사는 절대평가라 표준점수·백분위 열이 없습니다.
var MOCK_MAP_FALLBACK = {
  '국어':     { s: 3,  t: 4,  p: 5,  g: 6  },
  '수학':     { s: 7,  t: 8,  p: 9,  g: 10 },
  '영어':     { s: 11, t: -1, p: -1, g: 12 },
  '통합사회': { s: 13, t: 14, p: 15, g: 16 },
  '통합과학': { s: 17, t: 18, p: 19, g: 20 },
  '한국사':   { s: 21, t: -1, p: -1, g: 22 }
};

// 상담_2차목표 시트 : 1차 점수 기준 '한 등급 올리려면 몇 점 더 필요한가'
var SHEET_GOAL     = '상담_2차목표';
var GOAL_KEYWORDS  = ['상담', '목표'];
var GOAL_START_COL = 3;   // D열부터
var GOAL_PER_SUBJ  = 3;   // +0 1차점수 / +1 1차등급 / +2 +1등급필요

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
      case 'getClassCards':
      case 'getAll':
      case 'getGradeAll':
      case 'saveCounseling':
      case 'saveTarget':
      case 'logout':
        var user = verifyToken_(req.token);
        if (!user) return needLogin_();

        if (action === 'me')            return ok_(publicUser_(user));
        if (action === 'getStudents')   return apiGetStudents_(req, user);
        if (action === 'getClassCards') return apiGetClassCards_(req, user);   // 1단계
        if (action === 'getAll')        return apiGetAll_(req, user);          // 2단계
        if (action === 'getGradeAll')   return apiGetGradeAll_(req, user);
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

/**
 * 만료된 접속증을 정리합니다. (로그인할 때마다 가볍게 실행)
 * 하나 지울 때마다 구글 서버를 다녀오므로, 한 번에 최대 8개만 지웁니다.
 * 남은 것은 다음 로그인 때 이어서 지워집니다.
 */
var CLEAN_LIMIT = 8;

function cleanTokens_() {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var now = Date.now();
  var done = 0;
  var keys = Object.keys(all);

  for (var i = 0; i < keys.length && done < CLEAN_LIMIT; i++) {
    var k = keys[i];
    if (k.indexOf('TK_') !== 0) continue;
    var stale = false;
    try {
      var d = JSON.parse(all[k]);
      stale = (!d.exp || now > d.exp);
    } catch (e) {
      stale = true;
    }
    if (stale) { props.deleteProperty(k); done++; }
  }
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

    // 최근 접속 기록 — 같은 시간대(시 단위)면 다시 쓰지 않습니다.
    // 시트 쓰기는 느려서, 로그인할 때마다 쓰면 그만큼 기다리게 됩니다.
    var nowTxt = nowStr_();
    var lastTxt = String(row[ACC.last] || '');
    if (lastTxt.slice(0, 13) !== nowTxt.slice(0, 13)) {
      sheet.getRange(i + 1, ACC.last + 1).setValue(nowTxt);
    }

    cleanTokens_();

    var token = issueToken_(user);
    var out = publicUser_(user);
    out.token = token;

    // 첫 화면(우리 반 카드)을 같은 응답에 함께 보냅니다.
    // 따로 요청하면 왕복이 한 번 더 생겨 그만큼 늦어집니다.
    try {
      out.cards = buildClassCards_(ss, user.cls);
    } catch (e3) {
      out.cards = null;      // 실패해도 로그인은 되게 둡니다 (화면이 따로 요청합니다)
    }

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

/**
 * ⚠️ 지금 화면은 이 함수를 쓰지 않습니다. getAll 이 대신합니다.
 *    예전 index.html 이 남아 있을 때를 대비해 남겨 둡니다.
 *
 * '통합 성적 관리' 화면이 쓰던 전교생 데이터입니다.
 *
 *  - 로그인한 선생님만 받을 수 있습니다. (verifyToken_ 통과 필수)
 *  - 구글 시트를 공개하지 않고, 이 API 를 통해서만 내보냅니다.
 *  - 크기를 줄이려고 이름표 없이 '숫자 배열' 로 보냅니다.
 *
 *    g : 내신  — 과목 12개 × 항목 11개 = 132칸
 *        (1차시험 1차등급 2차시험 2차등급 1차수행 2차수행
 *         환산총점 최종등급 1차성취도 2차성취도 최종성취도)
 *    t : 상담_2차목표 — 과목 12개 × 3칸 (1차점수 1차등급 +1등급필요)
 *    m : 모의고사 — 월별로 과목 6개 × 4칸 (원점수 표준점수 백분위 등급)
 */
function apiGetGradeAll_(req, user) {
  var ss = getSpreadsheet_();
  if (!ss) return err_('스프레드시트를 열 수 없습니다.');

  var G_LEN = SUBJECTS.length * 11;
  var T_LEN = SUBJECTS.length * 3;
  var M_LEN = MOCK_SUBJECTS.length * 4;

  var index = {};
  var list  = [];

  function ensure_(c, n, nm) {
    var key = c + '-' + n;
    if (!index[key]) {
      var st = { c: c, n: n, nm: nm || '', g: [], t: [], m: {} };
      var i;
      for (i = 0; i < G_LEN; i++) st.g.push(null);
      for (i = 0; i < T_LEN; i++) st.t.push(null);
      MOCK_SHEETS.forEach(function (cfg) {
        var arr = [];
        for (var k = 0; k < M_LEN; k++) arr.push(null);
        st.m[cfg.key] = arr;
      });
      index[key] = st;
      list.push(st);
    }
    if (nm && !index[key].nm) index[key].nm = nm;
    return index[key];
  }

  // 1. 내신성적
  var gradeSheet = findSheet_(ss, SHEET_GRADE, ['내신']);
  if (gradeSheet) {
    var gData = gradeSheet.getDataRange().getValues();
    for (var r = 1; r < gData.length; r++) {
      var gRow = gData[r];
      var gc = toInt_(gRow[0]), gn = toInt_(gRow[1]);
      if (isNaN(gc) || isNaN(gn) || !gn) continue;

      var st1 = ensure_(gc, gn, String(gRow[2] || '').trim());
      for (var si = 0; si < SUBJECTS.length; si++) {
        var base = SUBJECTS[si].start;
        for (var f = 0; f < 11; f++) st1.g[si * 11 + f] = cellVal_(gRow[base + f]);
      }
    }
  }

  // 2. 상담_2차목표
  var goalSheet = loadGoalSheet_(ss);
  if (goalSheet) {
    for (var gk in goalSheet.rows) {
      if (!goalSheet.rows.hasOwnProperty(gk)) continue;
      var parts = gk.split('-');
      var st2 = ensure_(toInt_(parts[0]), toInt_(parts[1]), '');
      var tRow = goalSheet.rows[gk];
      for (var ti = 0; ti < SUBJECTS.length; ti++) {
        var tc = goalSheet.info.cols[ti];
        st2.t[ti * 3 + 0] = cellVal_(tRow[tc.s]);
        st2.t[ti * 3 + 1] = cellVal_(tRow[tc.g]);
        st2.t[ti * 3 + 2] = cellVal_(tRow[tc.need]);
      }
    }
  }

  // 3. 모의고사 (3·6·9·10월)
  MOCK_SHEETS.forEach(function (cfg) {
    var sheet = findSheet_(ss, cfg.name, cfg.keywords);
    if (!sheet) return;

    var mData = sheet.getDataRange().getValues();
    if (mData.length < 2) return;

    var info = analyzeMockSheet_(mData);
    for (var m = info.startRow; m < mData.length; m++) {
      var mRow = mData[m];
      var mc = toInt_(mRow[0]), mn = toInt_(mRow[1]);
      if (isNaN(mc) || isNaN(mn) || !mn) continue;

      var st3 = ensure_(mc, mn, String(mRow[2] || '').trim());
      var slot = st3.m[cfg.key];
      for (var ui = 0; ui < MOCK_SUBJECTS.length; ui++) {
        var col = info.cols[MOCK_SUBJECTS[ui]] || {};
        slot[ui * 4 + 0] = cellVal_(mRow[col.s]);
        slot[ui * 4 + 1] = (col.t >= 0) ? cellVal_(mRow[col.t]) : null;
        slot[ui * 4 + 2] = (col.p >= 0) ? cellVal_(mRow[col.p]) : null;
        slot[ui * 4 + 3] = cellVal_(mRow[col.g]);
      }
    }
  });

  list.sort(function (a, b) { return (a.c - b.c) || (a.n - b.n); });

  return ok_({
    gradeLabel:  GRADE_LABEL,
    subjects:    SUBJECTS.map(function (x) { return x.name; }),
    mockSubjects: MOCK_SUBJECTS,
    mockMonths:  MOCK_SHEETS.map(function (x) { return { key: x.key, label: x.label }; }),
    goalSheet:   goalSheet ? goalSheet.name : '',
    students:    list,
    updated:     nowStr_()
  });
}

/** 시트 칸 하나를 화면용 값으로 바꿉니다. 빈 칸은 null, 숫자는 숫자, 나머지는 글자. */
function cellVal_(v) {
  if (v === undefined || v === null) return null;
  var t = String(v).trim();
  if (t === '' || t === '-') return null;
  var n = Number(t);
  return isNaN(n) ? t : n;
}


/* ══════════════════════════════════════════════════════════
   빠른 화면용 요청 (2단계 로딩)

   1단계 getClassCards : 우리 반 카드만. 시트 3번만 읽어 화면을 바로 띄웁니다.
   2단계 getAll        : 전교 전체. 시트 7번. 받아 두면 반 바꾸기·개별 상담·
                         통합 성적 관리가 서버를 다시 부르지 않습니다.

   ※ 상담_2차목표 시트는 화면에서 더 이상 쓰지 않으므로 읽지 않습니다.
      (등급 상승 목표는 전교 등급컷으로 직접 계산합니다)
   ══════════════════════════════════════════════════════════ */

/**
 * 내신성적 한 줄에서 과목 하나를 계산합니다.
 * getAll 과 getStudentsByClass 가 **같이** 쓰는 단 하나의 계산 자리입니다.
 * 여기만 고치면 두 화면이 늘 같은 값을 봅니다.
 */
function subjectCalc_(gRow, si, ranks, cuts) {
  var i  = SUBJECTS[si].start;
  var rk = (ranks && ranks[si]) || {};
  var ct = (cuts  && cuts[si])  || { first: {}, final: {} };

  var o = {
    exam1:  cellPlain_(gRow, i + 0),
    grade1: cellPlain_(gRow, i + 1),
    exam2:  cellPlain_(gRow, i + 2),
    grade2: cellPlain_(gRow, i + 3),
    eval1:  cellPlain_(gRow, i + 4),
    eval2:  cellPlain_(gRow, i + 5),
    total:  cellPlain_(gRow, i + 6),
    fGrade: cellPlain_(gRow, i + 7),
    ach1:   cellPlain_(gRow, i + 8),
    ach2:   cellPlain_(gRow, i + 9),
    fAch:   cellPlain_(gRow, i + 10)
  };

  o.has1   = (o.exam1 !== '' || o.eval1 !== '');
  o.has2   = (o.exam2 !== '' || o.eval2 !== '');
  o.hasAny = o.has1 || o.has2;

  // ── 9등급 환산 ──
  var n1 = toNum_(gRow[i + 0]);
  var n2 = toNum_(gRow[i + 2]);
  var nt = toNum_(gRow[i + 6]);

  var pct1 = (o.has1   && n1 !== null && rk.first)  ? rk.first(n1)  : null;
  var pct2 = (o.has2   && n2 !== null && rk.second) ? rk.second(n2) : null;
  var pctF = (o.hasAny && nt !== null && rk.final)  ? rk.final(nt)  : null;

  o.g1nine = grade9From_(pct1);
  o.g2nine = grade9From_(pct2);
  o.gFnine = grade9From_(pctF);
  o.pct1 = pct1; o.pct2 = pct2; o.pctF = pctF;
  o.n1 = n1; o.n2 = n2; o.nt = nt;

  // ── 현재 등급에서 한 등급 올리는 데 필요한 점수 ──
  var nowGrade = null, nowScore = null, cutMap = null;
  o.upBasis = '';

  var gfNum = toInt_(o.fGrade);
  var g1Num = toInt_(o.grade1);

  if (o.hasAny && nt !== null && !isNaN(gfNum) && gfNum >= 1 && gfNum <= 5) {
    nowGrade = gfNum; nowScore = nt; cutMap = ct.final; o.upBasis = '환산총점';
  } else if (o.has1 && n1 !== null && !isNaN(g1Num) && g1Num >= 1 && g1Num <= 5) {
    nowGrade = g1Num; nowScore = n1; cutMap = ct.first; o.upBasis = '1차 점수';
  }

  o.upNow = (nowGrade === null) ? '' : String(nowGrade);
  o.upGrade = ''; o.upNeed = '';
  if (nowGrade !== null && nowGrade > 1) {
    var line = cutMap[nowGrade - 1];
    if (line !== undefined) {
      var diff = line - nowScore;
      if (diff < 0) diff = 0;
      o.upGrade = String(nowGrade - 1);
      o.upNeed  = String(round_(diff, 2));
    }
  }
  return o;
}


/* ── 1단계 : 우리 반 카드 (시트 3번) ───────────────── */

function apiGetClassCards_(req, user) {
  var cls = toInt_(req.classNum);
  if (isNaN(cls)) cls = user.cls;

  var ss = getSpreadsheet_();
  if (!ss) return err_('스프레드시트를 열 수 없습니다.');

  return ok_(buildClassCards_(ss, cls));
}

/** 한 반의 카드 자료를 만듭니다. 로그인 응답에도 같이 실어 보냅니다. */
function buildClassCards_(ss, cls) {
  var map = {}, order = [];
  function pick_(n, nm) {
    if (!map[n]) { map[n] = { n: n, nm: nm || (n + '번 학생'), u: '', mj: '', cd: '', cn: 0, a5: null, a9: null }; order.push(n); }
    if (nm && map[n].nm.indexOf('번 학생') > -1) map[n].nm = nm;
    return map[n];
  }

  // 1) 내신성적 — 평균 등급
  var gradeSheet = findSheet_(ss, SHEET_GRADE, ['내신']);
  if (gradeSheet) {
    var gData = gradeSheet.getDataRange().getValues();
    var ranks = buildGradeRanks_(gData);
    for (var r = 1; r < gData.length; r++) {
      var gRow = gData[r];
      if (toInt_(gRow[0]) !== cls) continue;
      var gn = toInt_(gRow[1]);
      if (isNaN(gn) || !gn) continue;

      var st = pick_(gn, String(gRow[2] || '').trim());
      var n5 = 0, s5 = 0, n9 = 0, s9 = 0;
      for (var si = 0; si < SUBJECTS.length; si++) {
        var c = subjectCalc_(gRow, si, ranks, null);
        if (!c.hasAny) continue;
        var g5 = toNum_(c.fGrade);
        if (g5 !== null) { s5 += g5; n5++; }
        if (c.gFnine !== null) { s9 += c.gFnine; n9++; }
      }
      st.a5 = n5 ? round_(s5 / n5, 2) : null;
      st.a9 = n9 ? round_(s9 / n9, 2) : null;
    }
  }

  // 2) 학생 목표
  var targetSheet = findSheet_(ss, SHEET_TARGET, TARGET_KEYWORDS);
  if (targetSheet) {
    var tData = targetSheet.getDataRange().getValues();
    var tInfo = analyzeTargetSheet_(tData);
    for (var t = tInfo.startRow; t < tData.length; t++) {
      var tRow = tData[t];
      if (toInt_(tRow[tInfo.cols.c]) !== cls) continue;
      var tn = toInt_(tRow[tInfo.cols.n]);
      if (isNaN(tn) || !tn) continue;
      var st2 = pick_(tn, String(tRow[tInfo.cols.nm] || '').trim());
      st2.u  = cellPlain_(tRow, tInfo.cols.uni);
      st2.mj = cellPlain_(tRow, tInfo.cols.major);
    }
  }

  // 3) 상담내용 — 횟수와 최근 날짜만
  var counselSheet = findSheet_(ss, SHEET_COUNSEL, ['상담']);
  if (counselSheet) {
    var cData = counselSheet.getDataRange().getValues();
    for (var i2 = 1; i2 < cData.length; i2++) {
      var cRow = cData[i2];
      if (toInt_(cRow[0]) !== cls) continue;
      var cn = toInt_(cRow[1]);
      if (isNaN(cn) || !cn) continue;
      var st3 = pick_(cn, String(cRow[2] || '').trim());
      var cnt = 0, last = '';
      for (var col = 3; col < cRow.length; col++) {
        var v = String(cRow[col] || '').trim();
        if (v === '') continue;
        cnt++;
        var m = v.match(/^\[(.*?)\]/);
        if (m) last = m[1];
      }
      st3.cn = cnt;
      st3.cd = last;
    }
  }

  order.sort(function (a, b) { return a - b; });
  return { classNum: cls, students: order.map(function (k) { return map[k]; }) };
}


/* ── 2단계 : 전교 전체 (시트 7번) ──────────────────── */

function apiGetAll_(req, user) {
  var ss = getSpreadsheet_();
  if (!ss) return err_('스프레드시트를 열 수 없습니다.');

  var G_LEN = SUBJECTS.length * 11;   // 내신 원본
  var D_LEN = SUBJECTS.length * 9;    // 계산값
  var M_LEN = MOCK_SUBJECTS.length * 4;

  var index = {}, list = [];

  // 빈 칸은 null 대신 '' 로 보냅니다. 글자 수가 짧아 응답이 20% 넘게 작아집니다.
  // (화면 쪽에서 '' 과 null 을 똑같이 '값 없음' 으로 읽습니다)
  function E_(v) { return (v === null || v === undefined) ? '' : v; }

  function ensure_(c, n, nm) {
    var key = c + '-' + n;
    if (!index[key]) {
      var st = { c: c, n: n, nm: nm || '', u: '', mj: '', cd: '', h: [],
                 g: [], d: [], s: ['', '', '', '', ''], m: {} };
      var i;
      for (i = 0; i < G_LEN; i++) st.g.push('');
      for (i = 0; i < D_LEN; i++) st.d.push('');
      MOCK_SHEETS.forEach(function (cfg) {
        var arr = [];
        for (var k = 0; k < M_LEN; k++) arr.push('');
        st.m[cfg.key] = arr;
      });
      index[key] = st; list.push(st);
    }
    if (nm && !index[key].nm) index[key].nm = nm;
    return index[key];
  }

  // 1. 내신성적 (+ 9등급 환산 · 등급컷 · 평균)
  var gradeSheet = findSheet_(ss, SHEET_GRADE, ['내신']);
  if (gradeSheet) {
    var gData = gradeSheet.getDataRange().getValues();
    var ranks = buildGradeRanks_(gData);
    var cuts  = buildGradeCuts_(gData);

    for (var r = 1; r < gData.length; r++) {
      var gRow = gData[r];
      var gc = toInt_(gRow[0]), gn = toInt_(gRow[1]);
      if (isNaN(gc) || isNaN(gn) || !gn) continue;

      var st = ensure_(gc, gn, String(gRow[2] || '').trim());
      var acc = { n5: 0, s5: 0, n9: 0, s9: 0, nSc: 0, sSc: 0, nP: 0, sP: 0 };

      for (var si = 0; si < SUBJECTS.length; si++) {
        var base = SUBJECTS[si].start;
        for (var f = 0; f < 11; f++) st.g[si * 11 + f] = E_(cellVal_(gRow[base + f]));

        var c = subjectCalc_(gRow, si, ranks, cuts);
        var d = si * 9;
        st.d[d + 0] = E_(c.g1nine);
        st.d[d + 1] = E_(c.g2nine);
        st.d[d + 2] = E_(c.gFnine);
        st.d[d + 3] = c.upNow   === '' ? '' : Number(c.upNow);
        st.d[d + 4] = c.upGrade === '' ? '' : Number(c.upGrade);
        st.d[d + 5] = c.upNeed  === '' ? '' : Number(c.upNeed);
        st.d[d + 6] = c.upBasis === '환산총점' ? 1 : (c.upBasis === '1차 점수' ? 2 : 0);
        st.d[d + 7] = c.has1 ? 1 : 0;
        st.d[d + 8] = c.has2 ? 1 : 0;

        if (c.hasAny) {
          var g5 = toNum_(c.fGrade);
          if (g5 !== null) { acc.s5 += g5; acc.n5++; }
          if (c.gFnine !== null) { acc.s9 += c.gFnine; acc.n9++; }
          if (c.nt !== null) { acc.sSc += c.nt; acc.nSc++; }
          if (c.pctF !== null) { acc.sP += c.pctF; acc.nP++; }
        }
      }

      st.s = [
        acc.n5 || acc.n9,
        acc.n5  ? round_(acc.s5  / acc.n5,  2) : '',
        acc.n9  ? round_(acc.s9  / acc.n9,  2) : '',
        acc.nSc ? round_(acc.sSc / acc.nSc, 1) : '',
        acc.nP  ? round_(acc.sP  / acc.nP,  1) : ''
      ];
    }
  }

  // 2. 학생 목표
  var targetSheet = findSheet_(ss, SHEET_TARGET, TARGET_KEYWORDS);
  if (targetSheet) {
    var tData = targetSheet.getDataRange().getValues();
    var tInfo = analyzeTargetSheet_(tData);
    for (var t2 = tInfo.startRow; t2 < tData.length; t2++) {
      var tRow = tData[t2];
      var tc = toInt_(tRow[tInfo.cols.c]), tn = toInt_(tRow[tInfo.cols.n]);
      if (isNaN(tc) || isNaN(tn) || !tn) continue;
      var st2 = ensure_(tc, tn, String(tRow[tInfo.cols.nm] || '').trim());
      st2.u  = cellPlain_(tRow, tInfo.cols.uni);
      st2.mj = cellPlain_(tRow, tInfo.cols.major);
    }
  }

  // 3. 상담내용
  var counselSheet = findSheet_(ss, SHEET_COUNSEL, ['상담']);
  if (counselSheet) {
    var cData = counselSheet.getDataRange().getValues();
    for (var i3 = 1; i3 < cData.length; i3++) {
      var cRow = cData[i3];
      var cc = toInt_(cRow[0]), cn2 = toInt_(cRow[1]);
      if (isNaN(cc) || isNaN(cn2) || !cn2) continue;
      var st3 = ensure_(cc, cn2, String(cRow[2] || '').trim());
      var hist = [], last = '';
      for (var col2 = 3; col2 < cRow.length; col2++) {
        var val = String(cRow[col2] || '').trim();
        if (val === '') continue;
        hist.push(val);
        var mm = val.match(/^\[(.*?)\]/);
        if (mm) last = mm[1];
      }
      st3.cd = last;
      st3.h  = hist.reverse();
    }
  }

  // 4. 모의고사 (3·6·9·10월)
  MOCK_SHEETS.forEach(function (cfg) {
    var sheet = findSheet_(ss, cfg.name, cfg.keywords);
    if (!sheet) return;
    var mData = sheet.getDataRange().getValues();
    if (mData.length < 2) return;

    var info = analyzeMockSheet_(mData);
    for (var m = info.startRow; m < mData.length; m++) {
      var mRow = mData[m];
      var mc = toInt_(mRow[0]), mn = toInt_(mRow[1]);
      if (isNaN(mc) || isNaN(mn) || !mn) continue;

      var st4 = ensure_(mc, mn, String(mRow[2] || '').trim());
      var slot = st4.m[cfg.key];
      for (var ui = 0; ui < MOCK_SUBJECTS.length; ui++) {
        var col3 = info.cols[MOCK_SUBJECTS[ui]] || {};
        slot[ui * 4 + 0] = E_(cellVal_(mRow[col3.s]));
        slot[ui * 4 + 1] = (col3.t >= 0) ? E_(cellVal_(mRow[col3.t])) : '';
        slot[ui * 4 + 2] = (col3.p >= 0) ? E_(cellVal_(mRow[col3.p])) : '';
        slot[ui * 4 + 3] = E_(cellVal_(mRow[col3.g]));
      }
    }
  });

  list.sort(function (a, b) { return (a.c - b.c) || (a.n - b.n); });

  return ok_({
    gradeLabel:   GRADE_LABEL,
    classList:    CLASS_LIST,
    subjects:     SUBJECTS.map(function (x) { return x.name; }),
    mockSubjects: MOCK_SUBJECTS,
    mockMonths:   MOCK_SHEETS.map(function (x) { return { key: x.key, label: x.label }; }),
    students:     list,
    updated:      nowStr_()
  });
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
        .addItem('⑦ 전체 점검 (문제 생겼을 때)', '연결테스트')
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
    var scoreCol = -1, gradeCol = -1, stdCol = -1, pctCol = -1, prefer = 99;

    for (var c2 = 0; c2 < labels.length; c2++) {
      var lb = labels[c2];
      if (!lb || lb.indexOf(key) === -1) continue;

      if (lb.indexOf('등급') !== -1) {
        if (gradeCol === -1) gradeCol = c2;
      } else if (lb.indexOf('백분위') !== -1) {
        // 백분위는 점수로 쓰지 않고 따로 보관합니다.
        if (pctCol === -1) pctCol = c2;
      } else if (lb.indexOf('원점수') !== -1) {
        if (prefer > 1) { scoreCol = c2; prefer = 1; }
      } else if (lb.indexOf('표준점수') !== -1) {
        if (stdCol === -1) stdCol = c2;
        if (prefer > 2) { scoreCol = c2; prefer = 2; }
      } else if (lb.indexOf('점수') !== -1) {
        if (prefer > 3) { scoreCol = c2; prefer = 3; }
      }
    }

    if (scoreCol !== -1 || gradeCol !== -1) {
      result.cols[sub] = { s: scoreCol, t: stdCol, p: pctCol, g: gradeCol };
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


/* ── 상담_2차목표 시트 구조 자동 분석 ─────────────────
   기본 구조 : 머리글 2줄 / A반 B번호 C이름 / D열부터 과목당 3칸 × 12과목
               +0 1차점수  +1 1차등급  +2 +1등급필요

   시트가 이 모양이 아닐 수도 있어서, 머리글에 '필요' 라고 적힌 열을
   먼저 찾아봅니다. 12개가 정확히 나오면 그 위치를 쓰고,
   아니면 위의 기본 구조(3칸씩)를 씁니다.
   → 어떻게 인식했는지는 check상담목표시트() 로 확인할 수 있습니다.
   ────────────────────────────────────────────────── */

function analyzeGoalSheet_(values) {
  var result = { startRow: 2, cols: [], how: '기본 구조(3칸씩)', detected: false };

  if (!values || !values.length) return result;

  // 1) 데이터가 시작되는 줄 = 반·번호가 모두 숫자인 첫 줄
  var start = -1;
  for (var r = 0; r < Math.min(values.length, 8); r++) {
    if (!isNaN(toInt_(values[r][0])) && !isNaN(toInt_(values[r][1]))) { start = r; break; }
  }
  result.startRow = (start === -1) ? 2 : start;

  // 2) 머리글(데이터 시작 줄 위쪽)을 열별로 이어 붙입니다.
  var width = 0;
  for (var w = 0; w < values.length; w++) {
    if (values[w].length > width) width = values[w].length;
  }
  var labels = [];
  for (var c = 0; c < width; c++) {
    var txt = '';
    for (var hr = 0; hr < result.startRow; hr++) {
      txt += String((values[hr] || [])[c] || '');
    }
    labels[c] = normalize_(txt);
  }

  // 3) '필요' 가 들어간 열 찾기
  var needCols = [];
  for (var c2 = GOAL_START_COL; c2 < width; c2++) {
    if (labels[c2] && labels[c2].indexOf('필요') !== -1) needCols.push(c2);
  }

  if (needCols.length === SUBJECTS.length) {
    for (var i = 0; i < SUBJECTS.length; i++) {
      result.cols.push({ s: needCols[i] - 2, g: needCols[i] - 1, need: needCols[i] });
    }
    result.how = "머리글의 '필요' 열 " + SUBJECTS.length + '개로 자동 인식';
    result.detected = true;
  } else {
    for (var j = 0; j < SUBJECTS.length; j++) {
      var base = GOAL_START_COL + j * GOAL_PER_SUBJ;
      result.cols.push({ s: base, g: base + 1, need: base + 2 });
    }
  }
  return result;
}

/** 상담_2차목표 시트를 읽어 둡니다. 시트가 없으면 null 을 돌려줍니다. */
function loadGoalSheet_(ss) {
  try {
    var sheet = findSheet_(ss, SHEET_GOAL, GOAL_KEYWORDS);
    if (!sheet) return null;
    var values = sheet.getDataRange().getValues();
    if (!values || values.length < 2) return null;

    var info = analyzeGoalSheet_(values);
    var rows = {};
    for (var r = info.startRow; r < values.length; r++) {
      var row = values[r];
      var c = toInt_(row[0]), n = toInt_(row[1]);
      if (isNaN(c) || isNaN(n) || !n) continue;
      rows[c + '-' + n] = row;
    }
    return { info: info, rows: rows, name: sheet.getName() };
  } catch (e) {
    Logger.log('상담_2차목표 시트를 읽지 못했습니다: ' + e.toString());
    return null;
  }
}

/** 열 번호(0부터)를 A, B, C … 로 바꿉니다. 로그를 보기 쉽게 하려는 용도입니다. */
function colLetter_(index) {
  if (index === undefined || index === null || index < 0) return '없음';
  var n = index + 1, out = '';
  while (n > 0) {
    var m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out + '열';
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


/** 과목별 '등급컷' — 그 등급을 받은 학생 중 가장 낮은 점수.
 *
 *  '한 등급 올리려면 몇 점이 더 필요한가' 를 구하려고 씁니다.
 *  예) 내가 3등급 71점인데 전교에서 2등급을 받은 학생 중 최저가 79점이면
 *      → 8점이 더 필요합니다.
 *
 *  등급은 시트에 있는 5등급 값을 그대로 씁니다. (수식은 건드리지 않습니다)
 *    first : 1차시험 점수 ↔ 1차등급
 *    final : 환산총점    ↔ 최종등급
 */
function buildGradeCuts_(gData) {
  var cuts = [];

  SUBJECTS.forEach(function (subj, si) {
    var i = subj.start;
    var first = {}, final = {};

    for (var r = 1; r < gData.length; r++) {
      var row = gData[r];
      if (isNaN(toInt_(row[0])) || isNaN(toInt_(row[1]))) continue;   // 반·번호 없는 줄 제외

      var s1 = toNum_(row[i + 0]);   // 1차시험
      var s2 = toNum_(row[i + 2]);   // 2차시험
      var e1 = toNum_(row[i + 4]);   // 1차수행
      var e2 = toNum_(row[i + 5]);   // 2차수행
      var tot = toNum_(row[i + 6]);  // 환산총점

      var g1 = toInt_(row[i + 1]);   // 1차등급
      var gf = toInt_(row[i + 7]);   // 최종등급

      if (s1 !== null && !isNaN(g1) && g1 >= 1 && g1 <= 5) {
        if (first[g1] === undefined || s1 < first[g1]) first[g1] = s1;
      }

      var hasAny = (s1 !== null || s2 !== null || e1 !== null || e2 !== null);
      if (hasAny && tot !== null && !isNaN(gf) && gf >= 1 && gf <= 5) {
        if (final[gf] === undefined || tot < final[gf]) final[gf] = tot;
      }
    }

    cuts[si] = { first: first, final: final };
  });

  return cuts;
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
      var cuts  = buildGradeCuts_(gData);           // 전교생 기준 과목별 등급컷

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
          // 계산은 subjectCalc_ 한 곳에서만 합니다 (getAll 과 같은 값)
          var c = subjectCalc_(gRow, si, ranks, cuts);

          if (c.hasAny) {
            var g5 = toNum_(c.fGrade);
            if (g5 !== null) { acc.s5 += g5; acc.n5++; }
            if (c.gFnine !== null) { acc.s9 += c.gFnine; acc.n9++; }
            if (c.nt !== null) { acc.sSc += c.nt; acc.nSc++; }
            if (c.pctF !== null) { acc.sP += c.pctF; acc.nP++; }
          }

          stu.schoolGrades.push({
            subject: subj.name,
            exam1:  c.has1 ? c.exam1  : '',
            grade1: c.has1 ? c.grade1 : '',
            eval1:  c.has1 ? c.eval1  : '',
            achievement1: c.has1 ? c.ach1 : '',
            exam2:  c.has2 ? c.exam2  : '',
            grade2: c.has2 ? c.grade2 : '',
            eval2:  c.has2 ? c.eval2  : '',
            achievement2: c.has2 ? c.ach2 : '',
            totalScore:       c.hasAny ? c.total  : '',
            finalGrade:       c.hasAny ? c.fGrade : '',
            finalAchievement: c.hasAny ? c.fAch   : '',
            hasData: c.hasAny,

            // 9등급제 환산 결과
            grade1_9:    (c.g1nine === null) ? '' : String(c.g1nine),
            grade2_9:    (c.g2nine === null) ? '' : String(c.g2nine),
            finalGrade9: (c.gFnine === null) ? '' : String(c.gFnine),
            pct1:      (c.pct1 === null) ? '' : round_(c.pct1, 1),
            pct2:      (c.pct2 === null) ? '' : round_(c.pct2, 1),
            pctFinal:  (c.pctF === null) ? '' : round_(c.pctF, 1),

            // 현재 등급에서 한 등급 올리는 데 필요한 점수 (전교 등급컷까지)
            upNow:   c.upNow,
            upGrade: c.upGrade,
            upNeed:  c.upNeed,
            upBasis: c.upBasis
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
          var col = info.cols[sub] || { s: -1, t: -1, p: -1, g: -1 };
          return {
            subject: sub,
            score:   cellText_(mRow, col.s),
            std:     cellText_(mRow, col.t),
            percent: cellText_(mRow, col.p),
            grade:   cellText_(mRow, col.g)
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

/**
 * ★ 문제가 생기면 이 함수를 실행해 보세요. ★
 * 편집기 위쪽 함수 목록에서 '연결테스트' 선택 → ▶ 실행 → 아래 실행 로그 확인
 */
function 연결테스트() {
  var L = [];
  function log(s) { L.push(s); }

  log('════════ 상담 시스템 연결 점검 ════════');

  // 1. 스프레드시트
  var ss = null;
  try { ss = getSpreadsheet_(); } catch (e) { log('❌ 오류: ' + e); }
  if (!ss) {
    log('❌ [1] 스프레드시트를 열 수 없습니다.');
    log('      SPREADSHEET_ID 값을 확인해 주세요.');
    Logger.log(L.join('\n'));
    return;
  }
  log('✅ [1] 스프레드시트 연결: ' + ss.getName());

  // 2. 시트 확인
  log('');
  log('── [2] 시트 확인 ──');
  var need = [
    { n: SHEET_COUNSEL, k: ['상담'] },
    { n: SHEET_GRADE,   k: ['내신'] },
    { n: SHEET_TARGET,  k: TARGET_KEYWORDS }
  ].concat(MOCK_SHEETS.map(function (m) { return { n: m.name, k: m.keywords }; }));

  need.forEach(function (it) {
    var f = findSheet_(ss, it.n, it.k);
    log((f ? '   ✅ ' : '   ❌ ') + it.n + (f ? ' → [' + f.getName() + ']' : ' → 찾지 못함'));
  });

  // 3. 계정
  log('');
  log('── [3] 계정 확인 ──');
  var acc = ensureAccountSheet_(ss);
  var data = acc.getDataRange().getValues();
  var admin = 0, teacher = 0, pending = 0;
  for (var i = 1; i < data.length; i++) {
    var st = String(data[i][ACC.status] || '').trim();
    var rl = String(data[i][ACC.role] || '').trim();
    if (st === '대기') pending++;
    else if (st === '승인') { if (rl === '관리자') admin++; else teacher++; }
  }
  log('   관리자 ' + admin + '명 / 담임 ' + teacher + '명 / 승인대기 ' + pending + '명');
  if (admin === 0) {
    log('   ❌ 관리자 계정이 없습니다!');
    log('      → 함수 목록에서 [초기설정]을 실행해 비밀번호를 받으세요.');
  } else {
    log('   ✅ 관리자 계정 있음');
  }

  // 4. 학생 수
  log('');
  log('── [4] 반별 학생 수 ──');
  var total = 0;
  CLASS_LIST.forEach(function (c) {
    var n = getStudentsByClass(c).length;
    total += n;
    log('   ' + c + '반: ' + n + '명');
  });
  if (total === 0) log('   ❌ 학생이 한 명도 읽히지 않습니다. 시트 탭 이름을 확인해 주세요.');

  // 5. 응답 테스트
  log('');
  log('── [5] 서버 응답 테스트 ──');
  var ping = handle_({ action: 'ping' });
  log('   ping → ' + (ping.ok ? '✅ 정상' : '❌ 실패'));

  // 6. 배포 안내
  log('');
  log('── [6] 배포 확인 (직접 눈으로 확인) ──');
  log('   [배포 → 배포 관리] 에서 아래 두 가지를 확인하세요.');
  log('   · 실행: 나(본인 이메일)');
  log('   · 액세스 권한이 있는 사용자: 모든 사용자');
  log('   코드를 고쳤다면 [연필 ✏️ → 버전: 새 버전 → 배포] 를 꼭 눌러야 합니다.');
  log('════════════════════════════════════');

  Logger.log(L.join('\n'));
}

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


/**
 * '상담_2차목표' 시트를 어떻게 읽고 있는지 확인합니다.
 *
 *  Apps Script 편집기 위쪽 함수 목록에서 check상담목표시트 를 고르고
 *  ▷실행 을 누른 뒤, 아래 '실행 로그'에 나온 내용을 알려 주세요.
 */
function check상담목표시트() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  var sheet = findSheet_(ss, SHEET_GOAL, GOAL_KEYWORDS);
  if (!sheet) {
    Logger.log("❌ '" + SHEET_GOAL + "' 시트를 찾지 못했습니다.");
    Logger.log('   현재 시트 탭 목록: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
    return;
  }

  var v = sheet.getDataRange().getValues();
  Logger.log('✅ 시트를 찾았습니다: [' + sheet.getName() + ']');
  Logger.log('   전체 ' + v.length + '행 / ' + (v[0] ? v[0].length : 0) + '열');
  Logger.log('');

  Logger.log('── 맨 위 3줄 (앞 20칸만) ──');
  for (var r = 0; r < Math.min(v.length, 3); r++) {
    Logger.log((r + 1) + '행: ' + v[r].slice(0, 20).join(' | '));
  }
  Logger.log('');

  var info = analyzeGoalSheet_(v);
  Logger.log('── 자동 인식 결과 ──');
  Logger.log('   인식 방법  : ' + info.how);
  Logger.log('   데이터 시작: ' + (info.startRow + 1) + '행');
  Logger.log('');

  Logger.log('── 과목별 열 위치 ──');
  for (var i = 0; i < SUBJECTS.length; i++) {
    var c = info.cols[i];
    Logger.log('   ' + SUBJECTS[i].name +
               ' : 1차점수 ' + colLetter_(c.s) +
               ' / 1차등급 ' + colLetter_(c.g) +
               ' / +1등급필요 ' + colLetter_(c.need));
  }
  Logger.log('');

  if (v.length > info.startRow) {
    Logger.log('── 첫 학생 줄로 실제 읽어 본 값 ──');
    var row = v[info.startRow];
    Logger.log('   ' + row[0] + '반 ' + row[1] + '번 ' + row[2]);
    for (var j = 0; j < SUBJECTS.length; j++) {
      var cc = info.cols[j];
      Logger.log('   ' + SUBJECTS[j].name +
                 ' → 점수 ' + cellText_(row, cc.s) +
                 ' / 등급 ' + cellText_(row, cc.g) +
                 ' / 필요 ' + cellText_(row, cc.need));
    }
  }
}
