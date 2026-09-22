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
var SHEET_TRANSFER = '전입생_성적';              // 전입생이 이전 학교에서 받아 온 성적
var SHEET_ACCOUNT = '계정';                      // 로그인 계정 시트 (자동 생성됩니다)
var SHEET_TGRADE  = '목표등급';                   // 선생님이 적어 두는 목표 등급 (자동 생성됩니다)
var SHEET_UNIV    = '정시_대학자료';              // 정시 결과 (선생님이 붙여넣은 표)
var SHEET_SUSI    = '수시_대학자료';              // 수시 지원 이력 (선배들의 합격·불합격)

var TARGET_KEYWORDS = ['학생', '목표'];          // '학생목표', '1학년 학생 목표' 등도 인식
var TRANSFER_KEYWORDS = ['전입생'];              // '전입생성적', '전입생 성적' 등도 인식
var TGRADE_KEYWORDS = ['목표등급'];              // '목표등급표' 등도 인식 ('학생 목표'와 안 겹칩니다)
var UNIV_KEYWORDS = ['정시', '대학자료'];        // '정시 대학자료' 등도 인식
var SUSI_KEYWORDS = ['수시', '대학자료'];

// 수시 전교과는 **내신 등급**입니다. 1~9 밖의 값은 뜻이 다른 값이라 뺍니다.
var SUSI_MIN = 1;
var SUSI_MAX = 9;

// 대학자료 '평균70' 은 대학마다 적어 둔 값의 뜻이 다릅니다.
//   1~9      → 백분위가 아니라 **등급**을 적어 둔 줄 (260줄)
//   100 초과 → 백분위가 아니라 **표준점수·총점** (537줄, 최대 504.7)
// 학생 백분위와 견줄 수 있는 것은 이 사이 값뿐이라 나머지는 뺍니다.
var UNIV_MIN = 10;
var UNIV_MAX = 100;

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

// 과목 목록
//   name  : 시트 머리글에 적힌 이름 (뒤의 1=1학기, 2=2학기)
//   base  : 학기 표시를 뗀 과목 이름 (화면 표에 이 이름이 나옵니다)
//   sem   : 1학기 과목인가 2학기 과목인가
//   start : '내신성적' 시트에서 그 과목 첫 칸(1차시험)의 열 번호 (0부터 셈)
//           과목 하나가 11칸이므로 3, 14, 25 … 처럼 11칸씩 늘어납니다.
//
// ⚠️ start 는 '시트가 예상대로 생겼을 때 쓰는 기본값' 입니다.
//    실제로는 syncSubjectCols_() 가 시트 머리글을 읽어 위치를 자동으로 찾습니다.
//    (과목을 중간에 끼워 넣어도 자동으로 따라갑니다. 머리글을 못 읽으면 이 기본값을 씁니다)
var SUBJECTS = [
  { name: '공통국어1', base: '공통국어', sem: 1, start: 3   },
  { name: '공통국어2', base: '공통국어', sem: 2, start: 14  },
  { name: '공통수학1', base: '공통수학', sem: 1, start: 25  },
  { name: '공통수학2', base: '공통수학', sem: 2, start: 36  },
  { name: '공통영어1', base: '공통영어', sem: 1, start: 47  },
  { name: '공통영어2', base: '공통영어', sem: 2, start: 58  },
  { name: '통합사회1', base: '통합사회', sem: 1, start: 69  },
  { name: '통합사회2', base: '통합사회', sem: 2, start: 80  },
  { name: '통합과학1', base: '통합과학', sem: 1, start: 91  },
  { name: '통합과학2', base: '통합과학', sem: 2, start: 102 },
  { name: '한국사1',   base: '한국사',   sem: 1, start: 113 },
  { name: '한국사2',   base: '한국사',   sem: 2, start: 124 },

  // ── 2학기에만 시험을 보는 과목 ──
  // 정보는 1학기에 없으므로 2학기 화면에만 나옵니다.
  // 기본값 135 = 한국사2 바로 뒤(136번째 칸, EF열). 시트가 다르면 머리글로 자동 보정합니다.
  { name: '정보2',     base: '정보',     sem: 2, start: 135 }
];

// 과목 한 칸(블록)의 너비. 11칸(1차시험 … 최종성취도)입니다.
var SUBJ_WIDTH = 11;

// 이번 요청에서 실제로 쓸 과목 시작 열. syncSubjectCols_() 가 채웁니다.
var SUBJ_START = null;

/** 과목 si 의 '내신성적' 시트 시작 열. 자동 인식이 됐으면 그 값을, 아니면 기본값을 씁니다. */
function subjStart_(si) {
  if (SUBJ_START && SUBJ_START[si] !== undefined && SUBJ_START[si] !== null) {
    return SUBJ_START[si];
  }
  return SUBJECTS[si].start;
}

/**
 * '내신성적' 시트 머리글을 읽어 과목이 몇 번째 열부터 시작하는지 찾아 둡니다.
 * 내신성적 시트를 읽는 함수는 값을 쓰기 전에 이 함수를 먼저 부릅니다.
 *
 * 왜 필요한가 : 과목을 중간에 끼워 넣으면 뒤 과목이 전부 밀립니다.
 *              머리글로 위치를 찾아 두면 밀려도 제 값을 읽습니다.
 * 못 찾으면   : 위 SUBJECTS 의 start 기본값을 그대로 씁니다 (예전과 같은 동작).
 */
function syncSubjectCols_(gData) {
  SUBJ_START = detectSubjectCols_(gData);
  return SUBJ_START;
}

/** 머리글에서 과목 위치를 찾습니다. 13과목을 모두 찾았을 때만 결과를 돌려줍니다. */
function detectSubjectCols_(gData) {
  if (!gData || !gData.length) return null;

  var width = 0;
  for (var w = 0; w < gData.length; w++) {
    if (gData[w] && gData[w].length > width) width = gData[w].length;
  }
  if (width <= 3) return null;

  // 머리글은 데이터가 시작되기 전 줄들입니다. 열별로 이어 붙여 한 덩어리로 봅니다.
  var headRows = 0;
  for (var r = 0; r < Math.min(gData.length, 4); r++) {
    if (!isNaN(toInt_((gData[r] || [])[0])) && !isNaN(toInt_((gData[r] || [])[1]))) break;
    headRows++;
  }
  if (!headRows) return null;

  var labels = [];
  for (var c = 0; c < width; c++) {
    var txt = '';
    for (var hr = 0; hr < headRows; hr++) txt += String((gData[hr] || [])[c] || '');
    labels[c] = normalize_(txt);
  }

  // 3열(D열)부터 11칸씩 끊어 과목 블록의 시작 열을 모읍니다.
  var blocks = [];
  for (var b = 3; b + SUBJ_WIDTH - 1 < width; b += SUBJ_WIDTH) blocks.push(b);

  // 학기 표시 없는 이름을 몇 과목이 쓰는지 셉니다.
  // '공통국어' 는 1·2학기 둘이 쓰므로 '공통국어' 만으로는 구분할 수 없지만,
  // '정보' 는 한 과목뿐이라 머리글이 '정보' 라고만 적혀 있어도 찾을 수 있습니다.
  var baseCount = {};
  SUBJECTS.forEach(function (x) { baseCount[x.base] = (baseCount[x.base] || 0) + 1; });

  var pos = {}, taken = {}, found = 0;

  function match_(wantOf) {
    for (var si = 0; si < SUBJECTS.length; si++) {
      if (pos[SUBJECTS[si].name] !== undefined) continue;
      var want = wantOf(SUBJECTS[si]);
      if (!want) continue;
      for (var bi = 0; bi < blocks.length; bi++) {
        var col = blocks[bi];
        if (taken[col]) continue;
        var t = labels[col];
        if (t && t.indexOf(want) === 0) {
          pos[SUBJECTS[si].name] = col;
          taken[col] = true;
          found++;
          break;
        }
      }
    }
  }

  // 1) 머리글이 '공통국어1' 처럼 학기까지 적혀 있을 때
  match_(function (x) { return normalize_(x.name); });
  // 2) 머리글이 '정보' 처럼 학기 표시 없이 적혀 있을 때 (그 이름을 쓰는 과목이 하나뿐일 때만)
  match_(function (x) { return baseCount[x.base] === 1 ? normalize_(x.base) : ''; });

  if (found !== SUBJECTS.length) return null;   // 하나라도 못 찾으면 기본값을 씁니다

  var out = [];
  for (var k = 0; k < SUBJECTS.length; k++) out.push(pos[SUBJECTS[k].name]);
  return out;
}

/**
 * 표에 보여 줄 과목 이름.
 *   공통국어1 · 공통국어2 → 두 학기에 다 있으므로 숫자를 남깁니다 (구분이 필요)
 *   정보2                 → 2학기에만 있으므로 '정보' 로만 보여 줍니다
 */
function subjLabel_(si) {
  var me = SUBJECTS[si], n = 0;
  for (var i = 0; i < SUBJECTS.length; i++) {
    if (SUBJECTS[i].base === me.base) n++;
  }
  return (n === 1) ? me.base : me.name;
}

/** 화면에 보낼 과목 목록. 이름·학기·표시이름을 같이 보냅니다. */
function subjectMeta_() {
  return SUBJECTS.map(function (x, i) {
    return { n: x.name, b: x.base, s: x.sem, l: subjLabel_(i) };
  });
}

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
        return ok_({ message: 'ok', classList: CLASS_LIST, gradeLabel: GRADE_LABEL, ver: APP_VER });

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
      case 'updateCounseling':
      case 'deleteCounseling':
      case 'saveTarget':
      case 'saveTargetGrade':
      case 'getUniv':
      case 'getSusi':
      case 'logout':
        var user = verifyToken_(req.token);
        if (!user) return needLogin_();

        if (action === 'me')            return ok_(publicUser_(user));
        if (action === 'getStudents')   return apiGetStudents_(req, user);
        if (action === 'getClassCards') return apiGetClassCards_(req, user);   // 1단계
        if (action === 'getAll')        return apiGetAll_(req, user);          // 2단계
        if (action === 'getGradeAll')   return apiGetGradeAll_(req, user);
        if (action === 'saveCounseling')return apiSaveCounseling_(req, user);
        if (action === 'updateCounseling') return apiUpdateCounseling_(req, user);
        if (action === 'deleteCounseling') return apiDeleteCounseling_(req, user);
        if (action === 'saveTarget')    return apiSaveTarget_(req, user);
        if (action === 'saveTargetGrade') return apiSaveTargetGrade_(req, user);
        if (action === 'getUniv')       return apiGetUniv_(req, user);
        if (action === 'getSusi')       return apiGetSusi_(req, user);
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
    syncSubjectCols_(gData);                        // 과목 열 위치를 머리글로 확인
    for (var r = 1; r < gData.length; r++) {
      var gRow = gData[r];
      var gc = toInt_(gRow[0]), gn = toInt_(gRow[1]);
      if (isNaN(gc) || isNaN(gn) || !gn) continue;

      var st1 = ensure_(gc, gn, String(gRow[2] || '').trim());
      for (var si = 0; si < SUBJECTS.length; si++) {
        var base = subjStart_(si);
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
    subjectInfo: subjectMeta_(),
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

/* ══════════════════════════════════════════════════════════
   여러 시트를 '한 번에' 읽기

   Apps Script 에서 getValues() 한 번은 구글 서버까지 다녀오는 왕복입니다.
   시트 7개를 읽으면 왕복 7번이라 그만큼 기다리게 됩니다.

   구글 시트 고급 서비스(Sheets API)가 켜져 있으면 **왕복 한 번**으로
   여러 시트를 한꺼번에 읽습니다. 켜져 있지 않으면 예전처럼 하나씩 읽습니다.
   → 켜지 않아도 그대로 동작합니다. 켜면 훨씬 빨라집니다.

   켜는 방법 (한 번만):
     Apps Script 편집기 왼쪽 [서비스] 옆 [+] → Google Sheets API → [추가]
   ══════════════════════════════════════════════════════════ */

/** 고급 서비스를 쓸 수 있는지 한 번만 확인해 기억해 둡니다. */
var _batchOK = null;

/**
 * @param ss     스프레드시트
 * @param wants  [{key:'grade', name:'내신성적', keywords:['내신']}, ...]
 * @return       { grade: [[...]], ... }  (시트가 없으면 null)
 */
function readSheets_(ss, wants) {
  var out = {}, use = [];

  for (var i = 0; i < wants.length; i++) {
    var w = wants[i];
    var sh = findSheet_(ss, w.name, w.keywords);      // 이름만 찾습니다 (자료는 안 읽음)
    if (sh) use.push({ key: w.key, sheet: sh });
    else out[w.key] = null;
  }
  if (!use.length) return out;

  // ── 1) 한 번에 읽기 (고급 서비스가 켜져 있을 때) ──
  if (_batchOK !== false) {
    try {
      var ranges = use.map(function (u) {
        return "'" + String(u.sheet.getName()).replace(/'/g, "''") + "'";
      });
      var res = Sheets.Spreadsheets.Values.batchGet(ss.getId(), {
        ranges: ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',      // 표시 형식이 아니라 실제 값
        dateTimeRenderOption: 'FORMATTED_STRING'     // 날짜는 글자로
      });
      var vr = (res && res.valueRanges) || [];
      if (vr.length === use.length) {
        for (var j = 0; j < use.length; j++) out[use[j].key] = squareUp_(vr[j].values || []);
        _batchOK = true;
        return out;
      }
    } catch (e) {
      _batchOK = false;                              // 이 실행에서는 다시 시도하지 않습니다
      Logger.log('한 번에 읽기를 쓸 수 없어 하나씩 읽습니다: ' + e);
    }
  }

  // ── 2) 예전 방식 (하나씩) ──
  for (var k = 0; k < use.length; k++) {
    out[use[k].key] = use[k].sheet.getDataRange().getValues();
  }
  return out;
}

/**
 * Sheets API 는 줄 끝의 빈 칸을 잘라서 돌려줍니다.
 * 그대로 두면 줄마다 길이가 달라져, 예를 들어 모의고사 머리글의
 * 병합된 빈 칸이 사라지면서 마지막 과목(한국사)의 등급 열을 놓칩니다.
 * getValues() 와 똑같이 네모난 표가 되도록 빈 칸('')으로 채워 줍니다.
 */
function squareUp_(rows) {
  var width = 0, i;
  for (i = 0; i < rows.length; i++) {
    if (rows[i] && rows[i].length > width) width = rows[i].length;
  }
  for (i = 0; i < rows.length; i++) {
    if (!rows[i]) rows[i] = [];
    while (rows[i].length < width) rows[i].push('');
  }
  return rows;
}

/** 카드·전교 데이터가 함께 쓰는 시트 목록 */
function CARD_SHEETS_() {
  return [
    { key: 'grade',   name: SHEET_GRADE,   keywords: ['내신'] },
    { key: 'target',  name: SHEET_TARGET,  keywords: TARGET_KEYWORDS },
    { key: 'counsel', name: SHEET_COUNSEL, keywords: ['상담'] },
    { key: 'transfer', name: SHEET_TRANSFER, keywords: TRANSFER_KEYWORDS }
  ];
}

function ALL_SHEETS_() {
  var list = CARD_SHEETS_();
  list.push({ key: 'tgrade', name: SHEET_TGRADE, keywords: TGRADE_KEYWORDS });
  MOCK_SHEETS.forEach(function (cfg) {
    list.push({ key: cfg.key, name: cfg.name, keywords: cfg.keywords });
  });
  return list;
}


/* ══════════════════════════════════════════════════════════
   목표등급 시트  (자동 생성)

   선생님이 **아직 시험을 보지 않은 과목**에 미리 적어 두는 목표 등급입니다.
   5등급제 기준이고, 개별 상담 화면의 1차등급·2차등급 칸에서 바로 적습니다.

     반 | 번호 | 이름 | 공통국어1 1차목표 | 공통국어1 2차목표 | 공통국어2 1차목표 | …

   과목당 2칸씩 13과목 = 26칸. 과목 차례는 SUBJECTS 와 같습니다.
   ⚠️ 성적 시트가 아니라 **선생님 메모**입니다. 석차·등급·평균 어디에도 안 들어갑니다.
   ══════════════════════════════════════════════════════════ */

function TG_LEN_() { return SUBJECTS.length * 2; }

/** 목표등급 시트를 찾습니다. create 가 참이면 없을 때 만들어 줍니다. */
function tgradeSheet_(ss, create) {
  var sh = findSheet_(ss, SHEET_TGRADE, TGRADE_KEYWORDS);
  if (sh) return sh;
  if (!create) return null;

  sh = ss.insertSheet(SHEET_TGRADE);
  var head = ['반', '번호', '이름'];
  for (var i = 0; i < SUBJECTS.length; i++) {
    head.push(SUBJECTS[i].name + ' 1차목표');
    head.push(SUBJECTS[i].name + ' 2차목표');
  }
  sh.getRange(1, 1, 1, head.length).setValues([head]);
  sh.setFrozenRows(1);
  return sh;
}


/* ══════════════════════════════════════════════════════════
   전입생_성적 시트

   전입생이 **이전 학교에서 받아 온 성적**을 담습니다.
   한 줄에 「학생 한 명 · 과목 하나」씩 적습니다.

     반 | 번호 | 이름 | 과목 | 환산총점 | 최종등급 | 최종성취도
      5 |  28  | 진강민 | 공통국어1 |  78.5  |    2    |     B

   ⚠️ 이 값은 **우리 학교 석차·등급컷·9등급 환산에 넣지 않습니다.**
      이전 학교에서 받은 등급이라 우리 학교 분포와 섞으면 안 되기 때문입니다.
      (`buildGradeRanks_`·`buildGradeCuts_` 는 내신성적만 읽으므로 자동으로 제외됩니다)

   ⚠️ **내신성적 시트에 그 과목 점수가 있으면 그쪽이 이깁니다.**
      2학기부터는 우리 학교에서 시험을 보므로, 그때는 다른 학생과 똑같이 나옵니다.
   ══════════════════════════════════════════════════════════ */

/** 머리글을 읽어 열 위치를 찾습니다. 못 찾으면 앞에서부터 순서대로 봅니다. */
function analyzeTransferSheet_(values) {
  var fallback = { c: 0, n: 1, nm: 2, subj: 3, total: 4, grade: 5, ach: 6 };
  var result = { startRow: 1, cols: fallback, detected: false };
  if (!values || !values.length) return result;

  // 데이터가 시작되는 줄 = 반·번호가 모두 숫자인 첫 줄
  var start = -1;
  for (var r = 0; r < Math.min(values.length, 6); r++) {
    if (!isNaN(toInt_(values[r][0])) && !isNaN(toInt_(values[r][1]))) { start = r; break; }
  }
  result.startRow = (start === -1) ? 1 : start;
  if (result.startRow === 0) return result;          // 머리글이 없으면 기본 위치

  var head = [];
  var width = 0, w;
  for (w = 0; w < values.length; w++) if (values[w].length > width) width = values[w].length;
  for (var c2 = 0; c2 < width; c2++) {
    var txt = '';
    for (var hr = 0; hr < result.startRow; hr++) txt += String((values[hr] || [])[c2] || '');
    head[c2] = normalize_(txt);
  }

  function find_(words) {
    for (var i = 0; i < head.length; i++) {
      for (var k = 0; k < words.length; k++) {
        if (head[i] && head[i].indexOf(words[k]) !== -1) return i;
      }
    }
    return -1;
  }

  var got = {
    c:     find_(['반']),
    n:     find_(['번호']),
    nm:    find_(['이름', '성명']),
    subj:  find_(['과목']),
    total: find_(['환산']),
    grade: find_(['등급']),
    ach:   find_(['성취'])
  };

  var ok = true;
  for (var k2 in got) { if (got.hasOwnProperty(k2) && got[k2] < 0) ok = false; }
  if (ok) { result.cols = got; result.detected = true; }
  return result;
}

/** 과목 이름을 SUBJECTS 순번으로 바꿉니다. 못 찾으면 -1. */
function transferSubjIndex_(name) {
  var t = normalize_(name);
  if (!t) return -1;
  var i;
  for (i = 0; i < SUBJECTS.length; i++) {           // '공통국어1' 처럼 정확히 적은 경우
    if (normalize_(SUBJECTS[i].name) === t) return i;
  }
  for (i = 0; i < SUBJECTS.length; i++) {           // '공통국어' 처럼 학기를 뺀 경우
    if (SUBJECTS[i].sem === 1 && normalize_(SUBJECTS[i].base) === t) return i;
  }
  for (i = 0; i < SUBJECTS.length; i++) {           // 그 이름을 쓰는 과목이 하나뿐인 경우
    if (normalize_(SUBJECTS[i].base) === t) return i;
  }
  return -1;
}

/** 전입생_성적 시트를 { '반-번호': { 과목순번: {total,grade,ach} } } 로 만듭니다. */
function buildTransferMap_(values) {
  var map = {};
  if (!values || values.length < 2) return map;

  var info = analyzeTransferSheet_(values);
  for (var r = info.startRow; r < values.length; r++) {
    var row = values[r] || [];
    var c = toInt_(row[info.cols.c]), n = toInt_(row[info.cols.n]);
    if (isNaN(c) || isNaN(n) || !n) continue;

    var si = transferSubjIndex_(row[info.cols.subj]);
    if (si < 0) continue;

    var rec = {
      total: cellVal_(row[info.cols.total]),
      grade: cellVal_(row[info.cols.grade]),
      ach:   cellVal_(row[info.cols.ach])
    };
    if (rec.total === null && rec.grade === null && rec.ach === null) continue;

    var key = c + '-' + n;
    if (!map[key]) map[key] = {};
    map[key][si] = rec;
  }
  return map;
}

/** 그 학생의 전입 성적 묶음을 꺼냅니다. 없으면 null. */
function transferOf_(map, cls, num) {
  if (!map) return null;
  return map[cls + '-' + num] || null;
}


/**
 * 내신성적 한 줄에서 과목 하나를 계산합니다.
 * getAll 과 getStudentsByClass 가 **같이** 쓰는 단 하나의 계산 자리입니다.
 * 여기만 고치면 두 화면이 늘 같은 값을 봅니다.
 */
function subjectCalc_(gRow, si, ranks, cuts, tr) {
  var i  = subjStart_(si);
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

  // ── 전입생 : 이전 학교에서 받아 온 성적 ──
  // 우리 학교 시험 점수가 없을 때만 씁니다. 2학기부터는 여기 오지 않습니다.
  o.prev = false;
  var rec = (tr && tr[si]) ? tr[si] : null;
  if (!o.hasAny && rec) {
    o.total  = (rec.total === null || rec.total === undefined) ? '' : rec.total;
    o.fGrade = (rec.grade === null || rec.grade === undefined) ? '' : rec.grade;
    o.fAch   = (rec.ach   === null || rec.ach   === undefined) ? '' : rec.ach;
    o.prev   = true;
    o.hasAny = true;                    // 화면에 보이도록
    o.nt     = toNum_(o.total);

    // 아래는 전부 '우리 학교 전교생 기준' 값이라 전입생에게는 내지 않습니다
    o.pct1 = null; o.pct2 = null; o.pctF = null;
    o.g1nine = null; o.g2nine = null; o.gFnine = null;
    o.upNow = ''; o.upGrade = ''; o.upNeed = ''; o.upBasis = '';
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
  var data = readSheets_(ss, CARD_SHEETS_());      // 시트 3개를 한 번에
  var map = {}, order = [];
  function pick_(n, nm) {
    if (!map[n]) { map[n] = { n: n, nm: nm || (n + '번 학생'), u: '', mj: '', cd: '', cn: 0, a5: null, a9: null }; order.push(n); }
    if (nm && map[n].nm.indexOf('번 학생') > -1) map[n].nm = nm;
    return map[n];
  }

  var trMap = buildTransferMap_(data.transfer);     // 전입생이 이전 학교에서 받아 온 성적

  // 1) 내신성적 — 평균 등급
  var gData = data.grade;
  if (gData) {
    syncSubjectCols_(gData);                        // 과목 열 위치를 머리글로 확인
    var ranks = buildGradeRanks_(gData);
    for (var r = 1; r < gData.length; r++) {
      var gRow = gData[r];
      if (toInt_(gRow[0]) !== cls) continue;
      var gn = toInt_(gRow[1]);
      if (isNaN(gn) || !gn) continue;

      var st = pick_(gn, String(gRow[2] || '').trim());
      var tr = transferOf_(trMap, cls, gn);
      var n5 = 0, s5 = 0, n9 = 0, s9 = 0;
      for (var si = 0; si < SUBJECTS.length; si++) {
        var c = subjectCalc_(gRow, si, ranks, null, tr);
        if (!c.hasAny || c.prev) continue;      // 이전 학교 성적은 평균에 안 넣습니다
        var g5 = toNum_(c.fGrade);
        if (g5 !== null) { s5 += g5; n5++; }
        if (c.gFnine !== null) { s9 += c.gFnine; n9++; }
      }
      st.a5 = n5 ? round_(s5 / n5, 2) : null;
      st.a9 = (n9 && n9 === n5) ? round_(s9 / n9, 2) : null;   // 같은 과목일 때만
    }
  }

  // 2) 학생 목표
  var tData = data.target;
  if (tData) {
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
  var cData = data.counsel;
  if (cData) {
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
  var D_LEN = SUBJECTS.length * 10;   // 계산값
  var TG_LEN = TG_LEN_();             // 목표 등급 (과목당 1차·2차 2칸)
  var M_LEN = MOCK_SUBJECTS.length * 4;

  var data = readSheets_(ss, ALL_SHEETS_());        // 시트 7개를 한 번에

  var index = {}, list = [];

  // 빈 칸은 null 대신 '' 로 보냅니다. 글자 수가 짧아 응답이 20% 넘게 작아집니다.
  // (화면 쪽에서 '' 과 null 을 똑같이 '값 없음' 으로 읽습니다)
  function E_(v) { return (v === null || v === undefined) ? '' : v; }

  function ensure_(c, n, nm) {
    var key = c + '-' + n;
    if (!index[key]) {
      var st = { c: c, n: n, nm: nm || '', u: '', mj: '', cd: '', h: [], hc: [],
                 g: [], d: [], s: ['', '', '', '', ''], tg: [], m: {} };
      var i;
      for (i = 0; i < G_LEN; i++) st.g.push('');
      for (i = 0; i < D_LEN; i++) st.d.push('');
      for (i = 0; i < TG_LEN; i++) st.tg.push('');
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
  var trMap = buildTransferMap_(data.transfer);     // 전입생이 이전 학교에서 받아 온 성적

  var gData = data.grade;
  if (gData) {
    syncSubjectCols_(gData);                        // 과목 열 위치를 머리글로 확인
    var ranks = buildGradeRanks_(gData);
    var cuts  = buildGradeCuts_(gData);

    for (var r = 1; r < gData.length; r++) {
      var gRow = gData[r];
      var gc = toInt_(gRow[0]), gn = toInt_(gRow[1]);
      if (isNaN(gc) || isNaN(gn) || !gn) continue;

      var st = ensure_(gc, gn, String(gRow[2] || '').trim());
      var tr = transferOf_(trMap, gc, gn);
      var acc = { n5: 0, s5: 0, n9: 0, s9: 0, nSc: 0, sSc: 0, nP: 0, sP: 0 };

      for (var si = 0; si < SUBJECTS.length; si++) {
        var base = subjStart_(si);
        for (var f = 0; f < 11; f++) st.g[si * 11 + f] = E_(cellVal_(gRow[base + f]));

        var c = subjectCalc_(gRow, si, ranks, cuts, tr);

        // 전입생 : 이전 학교 성적을 화면이 읽는 자리에 갈아 끼웁니다
        if (c.prev) {
          st.g[si * 11 + 6]  = E_(c.total);
          st.g[si * 11 + 7]  = E_(c.fGrade);
          st.g[si * 11 + 10] = E_(c.fAch);
        }

        var d = si * 10;
        st.d[d + 0] = E_(c.g1nine);
        st.d[d + 1] = E_(c.g2nine);
        st.d[d + 2] = E_(c.gFnine);
        st.d[d + 3] = c.upNow   === '' ? '' : Number(c.upNow);
        st.d[d + 4] = c.upGrade === '' ? '' : Number(c.upGrade);
        st.d[d + 5] = c.upNeed  === '' ? '' : Number(c.upNeed);
        st.d[d + 6] = c.upBasis === '환산총점' ? 1 : (c.upBasis === '1차 점수' ? 2 : 0);
        st.d[d + 7] = c.has1 ? 1 : 0;
        st.d[d + 8] = c.has2 ? 1 : 0;
        st.d[d + 9] = c.prev ? 1 : 0;      // 이전 학교 성적인가

        // 평균은 **우리 학교에서 본 시험만** 으로 냅니다.
        // 전입생이 이전 학교에서 받아 온 성적(c.prev)은 표에는 보이지만 평균에는 안 넣습니다.
        if (c.hasAny && !c.prev) {
          var g5 = toNum_(c.fGrade);
          if (g5 !== null) { acc.s5 += g5; acc.n5++; }
          if (c.gFnine !== null) { acc.s9 += c.gFnine; acc.n9++; }
          if (c.nt !== null) { acc.sSc += c.nt; acc.nSc++; }
          if (c.pctF !== null) { acc.sP += c.pctF; acc.nP++; }
        }
      }

      // 9등급 평균·석차백분율 평균은 **5등급 평균과 같은 과목**을 담을 때만 냅니다.
      // 전입생의 이전 학교 성적은 우리 학교 석차가 없어 9등급·백분율이 빠지는데,
      // 그대로 나란히 두면 「2.14 → 9.00」 처럼 서로 다른 과목 수의 값이 붙어 오해를 부릅니다.
      st.s = [
        acc.n5 || acc.n9,
        acc.n5  ? round_(acc.s5  / acc.n5,  2) : '',
        (acc.n9  && acc.n9  === acc.n5) ? round_(acc.s9  / acc.n9,  2) : '',
        acc.nSc ? round_(acc.sSc / acc.nSc, 1) : '',
        (acc.nP  && acc.nP  === acc.n5) ? round_(acc.sP  / acc.nP,  1) : ''
      ];
    }
  }

  // 2. 학생 목표
  var tData = data.target;
  if (tData) {
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
  var cData = data.counsel;
  if (cData) {
    for (var i3 = 1; i3 < cData.length; i3++) {
      var cRow = cData[i3];
      var cc = toInt_(cRow[0]), cn2 = toInt_(cRow[1]);
      if (isNaN(cc) || isNaN(cn2) || !cn2) continue;
      var st3 = ensure_(cc, cn2, String(cRow[2] || '').trim());
      // 고치기·지우기에 쓰려고 기록마다 '몇 번째 칸인지' 도 같이 보냅니다
      var hist = rowHistory_(cRow);
      st3.cd = hist.cd;
      st3.h  = hist.h;
      st3.hc = hist.hc;
    }
  }

  // 4. 목표등급 (선생님이 적어 둔 메모 — 성적이 아닙니다)
  var tgData = data.tgrade;
  if (tgData) {
    for (var i4 = 1; i4 < tgData.length; i4++) {
      var tgRow = tgData[i4];
      var gc2 = toInt_(tgRow[0]), gn2 = toInt_(tgRow[1]);
      if (isNaN(gc2) || isNaN(gn2) || !gn2) continue;
      var st5 = ensure_(gc2, gn2, String(tgRow[2] || '').trim());
      for (var q = 0; q < TG_LEN; q++) st5.tg[q] = E_(cellVal_(tgRow[3 + q]));
    }
  }

  // 5. 모의고사 (3·6·9·10월)
  MOCK_SHEETS.forEach(function (cfg) {
    var mData = data[cfg.key];
    if (!mData || mData.length < 2) return;

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
    subjectInfo:  subjectMeta_(),
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

/**
 * 목표 등급 한 칸을 저장합니다.
 * 시트가 없으면 만들고, 학생 줄이 없으면 새로 답니다.
 *   si    = 과목 번호 (0부터, SUBJECTS 차례)
 *   phase = 1(1차) 또는 2(2차)
 *   grade = '1'~'5' 또는 빈 값(지우기)
 */
function saveTargetGrade(classNum, studentNum, studentName, si, phase, grade) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, error: '다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.' };
  }

  try {
    var classInt = toInt_(classNum);
    var numInt   = toInt_(studentNum);
    var siInt    = toInt_(si);
    var phInt    = toInt_(phase);

    if (isNaN(classInt) || isNaN(numInt)) return { success: false, error: '반과 번호를 확인해 주세요.' };
    if (isNaN(siInt) || siInt < 0 || siInt >= SUBJECTS.length) return { success: false, error: '과목을 확인해 주세요.' };
    if (phInt !== 1 && phInt !== 2) return { success: false, error: '1차·2차를 확인해 주세요.' };

    var g = String((grade === null || grade === undefined) ? '' : grade).trim();
    if (g !== '' && !/^[1-5]$/.test(g)) {
      return { success: false, error: '목표 등급은 1~5 사이 숫자여야 합니다.' };
    }

    var ss = getSpreadsheet_();
    if (!ss) return { success: false, error: '스프레드시트를 열 수 없습니다.' };

    var sheet = tgradeSheet_(ss, true);
    var col   = 3 + siInt * 2 + (phInt - 1);        // 0부터 셈
    var value = (g === '') ? '' : Number(g);

    var last = sheet.getLastRow();
    var rowIndex = -1;
    if (last >= 2) {
      var keys = sheet.getRange(2, 1, last - 1, 2).getValues();
      for (var i = 0; i < keys.length; i++) {
        if (toInt_(keys[i][0]) === classInt && toInt_(keys[i][1]) === numInt) {
          rowIndex = i + 2;
          break;
        }
      }
    }

    if (rowIndex === -1) {
      var width = 3 + TG_LEN_();
      var fresh = [];
      for (var k = 0; k < width; k++) fresh.push('');
      fresh[0] = classInt;
      fresh[1] = numInt;
      fresh[2] = String(studentName || '');
      fresh[col] = value;
      sheet.appendRow(fresh);
      rowIndex = sheet.getLastRow();
    } else {
      sheet.getRange(rowIndex, col + 1).setValue(value);
    }

    return { success: true, row: rowIndex, grade: g };

  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


/* ══════════════════════════════════════════════════════════
   대학자료 시트 — 정시 결과 (2022~2025)

   선생님이 붙여넣으신 표입니다. 홈페이지는 **네 칸만** 씁니다.
       대학 · 학과 · 연도 · 평균70
   2만 줄이 넘어 통째로 읽으면 느리므로, 머리글로 열을 찾아
   **그 네 열만** 읽습니다. 나머지 열은 건드리지 않습니다.

   같은 대학·학과가 해마다 있으므로 **가장 최근 연도** 한 줄만 씁니다.
   같은 해에 전형이 여럿이면(정시 가·나·다) **더 높은 평균70** 을 씁니다
   — 낮은 쪽을 쓰면 "갈 수 있다"고 잘못 나올 수 있어서입니다.

   보내는 모양 (이름이 수천 번 되풀이되지 않도록 번호로 바꿔 보냅니다)
       { u:[대학 이름들], d:[학과 이름들], r:[[대학번호, 학과번호, 평균70, 연도], …] }
   ══════════════════════════════════════════════════════════ */

/** 0 → 'A', 25 → 'Z', 26 → 'AA' */
function colName_(i) {
  var s = '', n = i + 1;
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** 필요한 열만 골라 읽습니다. 고급 서비스가 켜져 있으면 왕복 한 번. */
function readColumns_(ss, sheet, cols, lastRow) {
  var name = String(sheet.getName());
  var out = [], i;

  if (_batchOK !== false) {
    try {
      var ranges = [];
      for (i = 0; i < cols.length; i++) {
        ranges.push("'" + name.replace(/'/g, "''") + "'!" +
                    colName_(cols[i]) + '2:' + colName_(cols[i]) + lastRow);
      }
      var res = Sheets.Spreadsheets.Values.batchGet(ss.getId(), {
        ranges: ranges,
        valueRenderOption: 'UNFORMATTED_VALUE',
        dateTimeRenderOption: 'FORMATTED_STRING'
      });
      var vr = (res && res.valueRanges) || [];
      if (vr.length === cols.length) {
        for (i = 0; i < cols.length; i++) {
          var vals = vr[i].values || [];
          var flat = [];
          for (var k = 0; k < lastRow - 1; k++) flat.push(vals[k] ? vals[k][0] : '');
          out.push(flat);
        }
        _batchOK = true;
        return out;
      }
    } catch (e) {
      _batchOK = false;
      Logger.log('대학자료를 한 번에 읽지 못해 하나씩 읽습니다: ' + e);
    }
  }

  for (i = 0; i < cols.length; i++) {
    var block = sheet.getRange(2, cols[i] + 1, lastRow - 1, 1).getValues();
    var one = [];
    for (var j = 0; j < block.length; j++) one.push(block[j][0]);
    out.push(one);
  }
  return out;
}


function apiGetUniv_(req, user) {
  var ss = getSpreadsheet_();
  if (!ss) return err_('스프레드시트를 열 수 없습니다.');

  var sheet = findSheet_(ss, SHEET_UNIV, UNIV_KEYWORDS);
  if (!sheet) return ok_({ u: [], d: [], r: [], missing: true });

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return ok_({ u: [], d: [], r: [] });

  // ── 머리글로 열 찾기 ──
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var cU = -1, cD = -1, cY = -1, cP = -1;
  for (var h = 0; h < head.length; h++) {
    var t = normalize_(head[h]);
    if (!t) continue;
    if (cU < 0 && t === '대학') cU = h;
    else if (cD < 0 && t === '학과') cD = h;
    else if (cY < 0 && t === '연도') cY = h;
    else if (cP < 0 && t.indexOf('평균70') === 0) cP = h;
  }
  if (cU < 0 || cD < 0 || cP < 0) {
    return err_("'" + SHEET_UNIV + "' 시트에서 대학·학과·평균70 열을 찾지 못했습니다. " +
                '머리글(1행)에 그 이름이 있는지 확인해 주세요.');
  }

  var want = [cU, cD, cP];
  if (cY >= 0) want.push(cY);
  var got = readColumns_(ss, sheet, want, lastRow);
  var colU = got[0], colD = got[1], colP = got[2], colY = (cY >= 0) ? got[3] : null;

  // ── 대학·학과마다 가장 최근 연도 한 줄만 ──
  var best = {}, uIdx = {}, dIdx = {}, uList = [], dList = [];

  for (var r = 0; r < colU.length; r++) {
    var p = toNum_(colP[r]);
    if (p === null || p < UNIV_MIN || p > UNIV_MAX) continue;

    var uName = String(colU[r] === null || colU[r] === undefined ? '' : colU[r]).trim();
    var dName = String(colD[r] === null || colD[r] === undefined ? '' : colD[r]).trim();
    if (!uName || !dName) continue;

    var y = colY ? toNum_(colY[r]) : null;
    if (y === null) y = 0;

    if (uIdx[uName] === undefined) { uIdx[uName] = uList.length; uList.push(uName); }
    if (dIdx[dName] === undefined) { dIdx[dName] = dList.length; dList.push(dName); }

    var key = uIdx[uName] + '|' + dIdx[dName];
    var cur = best[key];
    if (!cur || y > cur[3] || (y === cur[3] && p > cur[2])) {
      best[key] = [uIdx[uName], dIdx[dName], round_(p, 2), y];
    }
  }

  var rows = [];
  for (var k2 in best) { if (best.hasOwnProperty(k2)) rows.push(best[k2]); }
  rows.sort(function (a, b) { return b[2] - a[2]; });      // 평균70 높은 순

  return ok_({
    u: uList, d: dList, r: rows,
    min: UNIV_MIN, max: UNIV_MAX,
    rowsRead: lastRow - 1,
    updated: nowStr_()
  });
}


/* ══════════════════════════════════════════════════════════
   수시_대학자료 시트 — 선배들의 수시 지원 이력

   한 줄에 「학생 한 명이 어느 대학 어느 학과에 지원해서 어떻게 됐나」 입니다.
   홈페이지는 **일곱 칸만** 씁니다.
       G 대학명 · J 전형 · K 세부유형 · M 모집단위 · R 최종단계 · U 비고 · AG 전교과
   열 위치는 머리글 이름으로 찾고, 못 찾으면 위의 글자 위치를 씁니다.

   ⚠️ **합격한 줄만** 셉니다 (`최종단계` 에 '합격' 이 들어가고 '불합격' 이 아닌 줄).
      불합격자의 등급을 합격선으로 착각하면 안 되기 때문입니다.
   ⚠️ 전교과는 **내신 등급**이라 **숫자가 작을수록 좋습니다** (정시 백분위와 반대).
      1~9 밖의 값은 뜻이 다른 값이라 뺍니다.

   같은 대학·모집단위에 합격자가 여럿이면 **합격자 평균**을 그 학과의 점수로 씁니다
   (2026.09 사용자 결정).

   보내는 모양
       { u:[대학], d:[모집단위], t:[전형 표시],
         r:[[대학번호, 학과번호, 전교과평균, 합격인원, 전형번호(-1이면 여러 전형)], …] }
   `r` 은 **전교과 오름차순**(좋은 대학부터)으로 정렬해 보냅니다.
   ══════════════════════════════════════════════════════════ */

// 머리글을 못 찾았을 때 쓸 기본 열 위치 (0부터 셈)
var SUSI_COL_FALLBACK = { uni: 6, jh: 9, sub: 10, dept: 12, res: 17, memo: 20, gr: 32 };

/* 합격 연도를 어디서 읽을까 — 앞쪽부터 먼저 찾습니다 */
var SUSI_YEAR_HEADS_ = ['연도', '년도', '학년도', '합격연도', '합격년도', '지원연도', '입학연도'];
var SUSI_DATE_HEADS_ = ['합격자발표', '최종발표', '발표일', '면접일자', '논술일자', '실기일자', '적성일자'];
var SUSI_YEAR_MAX_COLS_ = 6;   // 너무 많이 읽으면 느려지므로 앞의 여섯 칸까지만
                               // (E열 1 + 날짜 칸 5)

/* E열(왼쪽에서 다섯 번째)에 합격 연도가 적혀 있습니다 — 2026.09 사용자 지시.
   `2025` 처럼 연도만 적힌 줄도, `2025-10` 처럼 월까지 적힌 줄도 있어서
   머리글 이름을 보지 않고 **늘 가장 먼저** 이 칸에서 연도만 뽑습니다.
   이 칸에서 연도가 안 나오면 아래의 연도 칸·날짜 칸으로 넘어갑니다. */
var SUSI_YEAR_COL_FIXED_ = 4;

/* 한 대학·모집단위에 전형이 여러 가지면 몇 개까지 보낼지 */
var SUSI_JH_MAX_ = 8;

/* 이 Code.gs 의 버전. 화면(index.html)의 PAGE_VER 와 짝이 맞아야 합니다.
   「고쳤는데 화면이 그대로다」 의 원인은 거의 늘 새 버전 배포를 안 한 것이라,
   ping 응답에 실어 보내 화면이 스스로 알아채게 합니다. */
var APP_VER = '2026-09-22c';

/**
 * 아무 칸에서나 4자리 연도를 뽑아냅니다.
 * 날짜 칸은 시트를 어떻게 읽었느냐에 따라 Date 로도, '2025-12-15' 같은 글자로도 옵니다.
 * 못 찾으면 0.
 */
function susiYear_(v) {
  if (v === null || v === undefined || v === '') return 0;
  if (Object.prototype.toString.call(v) === '[object Date]') {
    var y = v.getFullYear();
    return (y >= 1990 && y <= 2100) ? y : 0;
  }
  var t = String(v).trim();
  if (/^[0-9]{4}$/.test(t)) {
    var n = parseInt(t, 10);
    return (n >= 1990 && n <= 2100) ? n : 0;
  }
  var m = t.match(/(?:19|20)[0-9]{2}/);
  return m ? parseInt(m[0], 10) : 0;
}


/* 충원(추가)합격을 뜻하는 말들. `합격` 이 같이 붙어 있어도 이쪽이 먼저입니다. */
var SUSI_ADD_WORDS_ = ['충원', '추합', '추가', '예비'];

/**
 * 합격한 줄이 **최초합격**인지 **충원합격(추합)**인지 가려냅니다.
 * 시트마다 적는 말이 달라서(합격 · 합 · 충원합격 · 추합 · 추가합격 …) 글자를 섞어 봅니다.
 *   ''      → 합격이 아님 (불합격 · 빈칸 …)
 *   'add'   → 충원합격(추합)
 *   'first' → 최초합격
 */
function susiPassKind_(v) {
  if (!susiPass_(v)) return '';
  var t = normalize_(v);
  for (var i = 0; i < SUSI_ADD_WORDS_.length; i++) {
    if (t.indexOf(SUSI_ADD_WORDS_[i]) !== -1) return 'add';
  }
  return 'first';
}


/**
 * `최종단계` 글자가 '합격' 을 뜻하는가.
 * 시트마다 적는 말이 달라서 (합격 · 충원합격 · 합 · 추합 …) 넓게 받습니다.
 * '불합' 이 들어가면 무조건 아닙니다.
 */
var SUSI_PASS_WORDS_ = ['합', '추합', '충원합', '최초합', '추가합', '정시합'];

function susiPass_(v) {
  var t = normalize_(v);
  if (!t) return false;
  if (t.indexOf('불합') !== -1) return false;   // 불합격 · 1단계불합격
  if (t.indexOf('합격') !== -1) return true;    // 합격 · 충원합격 · 추가합격 · 최초합격
  return SUSI_PASS_WORDS_.indexOf(t) !== -1;    // 합 · 추합 · 충원합 …
}


function apiGetSusi_(req, user) {
  var ss = getSpreadsheet_();
  if (!ss) return err_('스프레드시트를 열 수 없습니다.');

  var sheet = findSheet_(ss, SHEET_SUSI, SUSI_KEYWORDS);
  if (!sheet) return ok_({ u: [], d: [], t: [], r: [], missing: true });

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 2) return ok_({ u: [], d: [], t: [], r: [] });

  // ── 머리글로 열 찾기 ──
  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var c = { uni: -1, jh: -1, sub: -1, dept: -1, res: -1, memo: -1, gr: -1 };
  for (var h = 0; h < head.length; h++) {
    var t = normalize_(head[h]);
    if (!t) continue;
    if      (c.uni  < 0 && t === '대학명')   c.uni  = h;
    else if (c.jh   < 0 && t === '전형')     c.jh   = h;
    else if (c.sub  < 0 && t === '세부유형') c.sub  = h;
    else if (c.dept < 0 && t === '모집단위') c.dept = h;
    else if (c.res  < 0 && t === '최종단계') c.res  = h;
    else if (c.memo < 0 && t === '비고')     c.memo = h;
    else if (c.gr   < 0 && t === '전교과')   c.gr   = h;
  }
  var guessed = [];
  var keys = ['uni', 'jh', 'sub', 'dept', 'res', 'memo', 'gr'];
  for (var k = 0; k < keys.length; k++) {
    if (c[keys[k]] < 0) { c[keys[k]] = SUSI_COL_FALLBACK[keys[k]]; guessed.push(keys[k]); }
  }

  // 합격 연도 — 연도 칸이 있으면 그것을, 없으면 날짜 칸에서 뽑습니다. 둘 다 없으면 안 보여 줍니다.
  // ⚠️ 줄마다 채워 둔 날짜 칸이 달라서 **여러 칸을 찾아 두고 줄마다 앞에서부터** 봅니다.
  var yCols = findSusiYearCols_(head);
  if (c.uni >= lastCol || c.dept >= lastCol || c.gr >= lastCol) {
    return err_("'" + SHEET_SUSI + "' 시트에서 대학명·모집단위·전교과 열을 찾지 못했습니다. " +
                '머리글(1행)에 그 이름이 있는지 확인해 주세요.');
  }

  var want = [c.uni, c.dept, c.gr, c.res, c.jh, c.sub];
  var yi;
  for (yi = 0; yi < yCols.length; yi++) want.push(yCols[yi].col);
  var got  = readColumns_(ss, sheet, want, lastRow);
  var colU = got[0], colD = got[1], colG = got[2], colR = got[3], colJ = got[4], colS = got[5];
  var colY = [];
  for (yi = 0; yi < yCols.length; yi++) colY.push(got[6 + yi]);

  var box = {}, uIdx = {}, dIdx = {}, tIdx = {}, uList = [], dList = [], tList = [];
  var stat = { used: 0, first: 0, add: 0, noRes: 0, notPass: 0, noGrade: 0, badGrade: 0,
               noName: 0, withYear: 0, res: {} };

  function txt(v) { return String(v === null || v === undefined ? '' : v).trim(); }

  for (var r = 0; r < colU.length; r++) {
    var res = txt(colR[r]);
    noteRes_(stat.res, res);
    if (!res)            { stat.noRes++;   continue; }   // 최종단계가 비어 있음
    var kind = susiPassKind_(res);
    if (!kind)           { stat.notPass++; continue; }   // 불합격 등

    var g = toNum_(colG[r]);
    if (g === null)                   { stat.noGrade++;  continue; }   // 전교과가 비어 있음
    if (g < SUSI_MIN || g > SUSI_MAX) { stat.badGrade++; continue; }   // 1~9 밖

    var uName = txt(colU[r]), dName = txt(colD[r]);
    if (!uName || !dName) { stat.noName++; continue; }
    stat.used++;

    if (uIdx[uName] === undefined) { uIdx[uName] = uList.length; uList.push(uName); }
    if (dIdx[dName] === undefined) { dIdx[dName] = dList.length; dList.push(dName); }

    var label = txt(colJ[r]);
    var sub2  = txt(colS[r]);
    if (sub2 && sub2 !== label) label = label ? (label + '(' + sub2 + ')') : sub2;
    if (label && tIdx[label] === undefined) { tIdx[label] = tList.length; tList.push(label); }
    var ti = label ? tIdx[label] : -1;

    var key = uIdx[uName] + '|' + dIdx[dName];
    if (!box[key]) box[key] = { u: uIdx[uName], d: dIdx[dName], sum: 0, n: 0,
                                nf: 0, na: 0, ts: {}, y0: 0, y1: 0 };
    var o = box[key];
    o.sum += g; o.n++;
    if (kind === 'add') { o.na++; stat.add++; } else { o.nf++; stat.first++; }
    var yr = susiRowYear_(colY, r);
    if (yr) {
      if (!o.y0 || yr < o.y0) o.y0 = yr;
      if (yr > o.y1) o.y1 = yr;
      stat.withYear++;
    }
    // 전형은 **모두** 모읍니다 (몇 명이 그 전형으로 붙었는지도 같이 셉니다)
    if (ti !== -1) o.ts[ti] = (o.ts[ti] || 0) + 1;
  }

  var rows = [];
  for (var key2 in box) {
    if (!box.hasOwnProperty(key2)) continue;
    var b = box[key2];
    rows.push([b.u, b.d, round_(b.sum / b.n, 2), b.n, tListOf_(b.ts), b.y0, b.y1, b.nf, b.na]);
  }
  rows.sort(function (x, y) { return x[2] - y[2]; });    // 등급은 낮을수록 좋습니다

  return ok_({
    u: uList, d: dList, t: tList, r: rows,
    min: SUSI_MIN, max: SUSI_MAX,
    rowsRead: lastRow - 1,
    guessed: guessed,
    ver: APP_VER,
    yearCols: yearColNames_(yCols),
    stat: stat,
    updated: nowStr_()
  });
}


/**
 * 합격 연도를 읽을 열을 찾습니다.
 * ① `연도`·`학년도` 처럼 연도 칸이 있으면 그것을 씁니다.
 * ② 없으면 `합격자발표`·`면접일자` 같은 날짜 칸에서 연도만 뽑아 씁니다.
 * 둘 다 없으면 col = -1 (화면에 연도를 안 보여 줍니다).
 */
function findSusiYearCols_(head) {
  var i, h, w, L, out = [], seen = {};

  // ① E열 — 머리글이 무엇이든 늘 먼저 봅니다
  if (SUSI_YEAR_COL_FIXED_ < head.length) {
    seen[SUSI_YEAR_COL_FIXED_] = true;
    out.push({ col:  SUSI_YEAR_COL_FIXED_,
               name: String(head[SUSI_YEAR_COL_FIXED_] || '').trim() || '(머리글 없음)',
               byDate: false, fixed: true });
  }

  // ② 그 다음 머리글로 찾은 연도 칸 → 날짜 칸
  var lists = [SUSI_YEAR_HEADS_, SUSI_DATE_HEADS_];
  for (L = 0; L < lists.length; L++) {
    for (w = 0; w < lists[L].length; w++) {
      for (i = 0; i < head.length; i++) {
        h = normalize_(head[i]);
        if (h && h === lists[L][w] && !seen[i]) {
          seen[i] = true;
          out.push({ col: i, name: String(head[i]).trim(), byDate: (L === 1) });
        }
      }
    }
  }
  return out.slice(0, SUSI_YEAR_MAX_COLS_);
}


/**
 * 한 줄의 합격 연도 — 찾아 둔 칸을 **앞에서부터 차례로** 봐서
 * 처음으로 연도가 나오는 칸을 씁니다. 줄마다 채워 둔 날짜가 달라서입니다.
 * (예: 어떤 줄은 합격자발표만, 어떤 줄은 면접일자만 적혀 있음)
 */
function susiRowYear_(colY, r) {
  if (!colY) return 0;
  for (var i = 0; i < colY.length; i++) {
    var y = susiYear_(colY[i][r]);
    if (y) return y;
  }
  return 0;
}


/**
 * 그 대학·모집단위에 붙은 전형들을 **많이 붙은 순**으로 늘어놓습니다.
 * 예전에는 여러 가지면 -1 을 보내 화면에 「전형 여러 가지」라고만 나왔는데,
 * 2026.09 사용자 요청으로 **전형 이름을 그대로** 보냅니다.
 * 너무 길어지지 않게 앞의 SUSI_JH_MAX_(8)개까지만.
 */
function tListOf_(ts) {
  var arr = [], k;
  for (k in ts) { if (ts.hasOwnProperty(k)) arr.push([parseInt(k, 10), ts[k]]); }
  arr.sort(function (a, b) { return (b[1] - a[1]) || (a[0] - b[0]); });
  var out = [];
  for (var i = 0; i < arr.length && i < SUSI_JH_MAX_; i++) out.push(arr[i][0]);
  return out;
}


/** 연도를 읽을 칸들의 머리글 이름만 뽑습니다 */
function yearColNames_(yCols) {
  var out = [];
  for (var i = 0; i < yCols.length; i++) out.push(yCols[i].name);
  return out;
}


/** 최종단계에 어떤 말이 몇 번 적혀 있는지 세어 둡니다 (진단용) */
function noteRes_(bag, text) {
  var t = String(text === null || text === undefined ? '' : text).trim();
  if (!t) t = '(빈칸)';
  if (bag[t] === undefined && countKeys_(bag) >= 40) return;   // 너무 많으면 그만
  bag[t] = (bag[t] || 0) + 1;
}


function apiSaveTargetGrade_(req, user) {
  var res = saveTargetGrade(req.classNum, req.studentNum, req.studentName,
                            req.subjectIndex, req.phase, req.grade);
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

  // '필요' 열 개수가 과목 수보다 적을 수 있습니다.
  // (예: 정보는 2학기에만 보는 과목이라 이 시트에는 아직 없을 수 있습니다)
  // 찾은 개수만큼 앞에서부터 맞추고, 남는 과목은 '없음'(-1) 으로 둡니다.
  if (needCols.length >= 1 && needCols.length <= SUBJECTS.length) {
    for (var i = 0; i < SUBJECTS.length; i++) {
      if (i < needCols.length) {
        result.cols.push({ s: needCols[i] - 2, g: needCols[i] - 1, need: needCols[i] });
      } else {
        result.cols.push({ s: -1, g: -1, need: -1 });
      }
    }
    result.how = "머리글의 '필요' 열 " + needCols.length + '개로 자동 인식' +
                 (needCols.length < SUBJECTS.length
                   ? ' (과목 ' + SUBJECTS.length + '개 중 뒤 ' +
                     (SUBJECTS.length - needCols.length) + '개는 이 시트에 없음)'
                   : '');
    result.detected = true;
  } else {
    for (var j = 0; j < SUBJECTS.length; j++) {
      var base = GOAL_START_COL + j * GOAL_PER_SUBJ;
      if (base + 2 < width) {
        result.cols.push({ s: base, g: base + 1, need: base + 2 });
      } else {
        result.cols.push({ s: -1, g: -1, need: -1 });   // 시트에 그 과목 칸이 없음
      }
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
    var i = subjStart_(si);
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
    var i = subjStart_(si);
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
      syncSubjectCols_(gData);                      // 과목 열 위치를 머리글로 확인
      var ranks = buildGradeRanks_(gData);          // 전교생 기준 석차백분율 변환기
      var cuts  = buildGradeCuts_(gData);           // 전교생 기준 과목별 등급컷

      var trSheet = findSheet_(ss, SHEET_TRANSFER, TRANSFER_KEYWORDS);
      var trMap2  = trSheet ? buildTransferMap_(trSheet.getDataRange().getValues()) : {};

      for (var r = 1; r < gData.length; r++) {
        var gRow = gData[r];
        var gClass = toInt_(gRow[0]);
        var gNum = toInt_(gRow[1]);
        if (gClass !== classInt || isNaN(gNum) || !gNum) continue;

        var stu = ensureStudent(gNum, String(gRow[2] || '').trim());
        stu.schoolGrades = [];

        // 평균 계산용 누적값
        var acc = { n5: 0, s5: 0, n9: 0, s9: 0, nSc: 0, sSc: 0, nP: 0, sP: 0 };

        var tr2 = transferOf_(trMap2, gClass, gNum);
        SUBJECTS.forEach(function (subj, si) {
          // 계산은 subjectCalc_ 한 곳에서만 합니다 (getAll 과 같은 값)
          var c = subjectCalc_(gRow, si, ranks, cuts, tr2);

          if (c.hasAny) {
            var g5 = toNum_(c.fGrade);
            if (g5 !== null) { acc.s5 += g5; acc.n5++; }
            if (c.gFnine !== null) { acc.s9 += c.gFnine; acc.n9++; }
            if (c.nt !== null) { acc.sSc += c.nt; acc.nSc++; }
            if (c.pctF !== null) { acc.sP += c.pctF; acc.nP++; }
          }

          stu.schoolGrades.push({
            subject: subjLabel_(si),
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
            prevSchool: c.prev,          // 이전 학교에서 받아 온 성적인가

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
 * '내신성적' 시트에서 과목이 몇 번째 열부터 시작하는지 확인합니다.
 *
 *  ★ '정보' 과목을 2학기에 새로 넣은 뒤에는 이 함수를 한 번 실행해 주세요.
 *
 *  Apps Script 편집기 위쪽 함수 목록에서 check내신시트 를 고르고
 *  ▷실행 을 누른 뒤, 아래 '실행 로그'에 나온 내용을 알려 주세요.
 */
function check내신시트() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  var sheet = findSheet_(ss, SHEET_GRADE, ['내신']);
  if (!sheet) { Logger.log("❌ '내신성적' 시트를 찾지 못했습니다."); return; }

  var v = sheet.getDataRange().getValues();
  Logger.log('✅ 시트를 찾았습니다: [' + sheet.getName() + ']');
  Logger.log('   전체 ' + v.length + '행 / ' + (v[0] ? v[0].length : 0) + '열');
  Logger.log('   과목 ' + SUBJECTS.length + '개 × 11칸 = ' + (3 + SUBJECTS.length * 11) + '열이면 딱 맞습니다.');
  Logger.log('');

  var detected = detectSubjectCols_(v);
  syncSubjectCols_(v);

  Logger.log('── 인식 방법 ──');
  if (detected) {
    Logger.log('   ✅ 시트 머리글에서 과목 ' + SUBJECTS.length + '개를 모두 찾았습니다.');
    Logger.log('      (과목을 중간에 끼워 넣어도 자동으로 따라갑니다)');
  } else {
    Logger.log('   ⚠️ 머리글에서 과목 이름을 찾지 못해 기본 위치를 씁니다.');
    Logger.log('      과목을 중간에 끼워 넣으셨다면 값이 밀려 나올 수 있습니다.');
    Logger.log('      이 줄이 보이면 알려 주세요.');
  }
  Logger.log('');

  Logger.log('── 과목별 시작 열 ──');
  for (var i = 0; i < SUBJECTS.length; i++) {
    var c = subjStart_(i);
    var head = (v[0] && v[0][c] !== undefined) ? String(v[0][c]) : '';
    var exists = (v[0] && v[0].length > c + 10);
    Logger.log('   ' + SUBJECTS[i].name +
               ' (' + SUBJECTS[i].sem + '학기)' +
               ' → ' + colLetter_(c) +
               ' / 머리글 "' + head + '"' +
               (exists ? '' : '  ⚠️ 시트에 이 칸이 아직 없습니다(화면에는 미입력으로 나옵니다)'));
  }
  Logger.log('');

  var first = -1;
  for (var r = 0; r < v.length; r++) {
    if (!isNaN(toInt_(v[r][0])) && !isNaN(toInt_(v[r][1])) && toInt_(v[r][1])) { first = r; break; }
  }
  if (first >= 0) {
    Logger.log('── 첫 학생 줄로 실제 읽어 본 값 ──');
    var row = v[first];
    Logger.log('   ' + row[0] + '반 ' + row[1] + '번 ' + row[2]);
    for (var j = 0; j < SUBJECTS.length; j++) {
      var b = subjStart_(j);
      Logger.log('   ' + SUBJECTS[j].name +
                 ' → 1차 ' + cellText_(row, b + 0) +
                 ' / 2차 ' + cellText_(row, b + 2) +
                 ' / 환산총점 ' + cellText_(row, b + 6) +
                 ' / 최종등급 ' + cellText_(row, b + 7));
    }
  }
}


/**
 * '전입생_성적' 시트를 어떻게 읽고 있는지 확인합니다.
 *
 *  Apps Script 편집기 위쪽 함수 목록에서 check전입생시트 를 고르고
 *  ▷실행 을 누른 뒤, 아래 '실행 로그'에 나온 내용을 알려 주세요.
 */
function check전입생시트() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  var sheet = findSheet_(ss, SHEET_TRANSFER, TRANSFER_KEYWORDS);
  if (!sheet) {
    Logger.log("ℹ️ '" + SHEET_TRANSFER + "' 시트가 없습니다.");
    Logger.log('   전입생이 없으면 이대로 두셔도 됩니다. 홈페이지는 그대로 동작합니다.');
    return;
  }

  var v = sheet.getDataRange().getValues();
  Logger.log('✅ 시트를 찾았습니다: [' + sheet.getName() + ']');
  Logger.log('   전체 ' + v.length + '행 / ' + (v[0] ? v[0].length : 0) + '열');
  Logger.log('');

  var info = analyzeTransferSheet_(v);
  Logger.log('── 열 인식 ──');
  Logger.log('   ' + (info.detected ? '✅ 머리글로 자동 인식' : '⚠️ 머리글을 못 읽어 기본 순서(반·번호·이름·과목·환산총점·최종등급·최종성취도)를 씁니다'));
  Logger.log('   데이터 시작: ' + (info.startRow + 1) + '행');
  Logger.log('   반 ' + colLetter_(info.cols.c) + ' / 번호 ' + colLetter_(info.cols.n) +
             ' / 이름 ' + colLetter_(info.cols.nm) + ' / 과목 ' + colLetter_(info.cols.subj));
  Logger.log('   환산총점 ' + colLetter_(info.cols.total) + ' / 최종등급 ' + colLetter_(info.cols.grade) +
             ' / 최종성취도 ' + colLetter_(info.cols.ach));
  Logger.log('');

  Logger.log('── 줄마다 어떻게 읽었나 ──');
  var bad = 0;
  for (var r = info.startRow; r < v.length; r++) {
    var row = v[r];
    var c = toInt_(row[info.cols.c]), n = toInt_(row[info.cols.n]);
    if (isNaN(c) || isNaN(n) || !n) continue;
    var raw = String(row[info.cols.subj] || '');
    var si = transferSubjIndex_(raw);
    if (si < 0) {
      bad++;
      Logger.log('   ❌ ' + (r + 1) + '행  ' + c + '반 ' + n + '번  과목 "' + raw + '" → 못 알아봤습니다');
    } else {
      Logger.log('   ✅ ' + (r + 1) + '행  ' + c + '반 ' + n + '번 ' + String(row[info.cols.nm] || '') +
                 '  ' + raw + ' → ' + SUBJECTS[si].name +
                 '  환산 ' + cellText_(row, info.cols.total) +
                 ' / 등급 ' + cellText_(row, info.cols.grade) +
                 ' / 성취도 ' + cellText_(row, info.cols.ach));
    }
  }
  Logger.log('');

  var map = buildTransferMap_(v);
  var who = [];
  for (var k in map) { if (map.hasOwnProperty(k)) who.push(k + '(' + countKeys_(map[k]) + '과목)'); }
  Logger.log('── 정리 ──');
  Logger.log('   전입생 ' + who.length + '명 : ' + (who.join(' · ') || '없음'));
  if (bad) Logger.log('   ⚠️ 과목 이름을 못 알아본 줄이 ' + bad + '개 있습니다. 내신성적 시트의 과목명과 똑같이 적어 주세요.');
  Logger.log('');
  Logger.log('※ 이 값은 우리 학교 석차·등급컷·9등급 환산에 넣지 않습니다.');
  Logger.log('※ 내신성적 시트에 그 과목 시험 점수가 들어오면(2학기) 그쪽이 이깁니다.');
}

/**
 * `수시_대학자료` 시트를 어떻게 읽고 있는지 보여 줍니다.
 * Apps Script 편집기에서 이 함수를 골라 [실행] → 아래 '실행 기록' 을 보세요.
 * ⚠️ 보기만 합니다. 시트를 고치지 않습니다.
 */
function check수시시트() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  var sheet = findSheet_(ss, SHEET_SUSI, SUSI_KEYWORDS);
  if (!sheet) {
    Logger.log("❌ '" + SHEET_SUSI + "' 시트를 찾지 못했습니다. 탭 이름을 확인해 주세요.");
    return;
  }

  var lastRow = sheet.getLastRow(), lastCol = sheet.getLastColumn();
  Logger.log('✅ 시트를 찾았습니다: [' + sheet.getName() + ']  ' + lastRow + '행 / ' + lastCol + '열');
  if (lastRow < 2) { Logger.log('   자료가 없습니다.'); return; }

  var head = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var c = { uni: -1, jh: -1, sub: -1, dept: -1, res: -1, memo: -1, gr: -1 };
  for (var h = 0; h < head.length; h++) {
    var t = normalize_(head[h]);
    if (!t) continue;
    if      (c.uni  < 0 && t === '대학명')   c.uni  = h;
    else if (c.jh   < 0 && t === '전형')     c.jh   = h;
    else if (c.sub  < 0 && t === '세부유형') c.sub  = h;
    else if (c.dept < 0 && t === '모집단위') c.dept = h;
    else if (c.res  < 0 && t === '최종단계') c.res  = h;
    else if (c.memo < 0 && t === '비고')     c.memo = h;
    else if (c.gr   < 0 && t === '전교과')   c.gr   = h;
  }
  var label = { uni: '대학명', jh: '전형', sub: '세부유형', dept: '모집단위',
                res: '최종단계', memo: '비고', gr: '전교과' };
  var keys = ['uni', 'dept', 'gr', 'res', 'jh', 'sub', 'memo'];

  Logger.log('');
  Logger.log('── 어느 열을 읽고 있나 ──');
  for (var k = 0; k < keys.length; k++) {
    var key = keys[k], byHead = c[key] >= 0;
    if (!byHead) c[key] = SUSI_COL_FALLBACK[key];
    Logger.log('   ' + (byHead ? '✅' : '⚠️') + ' ' + label[key] + ' → ' + colLetter_(c[key]) +
               '  (머리글 "' + String(head[c[key]] || '(빈칸)') + '")' +
               (byHead ? '' : '  ← 머리글을 못 찾아 정해 둔 자리를 씁니다'));
  }

  var yCols = findSusiYearCols_(head);
  Logger.log('');
  Logger.log('── 합격 연도를 어디서 읽나 ──');
  if (!yCols.length) {
    Logger.log('   ⚠️ 연도 칸도 날짜 칸도 없습니다 → 화면에 연도를 안 보여 줍니다.');
    Logger.log('      머리글에 「연도」 칸을 하나 만들어 2025 처럼 적으시면 바로 나옵니다.');
  } else {
    Logger.log('   줄마다 아래 차례로 보고, 처음 연도가 나오는 칸을 씁니다.');
    for (var yj = 0; yj < yCols.length; yj++) {
      Logger.log('   ' + (yj + 1) + '. ' + colLetter_(yCols[yj].col) + '  (머리글 "' + yCols[yj].name + '")' +
                 (yCols[yj].fixed ? '  ← 늘 여기를 먼저 봅니다'
                                  : (yCols[yj].byDate ? '  ← 날짜에서 연도만 뽑음' : '  ← 연도 칸')));
    }
  }

  var want = [c.uni, c.dept, c.gr, c.res, c.jh, c.sub];
  var yk;
  for (yk = 0; yk < yCols.length; yk++) want.push(yCols[yk].col);
  var got  = readColumns_(ss, sheet, want, lastRow);
  var colU = got[0], colD = got[1], colG = got[2], colR = got[3];
  var colY = [];
  for (yk = 0; yk < yCols.length; yk++) colY.push(got[6 + yk]);

  if (yCols.length) {
    Logger.log('   ── 그 칸에 실제로 적힌 값 (앞의 세 개) ──');
    for (yk = 0; yk < yCols.length; yk++) {
      var peek = [], pn = 0;
      for (var pr = 0; pr < colY[yk].length && pn < 3; pr++) {
        var pv = colY[yk][pr];
        if (pv === null || pv === undefined || String(pv).trim() === '') continue;
        peek.push('"' + String(pv).trim() + '" → ' + (susiYear_(pv) || '연도 없음'));
        pn++;
      }
      Logger.log('      ' + colLetter_(yCols[yk].col) + ' : ' + (peek.join('  /  ') || '(전부 비어 있음)'));
    }
  }

  Logger.log('');
  Logger.log('── 최종단계(' + colLetter_(c.res) + ')에 적힌 말 ──');
  var bag = {};
  for (var r = 0; r < colR.length; r++) noteRes_(bag, colR[r]);
  var words = [];
  for (var w in bag) { if (bag.hasOwnProperty(w)) words.push([w, bag[w]]); }
  words.sort(function (a, b) { return b[1] - a[1]; });
  for (var i = 0; i < words.length; i++) {
    var kd = susiPassKind_(words[i][0]);
    Logger.log('   ' + (kd === 'add'   ? '✅ 추합(충원)으로 셈'
                      : kd === 'first' ? '✅ 최초합격으로 셈  '
                                       : '⛔ 안 셈            ') +
               '  "' + words[i][0] + '"  ' + words[i][1] + '줄');
  }

  Logger.log('');
  Logger.log('── 줄마다 왜 빠졌나 ──');
  var st = { used: 0, first: 0, add: 0, noRes: 0, notPass: 0, noGrade: 0, badGrade: 0,
             noName: 0, withYear: 0, noYearEx: [] };
  var byCol = {};
  var ex = { noGrade: [], badGrade: [], noName: [] };
  for (var r2 = 0; r2 < colU.length; r2++) {
    var line = r2 + 2;
    var res = String(colR[r2] === null || colR[r2] === undefined ? '' : colR[r2]).trim();
    if (!res)  { st.noRes++; continue; }
    var kd2 = susiPassKind_(res);
    if (!kd2)  { st.notPass++; continue; }
    var g = toNum_(colG[r2]);
    if (g === null) {
      st.noGrade++;
      if (ex.noGrade.length < 5) ex.noGrade.push(line + '행 ' + String(colU[r2] || '') + ' ' + String(colD[r2] || ''));
      continue;
    }
    if (g < SUSI_MIN || g > SUSI_MAX) {
      st.badGrade++;
      if (ex.badGrade.length < 5) ex.badGrade.push(line + '행 ' + String(colU[r2] || '') + ' → ' + g);
      continue;
    }
    var uName = String(colU[r2] || '').trim(), dName = String(colD[r2] || '').trim();
    if (!uName || !dName) {
      st.noName++;
      if (ex.noName.length < 5) ex.noName.push(line + '행 대학"' + uName + '" 모집단위"' + dName + '"');
      continue;
    }
    st.used++;
    if (kd2 === 'add') st.add++; else st.first++;
    var yrHit = -1;
    for (yk = 0; yk < colY.length; yk++) { if (susiYear_(colY[yk][r2])) { yrHit = yk; break; } }
    if (yrHit >= 0) { st.withYear++; byCol[yrHit] = (byCol[yrHit] || 0) + 1; }
    else if (st.noYearEx.length < 5) st.noYearEx.push((r2 + 2) + '행 ' + String(colU[r2] || '') + ' ' + String(colD[r2] || ''));
  }
  Logger.log('   ✅ 화면에 쓰는 줄          ' + st.used + '줄' +
             '  (최초합격 ' + st.first + '줄 · 추합 ' + st.add + '줄)');
  Logger.log('   📅 그중 연도를 읽은 줄     ' + st.withYear + '줄' +
             (st.used ? '  (연도 없는 줄 ' + (st.used - st.withYear) + '줄)' : ''));
  for (yk = 0; yk < yCols.length; yk++) {
    Logger.log('        · ' + colLetter_(yCols[yk].col) + ' "' + yCols[yk].name + '" 로 읽은 줄  ' +
               (byCol[yk] || 0) + '줄');
  }
  if (st.noYearEx.length) {
    Logger.log('        ⚠️ 연도를 못 읽은 줄 예) ' + st.noYearEx.join(' / '));
    Logger.log('           → 그 줄에는 날짜가 하나도 안 적혀 있습니다.');
    Logger.log('             머리글에 「연도」 칸을 만들어 2025 처럼 적으시면 확실합니다.');
  }
  Logger.log('   ⛔ 최종단계가 빈칸         ' + st.noRes + '줄');
  Logger.log('   ⛔ 합격이 아님(불합격 등)  ' + st.notPass + '줄');
  Logger.log('   ⛔ 전교과가 비어 있음      ' + st.noGrade + '줄' +
             (ex.noGrade.length ? '   예) ' + ex.noGrade.join(' / ') : ''));
  Logger.log('   ⛔ 전교과가 1~9 밖         ' + st.badGrade + '줄' +
             (ex.badGrade.length ? '   예) ' + ex.badGrade.join(' / ') : ''));
  Logger.log('   ⛔ 대학명·모집단위가 빈칸  ' + st.noName + '줄' +
             (ex.noName.length ? '   예) ' + ex.noName.join(' / ') : ''));

  Logger.log('');
  Logger.log('── 맨 아래 다섯 줄을 그대로 보여 드립니다 ──');
  for (var r3 = Math.max(0, colU.length - 5); r3 < colU.length; r3++) {
    Logger.log('   ' + (r3 + 2) + '행  대학"' + String(colU[r3] || '') + '"  모집단위"' + String(colD[r3] || '') +
               '"  최종단계"' + String(colR[r3] || '') + '"  전교과"' + String(colG[r3] || '') + '"' +
               (colY.length ? '  연도"' + (susiRowYear_(colY, r3) || '') + '"' : ''));
  }
  Logger.log('');
  Logger.log('※ 화면에 나오려면 ① 최종단계가 합격 ② 전교과가 1~9 ③ 대학명·모집단위가 있어야 합니다.');
}


function countKeys_(o) {
  var n = 0;
  for (var k in o) { if (o.hasOwnProperty(k)) n++; }
  return n;
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


/* ══════════════════════════════════════════════════════════
   수식 점검  (수식을 고치지는 않습니다. 보기만 합니다)

   Apps Script 편집기 위쪽 함수 목록에서 [수식점검] 을 고르고 ▷실행 하면
   아래 '실행 로그' 에 보고서가 나옵니다. 그 내용을 그대로 알려 주세요.

   무엇을 찾아 주나
     ① 필요 없어 보이는 것  — 아무도 안 쓰는 시트, 빈 결과만 내는 수식
     ② 중복                — 같은 수식이 수백 칸 반복 (한 줄로 줄일 수 있음)
     ③ 어렵게 된 것        — 아주 길거나 IF 를 여러 겹 쌓은 수식
     ④ 느리게 만드는 것    — NOW·TODAY·INDIRECT·OFFSET, 열 전체 참조(A:A)
                             → 이런 게 있으면 시트를 읽을 때마다 전부 다시 계산해서
                               홈페이지 불러오는 속도까지 느려집니다
   ══════════════════════════════════════════════════════════ */

var AUDIT_LONG   = 180;   // 이 글자 수를 넘으면 '긴 수식'
var AUDIT_NEST   = 4;     // IF 가 이만큼 겹치면 '겹겹이 쌓인 수식'
var AUDIT_REPEAT = 50;    // 같은 모양이 이만큼 반복되면 '한 줄로 줄일 수 있음'

/** 열 번호(1부터) → A, B, … AA */
function colName_(n) {
  var out = '';
  while (n > 0) { var m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

/** 수식 안에서 특정 함수가 몇 번 쓰였는지 */
function countFn_(f, name) {
  var re = new RegExp('(^|[^A-Z0-9_.])' + name + '\\s*\\(', 'gi');
  var n = 0;
  while (re.exec(f) !== null) n++;
  return n;
}

function 수식점검() {
  var ss = getSpreadsheet_();
  if (!ss) { Logger.log('❌ 스프레드시트를 열 수 없습니다.'); return; }

  var sheets = ss.getSheets();
  var L = [];
  function log(s) { L.push(s); }

  var VOLATILE = ['NOW', 'TODAY', 'RAND', 'RANDBETWEEN', 'INDIRECT', 'OFFSET'];

  var total = { cells: 0, formulas: 0, volatile: 0, wholeCol: 0, long: 0, nested: 0, repeat: 0 };
  var warn = [];          // 전체 경고 모음
  var sheetReports = [];

  for (var si = 0; si < sheets.length; si++) {
    var sh = sheets[si];
    var name = sh.getName();
    var last = sh.getLastRow(), lastC = sh.getLastColumn();
    if (!last || !lastC) { sheetReports.push({ name: name, empty: true }); continue; }

    var rng = sh.getRange(1, 1, last, lastC);
    var fA1, fR1C1;
    try {
      fA1   = rng.getFormulas();
      fR1C1 = rng.getFormulasR1C1();
    } catch (e) {
      sheetReports.push({ name: name, error: e.toString() });
      continue;
    }

    total.cells += last * lastC;

    // 열별로 모읍니다
    var cols = [];
    var sheetFormulaCount = 0;

    for (var c = 0; c < lastC; c++) {
      var shapes = {}, count = 0, firstCell = '', firstF = '';
      for (var r = 0; r < last; r++) {
        var f = fA1[r][c];
        if (!f) continue;
        count++;
        sheetFormulaCount++;
        var key = fR1C1[r][c];
        if (!shapes[key]) shapes[key] = 0;
        shapes[key]++;
        if (!firstCell) { firstCell = colName_(c + 1) + (r + 1); firstF = f; }

        // ── 경고거리 찾기 ──
        var up = String(f).toUpperCase();
        for (var v = 0; v < VOLATILE.length; v++) {
          if (countFn_(up, VOLATILE[v]) > 0) {
            total.volatile++;
            warn.push({ kind: '느리게 함', sheet: name,
                        cell: colName_(c + 1) + (r + 1),
                        msg: VOLATILE[v] + '( ) 사용 — 시트를 읽을 때마다 다시 계산됩니다' });
            break;
          }
        }
        if (/[^!:$A-Z0-9](\$?[A-Z]{1,3}:\$?[A-Z]{1,3})/.test(up.replace(/'[^']*'!/g, ''))) {
          total.wholeCol++;
          warn.push({ kind: '느리게 함', sheet: name, cell: colName_(c + 1) + (r + 1),
                      msg: '열 전체를 참조 (A:A 같은 형태) — 빈 칸까지 전부 훑습니다' });
        }
        if (f.length > AUDIT_LONG) {
          total.long++;
          warn.push({ kind: '어렵게 됨', sheet: name, cell: colName_(c + 1) + (r + 1),
                      msg: '수식이 ' + f.length + '자로 깁니다' });
        }
        var ifs = countFn_(up, 'IF');
        if (ifs >= AUDIT_NEST) {
          total.nested++;
          warn.push({ kind: '어렵게 됨', sheet: name, cell: colName_(c + 1) + (r + 1),
                      msg: 'IF 가 ' + ifs + '번 — IFS( ) 나 조회표(VLOOKUP)로 줄일 수 있습니다' });
        }
      }
      if (!count) continue;

      var keys = [];
      for (var k in shapes) if (shapes.hasOwnProperty(k)) keys.push(k);
      var top = 0;
      for (var kk = 0; kk < keys.length; kk++) if (shapes[keys[kk]] > top) top = shapes[keys[kk]];

      if (top >= AUDIT_REPEAT && keys.length === 1) total.repeat++;

      cols.push({ col: colName_(c + 1), count: count, shapes: keys.length,
                  top: top, cell: firstCell, f: firstF });
    }

    total.formulas += sheetFormulaCount;
    sheetReports.push({ name: name, rows: last, cols2: lastC,
                        formulas: sheetFormulaCount, colList: cols });
  }

  /* ── 어느 시트가 이 프로그램에서 쓰이는지 ── */
  var used = {};
  used[SHEET_GRADE] = '내신 성적';
  used[SHEET_TARGET] = '희망 대학·학과';
  used[SHEET_COUNSEL] = '상담 기록';
  used[SHEET_ACCOUNT] = '로그인 계정';
  used[SHEET_TGRADE] = '목표 등급 (선생님 메모)';
  used[SHEET_UNIV] = '정시 결과 (대학·학과·연도·평균70 네 칸만)';
  used[SHEET_SUSI] = '수시 지원 이력 (대학명·모집단위·전교과 등 일곱 칸만)';
  used[SHEET_TRANSFER] = '전입생 이전 학교 성적';
  used[SHEET_GOAL] = '(지금은 화면에서 안 씀)';
  MOCK_SHEETS.forEach(function (m) { used[m.name] = '모의고사'; });

  /* ══ 보고서 ══ */
  log('════════════════════════════════════════');
  log('  구글 시트 수식 점검');
  log('════════════════════════════════════════');
  log('');
  log('[전체 요약]');
  log('  시트 ' + sheets.length + '개 / 수식이 든 칸 ' + total.formulas + '개');
  log('  느리게 만드는 수식 : ' + (total.volatile + total.wholeCol) + '곳'
      + '  (다시 계산 ' + total.volatile + ' / 열 전체 참조 ' + total.wholeCol + ')');
  log('  어렵게 된 수식     : ' + (total.long + total.nested) + '곳'
      + '  (긴 것 ' + total.long + ' / IF 겹침 ' + total.nested + ')');
  log('  한 줄로 줄일 수 있는 열 : ' + total.repeat + '개');
  log('');

  log('[시트별]');
  for (var s2 = 0; s2 < sheetReports.length; s2++) {
    var R = sheetReports[s2];
    var mark = used[R.name] ? ('  ← 홈페이지가 씀: ' + used[R.name]) : '  ← 홈페이지는 안 씀';
    if (R.empty)  { log('  · ' + R.name + ' : 비어 있음' + mark); continue; }
    if (R.error)  { log('  · ' + R.name + ' : 읽지 못함 (' + R.error + ')'); continue; }
    log('');
    log('  ── ' + R.name + '  (' + R.rows + '행 × ' + R.cols2 + '열, 수식 ' + R.formulas + '칸)' + mark);
    if (!R.colList.length) { log('       수식 없음 (값만 들어 있음)'); continue; }

    var shown = 0;
    for (var ci = 0; ci < R.colList.length && shown < 30; ci++) {
      var C = R.colList[ci];
      var note = '';
      if (C.shapes === 1 && C.top >= AUDIT_REPEAT) note = '  ★ 같은 수식이 ' + C.top + '번 반복 → ARRAYFORMULA 한 줄로 가능';
      else if (C.shapes > 1) note = '  ⚠ 모양이 ' + C.shapes + '가지 (중간에 다른 수식이 섞여 있습니다)';
      log('     ' + C.col + '열 : ' + C.count + '칸' + note);
      log('        ' + C.cell + '  ' + (C.f.length > 120 ? C.f.slice(0, 120) + ' …' : C.f));
      shown++;
    }
    if (R.colList.length > shown) log('     … 그 밖에 ' + (R.colList.length - shown) + '개 열 더');
  }

  log('');
  log('[고치면 좋은 곳]');
  if (!warn.length) log('  없습니다.');
  else {
    var seen = {}, printed = 0;
    for (var w = 0; w < warn.length && printed < 40; w++) {
      // 같은 시트·같은 종류·같은 설명은 한 번만
      var key2 = warn[w].sheet + '|' + warn[w].kind + '|' + warn[w].msg;
      if (seen[key2]) { seen[key2]++; continue; }
      seen[key2] = 1;
      log('  [' + warn[w].kind + '] ' + warn[w].sheet + ' ' + warn[w].cell + ' — ' + warn[w].msg);
      printed++;
    }
    for (var key3 in seen) {
      if (seen.hasOwnProperty(key3) && seen[key3] > 1) {
        var parts = key3.split('|');
        log('     (' + parts[0] + ' 의 같은 문제가 ' + seen[key3] + '곳 더 있습니다: ' + parts[2] + ')');
      }
    }
  }

  log('');
  log('※ 이 기능은 수식을 고치지 않습니다. 보기만 합니다.');
  log('※ 위 내용을 그대로 복사해서 알려 주시면 어디를 어떻게 줄일지 정리해 드리겠습니다.');

  Logger.log(L.join('\n'));
}


/* ══════════════════════════════════════════════════════════
   상담 기록 고치기 · 지우기

   기록 한 건 = '상담내용' 시트에서 그 학생 줄의 칸 하나입니다.
   D열부터 오른쪽으로 시간 순서대로 쌓입니다.

   ⚠️ 지울 때 칸만 비우면 안 됩니다.
      새 상담은 '왼쪽부터 첫 빈 칸'에 들어가므로, 중간에 빈 칸이 생기면
      다음 상담이 그 자리에 끼어들어 날짜 순서가 뒤엉킵니다.
      그래서 지운 뒤에는 오른쪽 기록들을 왼쪽으로 당깁니다.

   지운 기록은 '상담내용_삭제됨' 시트에 보관합니다 (휴지통).
   홈페이지는 그 시트를 읽지 않습니다.
   ══════════════════════════════════════════════════════════ */

var SHEET_TRASH   = '상담내용_삭제됨';
var TRASH_HEADERS = ['반', '번호', '이름', '지운 날짜', '지운 사람', '지워진 상담 기록'];

/** 휴지통 시트를 준비합니다. 없으면 만듭니다. */
function ensureTrashSheet_(ss) {
  var sheet = ss.getSheetByName(SHEET_TRASH);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_TRASH);
    sheet.getRange(1, 1, 1, TRASH_HEADERS.length).setValues([TRASH_HEADERS]);
    sheet.getRange(1, 1, 1, TRASH_HEADERS.length)
         .setFontWeight('bold').setBackground('#fee2e2');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(6, 500);
  }
  return sheet;
}

/** 기록을 '날짜 줄' 과 '내용' 으로 나눕니다. */
function splitRecord_(v) {
  var s = String(v == null ? '' : v);
  var nl = s.indexOf('\n');
  if (nl === -1) return { head: s, body: '' };
  return { head: s.slice(0, nl), body: s.slice(nl + 1) };
}

/** 날짜 줄에서 원래 날짜만 남깁니다. (이전 수정 표시는 뗍니다) */
function baseHead_(head) {
  var m = String(head).match(/^\[(.*?)\]/);
  if (m) return '[' + m[1] + ']';
  return String(head).replace(/\s*\(수정:[^)]*\)\s*$/, '');
}

/** '상담내용' 시트에서 그 학생 줄을 찾습니다. 없으면 -1. */
function findCounselRow_(data, classInt, numInt) {
  for (var i = 1; i < data.length; i++) {
    if (toInt_(data[i][0]) === classInt && toInt_(data[i][1]) === numInt) return i + 1;
  }
  return -1;
}

/** 한 줄에서 상담 기록과 그 열 번호를 새것부터 차례로 뽑습니다. */
function rowHistory_(rowVals) {
  var texts = [], cols = [], last = '';
  for (var c = 4; c <= rowVals.length; c++) {
    var v = String(rowVals[c - 1] == null ? '' : rowVals[c - 1]).trim();
    if (v === '') continue;
    texts.push(v);
    cols.push(c);
    var m = v.match(/^\[(.*?)\]/);
    if (m) last = m[1];
  }
  texts.reverse();
  cols.reverse();
  return { h: texts, hc: cols, cd: last };
}


/* ── 고치기 ────────────────────────────────────────── */

function updateCounseling(classNum, studentNum, col, text, editor, timeStr) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { success: false, error: '다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.' }; }

  try {
    var classInt = toInt_(classNum);
    var numInt   = toInt_(studentNum);
    var colInt   = toInt_(col);
    var body     = String(text || '').trim();

    if (isNaN(classInt) || isNaN(numInt)) return { success: false, error: '학생을 찾지 못했습니다.' };
    if (isNaN(colInt) || colInt < 4)      return { success: false, error: '고칠 기록을 찾지 못했습니다.' };
    if (!body)                            return { success: false, error: '상담 내용을 입력해 주세요.' };

    var ss = getSpreadsheet_();
    var sheet = findSheet_(ss, SHEET_COUNSEL, ['상담']);
    if (!sheet) return { success: false, error: "'" + SHEET_COUNSEL + "' 시트를 찾을 수 없습니다." };

    var data = sheet.getDataRange().getValues();
    var row = findCounselRow_(data, classInt, numInt);
    if (row === -1) return { success: false, error: '학생 줄을 찾지 못했습니다.' };

    var cur = String(sheet.getRange(row, colInt).getValue() || '').trim();
    if (!cur) return { success: false, error: '이미 지워졌거나 없는 기록입니다. 새로고침 후 다시 해 주세요.' };

    var head = baseHead_(splitRecord_(cur).head) +
               ' (수정: ' + timeStr + ' ' + String(editor || '') + ')';
    var record = head + '\n' + body;
    sheet.getRange(row, colInt).setValue(record);

    return { success: true, record: record };

  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}


/* ── 지우기 (휴지통으로 옮김) ───────────────────────── */

function deleteCounseling(classNum, studentNum, col, editor, timeStr) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); }
  catch (e) { return { success: false, error: '다른 저장이 진행 중입니다. 잠시 후 다시 시도해 주세요.' }; }

  try {
    var classInt = toInt_(classNum);
    var numInt   = toInt_(studentNum);
    var colInt   = toInt_(col);

    if (isNaN(classInt) || isNaN(numInt)) return { success: false, error: '학생을 찾지 못했습니다.' };
    if (isNaN(colInt) || colInt < 4)      return { success: false, error: '지울 기록을 찾지 못했습니다.' };

    var ss = getSpreadsheet_();
    var sheet = findSheet_(ss, SHEET_COUNSEL, ['상담']);
    if (!sheet) return { success: false, error: "'" + SHEET_COUNSEL + "' 시트를 찾을 수 없습니다." };

    var data = sheet.getDataRange().getValues();
    var row = findCounselRow_(data, classInt, numInt);
    if (row === -1) return { success: false, error: '학생 줄을 찾지 못했습니다.' };

    var lastCol = Math.max(sheet.getLastColumn(), 4);
    var rowVals = sheet.getRange(row, 1, 1, lastCol).getValues()[0];

    var removed = String(rowVals[colInt - 1] == null ? '' : rowVals[colInt - 1]).trim();
    if (!removed) return { success: false, error: '이미 지워진 기록입니다. 새로고침 후 다시 해 주세요.' };

    // 1) 휴지통에 보관 (먼저 보관하고 나서 지웁니다)
    var trash = ensureTrashSheet_(ss);
    trash.appendRow([classInt, numInt, String(rowVals[2] || ''),
                     timeStr, String(editor || ''), removed]);

    // 2) 지우고 왼쪽으로 당기기 (중간에 빈 칸이 남지 않게)
    var rest = [];
    for (var c = 4; c <= lastCol; c++) {
      if (c === colInt) continue;
      var v = String(rowVals[c - 1] == null ? '' : rowVals[c - 1]);
      if (v.trim() !== '') rest.push(v);
    }
    var out = [];
    for (var k = 0; k < lastCol - 3; k++) out.push(k < rest.length ? rest[k] : '');
    sheet.getRange(row, 4, 1, out.length).setValues([out]);

    // 3) 바뀐 목록을 그대로 돌려줍니다 (열 번호가 밀렸으므로)
    var after = [];
    for (var q = 0; q < 3; q++) after.push(rowVals[q]);
    for (var q2 = 0; q2 < out.length; q2++) after.push(out[q2]);
    var hist = rowHistory_(after);

    return { success: true, h: hist.h, hc: hist.hc, cd: hist.cd };

  } catch (err) {
    return { success: false, error: err.toString() };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}


/* ── 화면에서 오는 요청 ─────────────────────────────── */

function apiUpdateCounseling_(req, user) {
  var res = updateCounseling(req.classNum, req.studentNum, req.col, req.text,
                             user.name, nowStr_());
  if (!res.success) return err_(res.error || '고치지 못했습니다.');
  return ok_(res);
}

function apiDeleteCounseling_(req, user) {
  var res = deleteCounseling(req.classNum, req.studentNum, req.col,
                             user.name, nowStr_());
  if (!res.success) return err_(res.error || '지우지 못했습니다.');
  return ok_(res);
}
