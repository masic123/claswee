/* ===== 我们的课表 · 主逻辑 ===== */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* ---------- 默认节次 ---------- */
  var DEFAULT_SECTIONS = [
    { s: '08:30', e: '09:15' },
    { s: '09:20', e: '10:05' },
    { s: '10:25', e: '11:10' },
    { s: '11:15', e: '12:00' },
    { s: '13:30', e: '14:15' },
    { s: '14:20', e: '15:05' },
    { s: '15:25', e: '16:10' },
    { s: '16:15', e: '17:00' },
    { s: '18:30', e: '19:15' },
    { s: '19:20', e: '20:05' },
    { s: '20:10', e: '20:55' },
    { s: '21:00', e: '21:45' }
  ];

  var EMOJIS = ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐯', '🐨', '🐹', '🦁', '🐷', '🐸', '🐵', '🐧', '🦄', '🐴', '🐔', '🐺'];
  var DAY_CN = ['一', '二', '三', '四', '五', '六', '日'];

  /* ---------- 默认数据 ---------- */
  function defaultData() {
    return {
      version: 1,
      productName: 'claswee',
      me: 'cat',
      users: {
        cat: { name: '小猫', avatar: '🐱' },
        dog: { name: '小狗', avatar: '🐶' }
      },
      settings: {
        start: '2026-08-31',
        catStart: '2026-08-31',
        dogStart: '2026-08-31',
        weeks: 20,
        weekend: true,
        sections: DEFAULT_SECTIONS.map(function (x) { return { s: x.s, e: x.e }; }),
        catSections: DEFAULT_SECTIONS.map(function (x) { return { s: x.s, e: x.e }; }),
        dogSections: DEFAULT_SECTIONS.map(function (x) { return { s: x.s, e: x.e }; })
      },
      courses: [
        mk('cat', '高等数学', '33楼204', '张老师', 1, 1, 2, 'all'),
        mk('cat', '大学英语', '外语楼301', '', 2, 3, 4, 'all'),
        mk('cat', '线性代数', '33楼208', '', 3, 1, 2, 'odd'),
        mk('dog', '数据结构', '信息楼512', '李老师', 1, 6, 8, 'all'),
        mk('dog', '计算机网络', '信息楼508', '', 4, 1, 2, 'all'),
        mk('dog', '体育（篮球）', '东体育场', '', 5, 3, 4, 'even')
      ],
      updatedAt: Date.now()
    };
  }

  var seq = 0;
  function mk(owner, name, loc, teacher, day, s1, s2, weekMode, wf, wt, customParity, slots) {
    var timeSlots = slots && slots.length ? slots : [{ day: day, s1: s1, s2: s2 }];
    return {
      id: 'c' + Date.now() + '_' + (seq++),
      owner: owner, name: name, loc: loc, teacher: teacher || '',
      day: timeSlots[0].day, s1: timeSlots[0].s1, s2: timeSlots[0].s2,
      slots: timeSlots,
      week: weekMode || 'all',
      wf: wf || 1, wt: wt || 20,
      customParity: customParity || 'all'
    };
  }

  function cloneSections(list) {
    return (list || []).map(function (section) { return { s: section.s, e: section.e }; });
  }

  function ensureScheduleTimes() {
    var base = cloneSections(data.settings.sections);
    if (!base.length) base = cloneSections(DEFAULT_SECTIONS);
    if (!Array.isArray(data.settings.catSections) || !data.settings.catSections.length) data.settings.catSections = cloneSections(base);
    if (!Array.isArray(data.settings.dogSections) || !data.settings.dogSections.length) data.settings.dogSections = cloneSections(base);
    /* 两个人的节次表相互独立，不能再按旧公共模板把已删除的节次补回来。 */
    var scaffold = data.settings.catSections.length >= data.settings.dogSections.length
      ? data.settings.catSections
      : data.settings.dogSections;
    data.settings.sections = cloneSections(scaffold);
  }

  function sectionCount() {
    return Math.max(
      data.settings.catSections ? data.settings.catSections.length : 0,
      data.settings.dogSections ? data.settings.dogSections.length : 0
    );
  }

  function ensureCourses() {
    if (!Array.isArray(data.courses)) data.courses = [];
    if (!Array.isArray(data.deletedCourses)) data.deletedCourses = [];
    var migrated = false;

    /* 兼容旧版本：时间视图曾保存独立课程列表。合并其中独有课程后，统一只使用 courses。 */
    if (Array.isArray(data.timelineCourses)) {
      var knownIds = new Set(data.courses.map(function (course) { return course.id; }));
      data.timelineCourses.forEach(function (course) {
        if (course && course.id && !knownIds.has(course.id)) {
          data.courses.push(course);
          knownIds.add(course.id);
        }
      });
      delete data.timelineCourses;
      migrated = true;
    }

    /* 旧删除记录可能带有 view；课程现在跨视图共享，按课程 ID 统一处理。 */
    var deletionById = {};
    data.deletedCourses.forEach(function (item) {
      if (!item || !item.id) return;
      if (item.view) migrated = true;
      if (!deletionById[item.id] || (+item.at || 0) > (+deletionById[item.id].at || 0)) {
        deletionById[item.id] = { id: item.id, at: +item.at || Date.now() };
      }
    });
    data.deletedCourses = Object.keys(deletionById).map(function (id) { return deletionById[id]; }).slice(-100);
    var removedStaleCourse = false;
    data.deletedCourses.forEach(function (item) {
      if (!item || !item.id) return;
      var before = data.courses.length;
      data.courses = data.courses.filter(function (course) { return course.id !== item.id; });
      if (data.courses.length !== before) removedStaleCourse = true;
    });
    if (migrated || removedStaleCourse) Sync.saveLocal(data, true);
  }

  function activeCourses() {
    ensureCourses();
    return data.courses;
  }

  /* ---------- 状态 ---------- */
  var data = Sync.loadLocal() || defaultData();
  if (!data.settings) data.settings = defaultData().settings;
  if (!data.settings.sections || !data.settings.sections.length) data.settings.sections = DEFAULT_SECTIONS.slice();
  if (!data.users) data.users = defaultData().users;
  var semesterDatesMigrated = ensureSemesterDates();
  if (semesterDatesMigrated) Sync.saveLocal(data, true);
  data.productName = 'claswee';
  if (!data.settings.layoutMode) data.settings.layoutMode = 'sections';
  ensureScheduleTimes();
  ensureCourses();

  var viewWeek = currentWeek();
  var filter = 'both';
  var layoutMode = (data.settings && data.settings.layoutMode) || 'sections';
  var sectionTimeOwner = data.me === 'dog' ? 'dog' : 'cat';
  var timelineDay = realWeekday(new Date());
  var editingId = null;
  var avatarTarget = 'cat';
  var tempAvatar = null;

  /* 皮肤是设备偏好，不进入共享课表数据。 */
  var skinColors = { blush: '#ffd6e0', mint: '#d9eee7', sun: '#f7e7c3', night: '#14223b' };
  function selectSkin(skin) {
    if (!Object.prototype.hasOwnProperty.call(skinColors, skin)) skin = 'blush';
    document.documentElement.setAttribute('data-skin', skin);
    $('meta[name="theme-color"]').setAttribute('content', skinColors[skin]);
    $$('#skinPicker input[name="skin"]').forEach(function (input) {
      input.checked = input.value === skin;
      input.closest('.skin-option').classList.toggle('on', input.checked);
    });
    try { localStorage.setItem('claswee.skin', skin); } catch (e) { /* 无存储权限时本次访问仍可换肤 */ }
  }
  $('#skinPicker').addEventListener('change', function (event) {
    if (event.target.name === 'skin') selectSkin(event.target.value);
  });
  selectSkin(document.documentElement.getAttribute('data-skin'));

  function save() {
    Sync.saveLocal(data);
    autoPush();
  }

  /* 本学期为 20 周：把此前默认的 19 周配置自动调整一次。 */
  if (data.settings.weeks === 19) {
    data.settings.weeks = 20;
    save();
  }
  /* 11、12 节只在旧数据升级时补一次，之后尊重用户的删除操作。 */
  if (!data.settings.sectionSetupVersion) {
    [data.settings.catSections, data.settings.dogSections].forEach(function (sections) {
      if (sections.length <= 10) sections.push({ s: '20:10', e: '20:55' });
      if (sections.length <= 11) sections.push({ s: '21:00', e: '21:45' });
    });
    data.settings.sectionSetupVersion = 12;
    save();
  }
  ensureScheduleTimes();

  /* ---------- 日期 / 周次 ---------- */
  function parseDate(str) {
    var p = String(str).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function validDate(str) {
    var value = String(str || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var d = parseDate(value);
    return d.getFullYear() === +value.slice(0, 4) && d.getMonth() + 1 === +value.slice(5, 7) && d.getDate() === +value.slice(8, 10);
  }
  function isMonday(value) { return validDate(value) && parseDate(value).getDay() === 1; }
  function mondayDays(year, month) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1970 || year > 2100 || month < 1 || month > 12) return [];
    var first = new Date(year, month - 1, 1), days = [], last = new Date(year, month, 0).getDate();
    for (var day = 1 + (8 - first.getDay()) % 7; day <= last; day += 7) days.push(day);
    return days;
  }
  function dateNumber(value) {
    var d = value instanceof Date ? value : parseDate(value);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }
  function dateKey(value) {
    var d = value instanceof Date ? value : parseDate(value);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function earlierDate(a, b) {
    return dateNumber(a) <= dateNumber(b) ? a : b;
  }
  function ensureSemesterDates() {
    var settings = data.settings || (data.settings = {});
    var beforeCat = settings.catStart;
    var beforeDog = settings.dogStart;
    var beforeStart = settings.start;
    var fallback = validDate(settings.start) ? settings.start : (validDate(settings.catStart) ? settings.catStart : (validDate(settings.dogStart) ? settings.dogStart : defaultData().settings.start));
    if (!validDate(settings.catStart)) settings.catStart = fallback;
    if (!validDate(settings.dogStart)) settings.dogStart = fallback;
    settings.start = earlierDate(settings.catStart, settings.dogStart);
    return beforeCat !== settings.catStart || beforeDog !== settings.dogStart || beforeStart !== settings.start;
  }
  function ownerStart(owner) {
    ensureSemesterDates();
    return owner === 'dog' ? data.settings.dogStart : data.settings.catStart;
  }
  function calendarStart() {
    return earlierDate(ownerStart('cat'), ownerStart('dog'));
  }
  function calendarWeeks() {
    /* 公共导航按真实日期覆盖两人的完整学期；每门课的周次仍以所属人的起始日为准。 */
    var anchor = dateNumber(calendarStart());
    var totalWeeks = +data.settings.weeks || 1;
    var lastDate = Math.max(
      dateNumber(ownerStart('cat')) + totalWeeks * 7 - 1,
      dateNumber(ownerStart('dog')) + totalWeeks * 7 - 1);
    return Math.max(1, Math.floor((lastDate - anchor) / 7) + 1);
  }
  function ownerWeekForDate(owner, date) {
    return Math.floor((dateNumber(date) - dateNumber(ownerStart(owner))) / 7) + 1;
  }
  function ownerWeekText(owner, date) {
    var week = ownerWeekForDate(owner, date);
    return week < 1 ? '开学前' : '第' + week + '周';
  }
  function weekStart(w) {
    var d = parseDate(calendarStart());
    d.setDate(d.getDate() + (w - 1) * 7);
    return d;
  }
  function currentWeek() {
    var diff = dateNumber(new Date()) - dateNumber(calendarStart());
    return Math.max(1, Math.min(calendarWeeks(), Math.floor(diff / 7) + 1));
  }
  function realWeekday(date) {           // 周一=1 ... 周日=7
    var d = date.getDay();
    return d === 0 ? 7 : d;
  }
  function inWeek(c, w) {
    if (c.week === 'odd') return w % 2 === 1;
    if (c.week === 'even') return w % 2 === 0;
    if (c.week === 'custom') {
      if (w < (+c.wf) || w > (+c.wt)) return false;
      if (c.customParity === 'odd') return w % 2 === 1;
      if (c.customParity === 'even') return w % 2 === 0;
      return true;
    }
    return true;
  }
  function courseOccursOnDate(course, date) {
    var week = ownerWeekForDate(course.owner, date);
    return week >= 1 && week <= (+data.settings.weeks || 1) && inWeek(course, week);
  }
  function pad(n) { return n < 10 ? '0' + n : n; }

  function courseSlots(c) {
    return c.slots && c.slots.length ? c.slots : [{ day: c.day, s1: c.s1, s2: c.s2 }];
  }

  /* ---------- Toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1800);
  }

  /* ---------- 头像渲染 ---------- */
  function paintAvatar(el, avatar) {
    if (avatar && avatar.indexOf('data:') === 0) {
      el.innerHTML = '<img src="' + avatar + '" alt="">';
      el.style.fontSize = '0';
    } else {
      el.textContent = avatar || '🐱';
      el.style.fontSize = '';
    }
  }

  /* ---------- 顶部 & 周次栏 ---------- */
  function renderUserReferences() {
    var catName = data.users.cat.name;
    var dogName = data.users.dog.name;

    $('#viewSwitch button[data-view="cat"] span').textContent = '只看' + catName;
    $('#viewSwitch button[data-view="dog"] span').textContent = '只看' + dogName;
    $('#setMe button[data-me="cat"]').textContent = '🐱 我是' + catName;
    $('#setMe button[data-me="dog"]').textContent = '🐶 我是' + dogName;
    $('#setMeStatus').textContent = '当前选择：我是' + data.users[data.me].name;
    $('#fOwner button[data-owner="cat"]').textContent = '🐱 ' + catName + '的课';
    $('#fOwner button[data-owner="dog"]').textContent = '🐶 ' + dogName + '的课';
    $('#setNickCat').placeholder = catName + '的昵称';
    $('#setNickDog').placeholder = dogName + '的昵称';
    $('#setCatStartLabel').textContent = catName + '第一周的周一';
    $('#setDogStartLabel').textContent = dogName + '第一周的周一';
    $('#sectionTimeCatName').textContent = catName;
    $('#sectionTimeDogName').textContent = dogName;
    $('#sectionTimeCurrent').textContent = data.users[sectionTimeOwner].name + '的节次时间';
  }

  function renderHeader() {
    /* 顶部位置固定：小猫（今天不喝周）在左，小狗（masic）在右。 */
    var cat = data.users.cat;
    var dog = data.users.dog;
    paintAvatar($('#avatarMeImg'), cat.avatar);
    paintAvatar($('#avatarTaImg'), dog.avatar);
    $('#avatarMeImg').className = 'avatar';
    $('#avatarTaImg').className = 'avatar dog';
    $('#nickMe').textContent = cat.name;
    $('#nickTa').textContent = dog.name;
    $('#nickMe').style.color = 'var(--cat-ink)';
    $('#nickTa').style.color = 'var(--dog-ink)';
    renderUserReferences();
  }

  function renderWeekBar() {
    $('#weekNum').textContent = viewWeek;
    var s = weekStart(viewWeek);
    var e = new Date(s);
    e.setDate(e.getDate() + 6);
    $('#weekRange').textContent = (s.getMonth() + 1) + '.' + s.getDate() + ' - ' + (e.getMonth() + 1) + '.' + e.getDate() + ' · ' + data.users.cat.name + ownerWeekText('cat', s) + ' / ' + data.users.dog.name + ownerWeekText('dog', s);
  }

  /* ---------- 课表网格 ---------- */
  function renderGrid() {
    var grid = $('#grid');
    var st = data.settings;
    var days = st.weekend ? 7 : 5;
    var secs = st.sections;
    var today = new Date();
    var thisWeek = currentWeek();
    var todayKey = dateKey(today);
    var isThisWeek = (viewWeek === thisWeek);
    var todayCol = -1;

    /* 当前节次 */
    var nowSec = -1;
    if (isThisWeek) {
      var hm = pad(today.getHours()) + ':' + pad(today.getMinutes());
      for (var i = 0; i < secs.length; i++) {
        if (hm >= secs[i].s && hm <= secs[i].e) { nowSec = i + 1; break; }
      }
    }

    grid.innerHTML = '';
    grid.style.gridTemplateColumns = '44px repeat(' + days + ',minmax(' + (filter === 'both' ? 92 : 42) + 'px,1fr))';
    grid.style.minWidth = filter === 'both' ? (44 + days * 92) + 'px' : '100%';
    grid.style.gridTemplateRows = '34px repeat(' + secs.length + ',minmax(' + (filter === 'both' ? 78 : 50) + 'px,auto))';

    var frag = document.createDocumentFragment();

    /* 左上角 */
    var corner = document.createElement('div');
    corner.className = 'hd';
    corner.style.gridColumn = '1';
    corner.style.gridRow = '1';
    corner.innerHTML = '<span style="font-size:9px">节次</span>';
    frag.appendChild(corner);

    /* 表头：周一 ~ 周日 */
    var ws = weekStart(viewWeek);
    for (var d = 1; d <= days; d++) {
      var dd = new Date(ws);
      dd.setDate(dd.getDate() + (d - 1));
      if (dateKey(dd) === todayKey) todayCol = d;
      var h = document.createElement('div');
      h.className = 'hd' + (d === todayCol ? ' today' : '') + (d > 5 ? ' wkend' : '') + (d === days ? ' last-col' : '');
      h.style.gridColumn = String(d + 1);
      h.style.gridRow = '1';
      h.innerHTML = '周' + DAY_CN[d - 1] + '<span class="d">' + (dd.getMonth() + 1) + '/' + dd.getDate() + '</span>';
      frag.appendChild(h);
    }

    /* 左侧节次列 */
    for (var s = 0; s < secs.length; s++) {
      var sn = document.createElement('div');
      sn.className = 'sn' + ((s + 1) === nowSec ? ' now' : '');
      sn.style.gridColumn = '1';
      sn.style.gridRow = String(s + 2);
      sn.innerHTML = '<b>' + (s + 1) + '</b><span>' + secs[s].s + '</span><span>' + secs[s].e + '</span>';
      frag.appendChild(sn);
    }

    /* 空白格 */
    for (var r = 0; r < secs.length; r++) {
      for (var c2 = 1; c2 <= days; c2++) {
        var cell = document.createElement('div');
        cell.className = 'cell empty-hit' + (c2 === todayCol ? ' today-col' : '') + (c2 === days ? ' last-col' : '');
        cell.style.gridColumn = String(c2 + 1);
        cell.style.gridRow = String(r + 2);
        cell.dataset.day = c2;
        cell.dataset.sec = r + 1;
        frag.appendChild(cell);
      }
    }

    /* 课程格：按实际重叠区间分段，任何数量的重叠课程都完整保留。 */
    var maxSec = secs.length;

    function createCourseBox(c, span, isNow, compact, edgeClass) {
      var box = document.createElement('div');
      box.className = 'course ' + c.owner + (compact ? ' compact' : '') + (isNow ? ' now' : '') + (edgeClass ? ' ' + edgeClass : '');
      box.dataset.id = c.id;
      var meta = '';
      if (c.loc) meta += '📍' + c.loc;
      if (c.teacher) meta += (meta ? ' ' : '') + '👤' + c.teacher;
      box.innerHTML =
        '<div class="c-name">' + esc(c.name) + '</div>' +
        (meta ? '<div class="c-meta">' + esc(meta) + '</div>' : '') +
        (!compact && span >= 2 ? '<div class="c-flag">' + (c.owner === 'cat' ? '🐾' : '🦴') + '</div>' : '');
      return box;
    }

    for (var day = 1; day <= days; day++) {
      var dayCourses = [];
      var dayDate = new Date(ws);
      dayDate.setDate(dayDate.getDate() + day - 1);
      activeCourses().forEach(function (c) {
        if (!courseOccursOnDate(c, dayDate) || (filter !== 'both' && c.owner !== filter)) return;
        courseSlots(c).forEach(function (slot, slotIndex) {
          if (+slot.day !== day) return;
          var s1 = Math.max(1, Math.min(+slot.s1, maxSec));
          var s2 = Math.max(s1, Math.min(+slot.s2, maxSec));
          dayCourses.push({ course: c, s1: s1, s2: s2, key: c.id + '_' + slotIndex });
        });
      });

      function courseActiveAt(course, section) {
        return dayCourses.some(function (item) {
          return item.course.id === course.id && item.s1 <= section && item.s2 >= section;
        });
      }

      function edgeClass(course, start, end) {
        var edge = [];
        if (start > 1 && courseActiveAt(course, start - 1)) edge.push('join-top');
        if (end < maxSec && courseActiveAt(course, end + 1)) edge.push('join-bottom');
        return edge.join(' ');
      }

      function stackEdgeClass(items, start, end) {
        var edge = [];
        if (start > 1 && items.some(function (item) { return item.s1 <= start - 1 && item.s2 >= start - 1; })) edge.push('join-top');
        if (end < maxSec && items.some(function (item) { return item.s1 <= end + 1 && item.s2 >= end + 1; })) edge.push('join-bottom');
        return edge.join(' ');
      }

      function stackGradient(items) {
        var count = items.length;
        var transition = Math.min(7, 100 / (count * 3));
        var stops = [];
        items.forEach(function (item, index) {
          var start = index * 100 / count;
          var end = (index + 1) * 100 / count;
          var top = item.course.owner === 'dog' ? '#BCE4FA' : '#FFC6D9';
          var bottom = item.course.owner === 'dog' ? '#7FC3EC' : '#FF9DBE';
          if (index === 0) stops.push(top + ' 0%');
          stops.push(bottom + ' ' + Math.max(start + 1, end - transition) + '%');
          if (index < count - 1) {
            var nextTop = items[index + 1].course.owner === 'dog' ? '#BCE4FA' : '#FFC6D9';
            stops.push(nextTop + ' ' + Math.min(99, end + transition) + '%');
          } else {
            stops.push(bottom + ' 100%');
          }
        });
        return 'linear-gradient(180deg,' + stops.join(',') + ')';
      }

      function createOverlapStack(items, start, end) {
        var ordered = items.slice().sort(function (a, b) {
          if (a.s1 !== b.s1) return a.s1 - b.s1;
          /* 同一节同时开始时使用固定的双人顺序，不能受课程时长或创建先后影响。 */
          if (a.course.owner !== b.course.owner) return a.course.owner === 'cat' ? -1 : 1;
          if (a.s2 !== b.s2) return b.s2 - a.s2;
          return a.key.localeCompare(b.key);
        });
        var stack = document.createElement('div');
        stack.className = 'course-stack ' + stackEdgeClass(ordered, start, end) +
          (isThisWeek && day === todayCol && nowSec >= start && nowSec <= end ? ' now' : '');
        stack.dataset.count = String(ordered.length);
        stack.style.gridTemplateRows = 'repeat(' + ordered.length + ',minmax(0,1fr))';
        stack.style.background = stackGradient(ordered);
        ordered.forEach(function (item) {
          stack.appendChild(createCourseBox(item.course, end - start + 1, false, true, ''));
        });
        return stack;
      }

      for (var start = 1; start <= maxSec;) {
        var active = dayCourses.filter(function (item) { return item.s1 <= start && item.s2 >= start; });
        var end = start;

        /* 相同的课程组合连续出现时合并，避免同一门课被切成多个小格。 */
        while (end < maxSec) {
          var next = dayCourses.filter(function (item) { return item.s1 <= end + 1 && item.s2 >= end + 1; });
          if (active.length !== next.length || active.some(function (item, index) { return item.key !== next[index].key; })) break;
          end++;
        }

        if (active.length === 1) {
          var single = createCourseBox(active[0].course, end - start + 1,
            isThisWeek && day === todayCol && nowSec >= start && nowSec <= end, false,
            edgeClass(active[0].course, start, end));
          single.style.gridColumn = String(day + 1);
          single.style.gridRow = (start + 1) + ' / span ' + (end - start + 1);
          frag.appendChild(single);
        } else if (active.length > 1) {
          var overlap = createOverlapStack(active, start, end);
          overlap.style.gridColumn = String(day + 1);
          overlap.style.gridRow = (start + 1) + ' / span ' + (end - start + 1);
          frag.appendChild(overlap);
        }
        start = end + 1;
      }
    }

    grid.appendChild(frag);
  }

  /* ---------- 按真实时间合并的时间轴 ---------- */
  function timeToMin(hm) {
    var p = String(hm || '').split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }

  function minToTime(min) {
    var h = Math.floor(min / 60);
    var m = Math.round(min % 60);
    return pad(h) + ':' + pad(m);
  }

  function courseClockRange(course, slot) {
    /* 按课程所属的人读取对应学校的节次时间；新课程不再保存独立时钟值。 */
    var sections = course.owner === 'dog' ? data.settings.dogSections : data.settings.catSections;
    if (!sections || !sections.length) sections = data.settings.sections;
    var s1 = Math.max(1, +slot.s1 || 1);
    var s2 = Math.max(s1, +slot.s2 || s1);
    var first = sections[s1 - 1] || data.settings.sections[s1 - 1];
    var last = sections[s2 - 1] || data.settings.sections[s2 - 1] || first;
    var start = (first && first.s) || slot.startTime || course.startTime;
    var end = (last && last.e) || slot.endTime || course.endTime;
    return { start: timeToMin(start || '08:00'), end: timeToMin(end || start || '09:00') };
  }

  function timelineCourses(day) {
    var result = { cat: [], dog: [] };
    var selectedDate = weekStart(viewWeek);
    selectedDate.setDate(selectedDate.getDate() + day - 1);
    activeCourses().forEach(function (course) {
      if (!courseOccursOnDate(course, selectedDate) || (filter !== 'both' && course.owner !== filter)) return;
      courseSlots(course).forEach(function (slot, slotIndex) {
        if (+slot.day !== day || !result[course.owner]) return;
        var range = courseClockRange(course, slot);
        if (range.end <= range.start) return;
        result[course.owner].push({ course: course, slot: slot, slotIndex: slotIndex, start: range.start, end: range.end });
      });
    });
    return result;
  }

  function mergeTimelineIntervals(intervals) {
    var sorted = intervals.slice().sort(function (a, b) { return a.start - b.start || a.end - b.end; });
    var merged = [];
    sorted.forEach(function (item) {
      var last = merged[merged.length - 1];
      if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
      else merged.push({ start: item.start, end: item.end });
    });
    return merged;
  }

  function sharedFreeIntervals(catItems, dogItems, dayStart, dayEnd) {
    var busy = mergeTimelineIntervals(catItems.concat(dogItems));
    var free = [];
    var cursor = dayStart;
    busy.forEach(function (item) {
      var start = Math.max(dayStart, item.start), end = Math.min(dayEnd, item.end);
      if (end <= dayStart || start >= dayEnd) return;
      if (start > cursor) free.push({ start: cursor, end: start });
      cursor = Math.max(cursor, end);
    });
    if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
    return free.filter(function (item) { return item.end - item.start >= 10; });
  }

  function renderTimeline() {
    var wrap = $('#timelineWrap');
    var timeline = $('#timeline');
    var st = data.settings;
    var days = st.weekend ? 7 : 5;
    if (timelineDay < 1 || timelineDay > days) timelineDay = 1;
    timeline.innerHTML = '';

    var toolbar = document.createElement('div');
    toolbar.className = 'timeline-toolbar';
    var ws = weekStart(viewWeek);
    for (var d = 1; d <= days; d++) {
      var dd = new Date(ws);
      dd.setDate(dd.getDate() + d - 1);
      var dayButton = document.createElement('button');
      dayButton.className = 'timeline-day-btn' + (d === timelineDay ? ' on' : '');
      dayButton.dataset.day = d;
      dayButton.innerHTML = '周' + DAY_CN[d - 1] + '<span>' + (dd.getMonth() + 1) + '/' + dd.getDate() + '</span>';
      toolbar.appendChild(dayButton);
    }
    timeline.appendChild(toolbar);

    var items = timelineCourses(timelineDay);
    var allItems = items.cat.concat(items.dog);
    var dayStart = 8 * 60;
    var dayEnd = 22 * 60;
    allItems.forEach(function (item) {
      dayStart = Math.min(dayStart, Math.floor(item.start / 60) * 60);
      dayEnd = Math.max(dayEnd, Math.ceil(item.end / 60) * 60);
    });
    dayStart = Math.max(6 * 60, dayStart);
    dayEnd = Math.min(24 * 60, dayEnd);
    var duration = Math.max(60, dayEnd - dayStart);
    var height = Math.max(560, Math.round(duration * 1.06));

    var card = document.createElement('div');
    card.className = 'timeline-card';
    var head = document.createElement('div');
    head.className = 'timeline-card-head';
    var selectedDate = new Date(ws);
    selectedDate.setDate(selectedDate.getDate() + timelineDay - 1);
    head.innerHTML = '<div class="timeline-card-title">按时间排列</div><div class="timeline-card-sub">周' + DAY_CN[timelineDay - 1] + ' · ' + (selectedDate.getMonth() + 1) + '/' + selectedDate.getDate() + '</div>';
    card.appendChild(head);

    var shell = document.createElement('div');
    shell.className = 'timeline-shell';
    shell.style.setProperty('--tl-h', height + 'px');
    var axis = document.createElement('div');
    axis.className = 'timeline-axis';
    for (var minute = dayStart; minute <= dayEnd; minute += 60) {
      var label = document.createElement('span');
      label.textContent = minToTime(minute);
      label.style.top = ((minute - dayStart) / duration * 100) + '%';
      axis.appendChild(label);
    }
    shell.appendChild(axis);

    var main = document.createElement('div');
    main.className = 'timeline-main';
    for (var lineMin = dayStart; lineMin <= dayEnd; lineMin += 60) {
      var line = document.createElement('div');
      line.className = 'timeline-grid-line';
      line.style.top = ((lineMin - dayStart) / duration * 100) + '%';
      main.appendChild(line);
      if (lineMin < dayEnd) {
        var half = document.createElement('div');
        half.className = 'timeline-grid-line half';
        half.style.top = ((lineMin + 30 - dayStart) / duration * 100) + '%';
        main.appendChild(half);
      }
    }

    if (filter === 'both') {
      sharedFreeIntervals(items.cat, items.dog, dayStart, dayEnd).forEach(function (free) {
        var band = document.createElement('div');
        band.className = 'timeline-free-band';
        band.style.top = ((free.start - dayStart) / duration * 100) + '%';
        band.style.height = ((free.end - free.start) / duration * 100) + '%';
        band.innerHTML = '<span>共享空闲</span>';
        main.appendChild(band);
      });
    }

    var lanes = document.createElement('div');
    lanes.className = 'timeline-lanes';
    lanes.style.gridTemplateColumns = filter === 'both' ? '1fr 1fr' : '1fr';

    function appendLane(owner, ownerItems) {
      var lane = document.createElement('div');
      lane.className = 'timeline-lane ' + owner;
      var placed = [];
      ownerItems.slice().sort(function (a, b) { return a.start - b.start || a.end - b.end; }).forEach(function (item) {
        var col = 0;
        while (placed.some(function (other) { return other.col === col && item.start < other.end && item.end > other.start; })) col++;
        placed.push({ item: item, col: col });
      });
      var columns = placed.reduce(function (n, p) { return Math.max(n, p.col + 1); }, 1);
      placed.forEach(function (p) {
        var item = p.item;
        var event = document.createElement('div');
        event.className = 'timeline-event ' + owner;
        event.dataset.id = item.course.id;
        event.style.top = ((item.start - dayStart) / duration * 100) + '%';
        event.style.height = ((item.end - item.start) / duration * 100) + '%';
        event.style.left = 'calc(' + (p.col * 100 / columns) + '% + 1px)';
        event.style.width = 'calc(' + (100 / columns) + '% - 4px)';
        var meta = [item.course.loc, item.course.teacher].filter(Boolean).join(' · ');
        event.innerHTML = '<time>' + minToTime(item.start) + '-' + minToTime(item.end) + '</time><b>' + esc(item.course.name) + '</b>' + (meta ? '<small>' + esc(meta) + '</small>' : '');
        var topNode = document.createElement('i');
        topNode.className = 'timeline-node top';
        var bottomNode = document.createElement('i');
        bottomNode.className = 'timeline-node bottom';
        event.appendChild(topNode);
        event.appendChild(bottomNode);
        lane.appendChild(event);
      });
      lanes.appendChild(lane);
    }

    if (filter === 'cat') appendLane('cat', items.cat);
    else if (filter === 'dog') appendLane('dog', items.dog);
    else { appendLane('cat', items.cat); appendLane('dog', items.dog); }
    main.appendChild(lanes);
    shell.appendChild(main);
    card.appendChild(shell);

    var freeBox = document.createElement('div');
    freeBox.className = 'timeline-free';
    if (filter === 'both') {
      var free = sharedFreeIntervals(items.cat, items.dog, dayStart, dayEnd);
      freeBox.innerHTML = '<strong>两人都没课的共享时间</strong><br>' + (free.length ? free.map(function (x) { return minToTime(x.start) + '–' + minToTime(x.end); }).join('、') : '今天没有连续的共享空闲时段');
    } else {
      freeBox.innerHTML = '<strong>提示</strong><br>切换到“一起看”即可查看两人都没课的共享时间。';
    }
    card.appendChild(freeBox);
    var legend = document.createElement('div');
    legend.className = 'timeline-legend';
    legend.innerHTML = '<span><i class="dot-cat"></i>女生课程</span><span><i class="dot-dog"></i>男生课程</span><span><i class="dot-free"></i>共享空闲</span>';
    card.appendChild(legend);
    if (allItems.length) {
      var details = document.createElement('div');
      details.className = 'timeline-course-details';
      var detailsTitle = document.createElement('strong');
      detailsTitle.textContent = '当天课程详情';
      details.appendChild(detailsTitle);
      allItems.slice().sort(function (a, b) { return a.start - b.start || a.end - b.end; }).forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'timeline-course-detail ' + item.course.owner;
        var title = document.createElement('b');
        title.textContent = data.users[item.course.owner].name + ' · ' + item.course.name + ' · ' + minToTime(item.start) + '–' + minToTime(item.end);
        row.appendChild(title);
        if (item.course.loc) {
          var location = document.createElement('span');
          location.textContent = '教室：' + item.course.loc;
          row.appendChild(location);
        }
        if (item.course.teacher) {
          var teacher = document.createElement('span');
          teacher.textContent = '老师：' + item.course.teacher;
          row.appendChild(teacher);
        }
        details.appendChild(row);
      });
      card.appendChild(details);
    }
    timeline.appendChild(card);

    if (!allItems.length) {
      var empty = document.createElement('div');
      empty.className = 'timeline-empty';
      empty.textContent = '今天没有课程，整天都是共享空闲时间';
      timeline.insertBefore(empty, card);
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m];
    });
  }

  function renderAll() {
    document.title = data.productName || 'claswee';
    renderHeader();
    renderWeekBar();
    $('#layoutModeIcon').textContent = layoutMode === 'timeline' ? '◷' : '▦';
    $$('#layoutModeMenu button').forEach(function (button) {
      button.classList.toggle('on', button.dataset.layout === layoutMode);
    });
    $$('#viewSwitch button').forEach(function (button) {
      button.classList.toggle('on', button.dataset.view === filter);
    });
    $('#grid').parentElement.hidden = layoutMode === 'timeline';
    $('#timelineWrap').hidden = layoutMode !== 'timeline';
    renderGrid();
    if (layoutMode === 'timeline') renderTimeline();
  }

  /* ---------- 周次切换 ---------- */
  $('#prevWeek').onclick = function () { if (viewWeek > 1) { viewWeek--; renderAll(); } };
  $('#nextWeek').onclick = function () {
    if (viewWeek < calendarWeeks()) { viewWeek++; renderAll(); }
  };
  $('#todayBtn').onclick = function () { viewWeek = currentWeek(); timelineDay = realWeekday(new Date()); renderAll(); toast('回到本周'); };

  /* ---------- 视图过滤 ---------- */
  $('#viewSwitch').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    filter = b.dataset.view;
    $$('#viewSwitch button').forEach(function (x) { x.classList.toggle('on', x === b); });
    $('#filterPicker').classList.remove('open');
    $('#filterTrigger').setAttribute('aria-expanded', 'false');
    renderAll();
  };

  $('#filterTrigger').onclick = function (e) {
    e.stopPropagation();
    var picker = $('#filterPicker');
    var opened = picker.classList.toggle('open');
    $('#layoutPicker').classList.remove('open');
    $('#layoutModeTrigger').setAttribute('aria-expanded', 'false');
    $('#filterTrigger').setAttribute('aria-expanded', opened ? 'true' : 'false');
  };

  /* ---------- 顶部视图模式 ---------- */
  $('#layoutModeTrigger').onclick = function (e) {
    e.stopPropagation();
    var picker = $('#layoutPicker');
    var opened = picker.classList.toggle('open');
    $('#filterPicker').classList.remove('open');
    $('#filterTrigger').setAttribute('aria-expanded', 'false');
    $('#layoutModeTrigger').setAttribute('aria-expanded', opened ? 'true' : 'false');
  };
  $('#layoutModeMenu').onclick = function (e) {
    var b = e.target.closest('button[data-layout]');
    if (!b) return;
    layoutMode = b.dataset.layout === 'timeline' ? 'timeline' : 'sections';
    data.settings.layoutMode = layoutMode;
    save();
    $('#layoutPicker').classList.remove('open');
    $('#layoutModeTrigger').setAttribute('aria-expanded', 'false');
    renderAll();
    toast(layoutMode === 'timeline' ? '已切换到按时间排列' : '已切换到按节数排列');
  };
  document.addEventListener('click', function (e) {
    if (!e.target.closest('#layoutPicker')) {
      $('#layoutPicker').classList.remove('open');
      $('#layoutModeTrigger').setAttribute('aria-expanded', 'false');
    }
    if (!e.target.closest('#filterPicker')) {
      $('#filterPicker').classList.remove('open');
      $('#filterTrigger').setAttribute('aria-expanded', 'false');
    }
  });
  $('#timeline').onclick = function (e) {
    var dayButton = e.target.closest('.timeline-day-btn');
    if (dayButton) {
      timelineDay = +dayButton.dataset.day;
      renderTimeline();
      return;
    }
    var event = e.target.closest('.timeline-event');
    if (!event) return;
    var course = activeCourses().filter(function (x) { return x.id === event.dataset.id; })[0];
    if (course) openSheet(course);
  };

  /* ---------- 点击网格：空白加课 / 课程编辑 ---------- */
  $('#grid').addEventListener('click', function (e) {
    var course = e.target.closest('.course');
    if (course) {
      var c = activeCourses().filter(function (x) { return x.id === course.dataset.id; })[0];
      if (c) openSheet(c);
      return;
    }
    var cell = e.target.closest('.cell');
    if (cell) {
      openSheet(null, { day: +cell.dataset.day, s1: +cell.dataset.sec });
    }
  });

  /* ---------- 课程编辑面板 ---------- */
  function makeTimeSelect(kind, value) {
    var select = document.createElement('select');
    select.className = 'time-' + kind;
    var max = kind === 'day' ? 7 : sectionCount();
    for (var i = 1; i <= max; i++) {
      var option = document.createElement('option');
      option.value = i;
      option.textContent = kind === 'day' ? '周' + DAY_CN[i - 1] : '第' + i + '节';
      select.appendChild(option);
    }
    select.value = String(Math.max(1, Math.min(+value || 1, max)));
    return select;
  }

  function addTimeRow(slot) {
    var row = document.createElement('div');
    row.className = 'course-time-row';
    row.appendChild(makeTimeSelect('day', slot.day));
    row.appendChild(makeTimeSelect('start', slot.s1));
    row.appendChild(makeTimeSelect('end', slot.s2));
    var remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'time-remove';
    remove.textContent = '×';
    remove.setAttribute('aria-label', '删除这个上课时间');
    row.appendChild(remove);
    $('#fTimes').appendChild(row);
  }

  function renderTimeRows(slots) {
    $('#fTimes').innerHTML = '';
    (slots && slots.length ? slots : [{ day: 1, s1: 1, s2: 2 }]).forEach(addTimeRow);
  }

  function readTimeRows() {
    return $$('#fTimes .course-time-row').map(function (row) {
      var s1 = +row.querySelector('.time-start').value;
      var s2 = +row.querySelector('.time-end').value;
      return {
        day: +row.querySelector('.time-day').value,
        s1: s1,
        s2: Math.max(s1, s2)
      };
    });
  }


  $('#btnAddTime').onclick = function () {
    addTimeRow({ day: 1, s1: 1, s2: Math.min(2, sectionCount()) });
  };
  $('#fTimes').onchange = function (e) {
    if (!e.target.matches('.time-start')) return;
    var row = e.target.closest('.course-time-row');
    var end = row.querySelector('.time-end');
    if (+end.value < +e.target.value) end.value = e.target.value;
  };
  $('#fTimes').onclick = function (e) {
    if (!e.target.closest('.time-remove')) return;
    var rows = $$('#fTimes .course-time-row');
    if (rows.length === 1) { toast('至少保留一个上课时间'); return; }
    e.target.closest('.course-time-row').remove();
  };

  function setSeg(sel, val) {
    $$(sel + ' button').forEach(function (b) {
      var selected = b.dataset.owner === val || b.dataset.mode === val || b.dataset.me === val || b.dataset.parity === val;
      b.classList.toggle('on', selected);
      b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
  }

  $('#fOwner').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    setSeg('#fOwner', b.dataset.owner);
  };
  $('#fWeekMode').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    setSeg('#fWeekMode', b.dataset.mode);
    $('#fWeekCustom').classList.toggle('show', b.dataset.mode === 'custom');
  };
  $('#fWeekCustomParity').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    setSeg('#fWeekCustomParity', b.dataset.parity);
  };

  function openSheet(course, preset) {
    editingId = course ? course.id : null;
    $('#sheetTitle').textContent = course ? '编辑课程' : '添加课程';
    $('#fDelete').style.display = course ? 'block' : 'none';

    var defaultDay = (preset && preset.day) || (layoutMode === 'timeline' ? timelineDay : 1);
    var c = course || {
      owner: data.me, name: '', loc: '', teacher: '',
      day: defaultDay,
      s1: (preset && preset.s1) || 1,
      s2: (preset && preset.s1 ? Math.min(preset.s1 + 1, sectionCount()) : 2),
      week: 'all', wf: 1, wt: data.settings.weeks, customParity: 'all',
      slots: [{
        day: defaultDay,
        s1: (preset && preset.s1) || 1,
        s2: (preset && preset.s1 ? Math.min(preset.s1 + 1, sectionCount()) : 2)
      }]
    };

    $('#fName').value = c.name;
    $('#fLoc').value = c.loc;
    $('#fTeacher').value = c.teacher;
    setSeg('#fOwner', c.owner);
    $('#fSectionTimesField').style.display = 'block';
    renderTimeRows(courseSlots(c));
    setSeg('#fWeekMode', c.week);
    $('#fWeekCustom').classList.toggle('show', c.week === 'custom');
    $('#fWeekFrom').value = c.wf;
    $('#fWeekTo').value = c.wt;
    setSeg('#fWeekCustomParity', c.customParity || 'all');

    $('#sheetMask').classList.add('show');
    $('#courseSheet').classList.add('show');
  }

  function closeSheet() {
    $('#sheetMask').classList.remove('show');
    $('#courseSheet').classList.remove('show');
    editingId = null;
  }

  $('#sheetCancel').onclick = closeSheet;
  $('#sheetMask').onclick = closeSheet;

  $('#sheetSave').onclick = function () {
    var name = $('#fName').value.trim();
    if (!name) { toast('课程名称不能为空'); return; }
    var ownerBtn = $('#fOwner button.on');
    var modeBtn = $('#fWeekMode button.on');
    var parityBtn = $('#fWeekCustomParity button.on');
    var slots = readTimeRows();
    if (!slots.length) { toast('请至少添加一个上课时间'); return; }

    var payload = {
      owner: ownerBtn ? ownerBtn.dataset.owner : data.me,
      name: name,
      loc: $('#fLoc').value.trim(),
      teacher: $('#fTeacher').value.trim(),
      day: slots[0].day,
      s1: slots[0].s1, s2: slots[0].s2,
      slots: slots,
      week: modeBtn ? modeBtn.dataset.mode : 'all',
      wf: +$('#fWeekFrom').value || 1,
      wt: +$('#fWeekTo').value || data.settings.weeks,
      customParity: parityBtn ? parityBtn.dataset.parity : 'all'
    };

    if (editingId) {
      activeCourses().forEach(function (c) {
        if (c.id === editingId) Object.assign(c, payload);
      });
      toast('已更新');
    } else {
      var nc = mk(payload.owner, payload.name, payload.loc, payload.teacher, payload.day, payload.s1, payload.s2, payload.week, payload.wf, payload.wt, payload.customParity, payload.slots);
      activeCourses().push(nc);
      toast('已添加 ' + payload.name);
    }
    save();
    renderAll();
    closeSheet();
    autoPush();
  };

  $('#fDelete').onclick = function () {
    if (!editingId) return;
    if (!confirm('确定删除这门课？')) return;
    var deletedId = editingId;
    if (!Array.isArray(data.deletedCourses)) data.deletedCourses = [];
    if (!data.deletedCourses.some(function (item) { return item.id === deletedId; })) {
      data.deletedCourses.push({ id: deletedId, at: Date.now() });
      if (data.deletedCourses.length > 100) data.deletedCourses = data.deletedCourses.slice(-100);
    }
    data.courses = data.courses.filter(function (course) { return course.id !== deletedId; });
    save();
    renderAll();
    closeSheet();
    toast('已删除');
  };

  /* ---------- 底部导航 ---------- */
  $$('.tab[data-page]').forEach(function (t) {
    t.onclick = function () {
      $$('.tab[data-page]').forEach(function (x) { x.classList.remove('on'); });
      t.classList.add('on');
      $$('.page').forEach(function (p) { p.classList.toggle('active', p.id === t.dataset.page); });
      if (t.dataset.page !== 'page-sync') clearPasswordChangeFields();
      window.scrollTo(0, 0);
    };
  });
  $('#fabAdd').onclick = function () { openSheet(null, null); };
  $('#avatarMe').onclick = function () { openAvatar('cat'); };
  $('#avatarTa').onclick = function () { openAvatar('dog'); };

  /* ---------- 设置页 ---------- */
  function fillSettings() {
    paintAvatar($('#setAvatarCat'), data.users.cat.avatar);
    paintAvatar($('#setAvatarDog'), data.users.dog.avatar);
    $('#setAvatarCat').className = 'avatar lg';
    $('#setAvatarDog').className = 'avatar lg dog';
    $('#setNickCat').value = data.users.cat.name;
    $('#setNickDog').value = data.users.dog.name;
    setSeg('#setMe', data.me);
    ensureSemesterDates();
    fillMondayPicker('cat', data.settings.catStart);
    fillMondayPicker('dog', data.settings.dogStart);
    $('#setWeeks').value = data.settings.weeks;
    $('#setWeekend').checked = !!data.settings.weekend;
    renderSections();
  }

  function renderSections() {
    var list = $('#sectionList');
    list.innerHTML = '';
    var sections = sectionListOwner(sectionTimeOwner);
    sections.forEach(function (sec, i) {
      var row = document.createElement('div');
      row.className = 'sec-row';
      row.innerHTML =
        '<span class="sn-no">第' + (i + 1) + '节</span>' +
        '<input type="time" value="' + sec.s + '" data-k="s" data-i="' + i + '">' +
        '<input type="time" value="' + sec.e + '" data-k="e" data-i="' + i + '">' +
        '<button class="sec-del" data-i="' + i + '" aria-label="删除第' + (i + 1) + '节">×</button>';
      list.appendChild(row);
    });
    $$('#sectionTimeOwnerSwitch button').forEach(function (button) {
      var selected = button.dataset.owner === sectionTimeOwner;
      button.classList.toggle('on', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    $('#sectionTimeCurrent').textContent = data.users[sectionTimeOwner].name + '的节次时间';
  }

  function sectionListOwner(owner) {
    return owner === 'dog' ? data.settings.dogSections : data.settings.catSections;
  }

  $('#sectionTimeOwnerSwitch').addEventListener('click', function (e) {
    var button = e.target.closest('button[data-owner]');
    if (!button) return;
    sectionTimeOwner = button.dataset.owner === 'dog' ? 'dog' : 'cat';
    renderSections();
  });

  $('#sectionList').addEventListener('input', function (e) {
    var t = e.target;
    if (!t.dataset || t.dataset.k === undefined) return;
    var sections = sectionListOwner(sectionTimeOwner);
    if (!sections[+t.dataset.i]) return;
    sections[+t.dataset.i][t.dataset.k] = t.value;
    ensureScheduleTimes();
    save();
    renderAll();
  });

  $('#sectionList').addEventListener('click', function (e) {
    var b = e.target.closest('.sec-del');
    if (!b) return;
    var index = +b.dataset.i;
    var sections = sectionListOwner(sectionTimeOwner);
    if (sections.length <= 1) { toast('每个人至少保留一节课'); return; }
    sections.splice(index, 1);
    ensureScheduleTimes();
    clampCourses();
    save();
    renderSections();
    renderAll();
    toast('已删除' + data.users[sectionTimeOwner].name + '的第' + (index + 1) + '节');
  });

  $('#addSection').onclick = function () {
    ensureScheduleTimes();
    var sections = sectionListOwner(sectionTimeOwner);
    var last = sections[sections.length - 1];
    sections.push({ s: addMinutes(last.e, 5), e: addMinutes(last.e, 50) });
    ensureScheduleTimes();
    save();
    renderSections();
    renderAll();
    toast('已添加' + data.users[sectionTimeOwner].name + '的第' + sections.length + '节');
  };

  function addMinutes(hm, m) {
    var p = hm.split(':');
    var d = new Date(2000, 0, 1, +p[0], +p[1]);
    d.setMinutes(d.getMinutes() + m);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function clampCourses() {
    [data.courses].forEach(function (list) {
      (list || []).forEach(function (c) {
        var ownerSections = c.owner === 'dog' ? data.settings.dogSections : data.settings.catSections;
        var n = Math.max(1, ownerSections.length);
        var slots = courseSlots(c);
        slots.forEach(function (slot) {
          slot.s1 = Math.max(1, Math.min(slot.s1, n));
          slot.s2 = Math.max(slot.s1, Math.min(slot.s2, n));
        });
        c.slots = slots;
        c.day = slots[0].day;
        c.s1 = slots[0].s1;
        c.s2 = slots[0].s2;
      });
    });
  }

  $('#setMe').onclick = function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    data.me = b.dataset.me;
    setSeg('#setMe', data.me);
    save();
    renderHeader();
    toast('身份已切换');
  };

  function bindNick(sel, who) {
    $(sel).addEventListener('input', function () {
      var v = $(sel).value.trim() || (who === 'cat' ? '小猫' : '小狗');
      data.users[who].name = v;
      save();
      renderHeader();
    });
  }
  bindNick('#setNickCat', 'cat');
  bindNick('#setNickDog', 'dog');

  function updateOwnerStart(owner, value) {
    if (!isMonday(value)) { toast('请选择第一周的周一'); fillSettings(); return; }
    if (owner === 'dog') data.settings.dogStart = value;
    else data.settings.catStart = value;
    ensureSemesterDates();
    save();
    viewWeek = currentWeek();
    renderAll();
  }
  function mondayPicker(owner) { return $(owner === 'dog' ? '#setDogStart' : '#setCatStart'); }
  function pickerOptions(select, values, label, selected) {
    select.innerHTML = '';
    values.forEach(function (value) {
      var option = document.createElement('option');
      option.value = String(value); option.textContent = label(value); select.appendChild(option);
    });
    select.value = String(selected);
  }
  function fillMondayDays(picker, selectedDay) {
    var year = +picker.querySelector('[data-part="year"]').value;
    var month = +picker.querySelector('[data-part="month"]').value;
    var select = picker.querySelector('[data-part="day"]'), days = mondayDays(year, month);
    select.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = ''; placeholder.textContent = '请选择周一'; placeholder.disabled = true; select.appendChild(placeholder);
    days.forEach(function (day) {
      var option = document.createElement('option'); option.value = String(day); option.textContent = day + '日（周一）'; select.appendChild(option);
    });
    select.value = days.indexOf(+selectedDay) >= 0 ? String(+selectedDay) : '';
  }
  function fillMondayPicker(owner, value) {
    var picker = mondayPicker(owner), parts = String(value).split('-').map(Number);
    pickerOptions(picker.querySelector('[data-part="year"]'), Array.from({ length: 131 }, function (_, i) { return i + 1970; }), function (year) { return year + '年'; }, parts[0]);
    pickerOptions(picker.querySelector('[data-part="month"]'), Array.from({ length: 12 }, function (_, i) { return i + 1; }), function (month) { return month + '月'; }, parts[1]);
    fillMondayDays(picker, parts[2]);
  }
  ['cat', 'dog'].forEach(function (owner) {
    var picker = mondayPicker(owner);
    picker.onchange = function (event) {
      var daySelect = picker.querySelector('[data-part="day"]');
      if (event.target.dataset.part !== 'day') fillMondayDays(picker, daySelect.value);
      if (!daySelect.value) return;
      var year = picker.querySelector('[data-part="year"]').value, month = picker.querySelector('[data-part="month"]').value;
      updateOwnerStart(owner, year + '-' + pad(+month) + '-' + pad(+daySelect.value));
    };
  });
  $('#setWeeks').onchange = function () {
    var v = +$('#setWeeks').value || 20;
    data.settings.weeks = Math.max(1, Math.min(40, v));
    $('#setWeeks').value = data.settings.weeks;
    save();
    if (viewWeek > calendarWeeks()) viewWeek = calendarWeeks();
    renderAll();
  };
  $('#setWeekend').onchange = function () {
    data.settings.weekend = $('#setWeekend').checked;
    save();
    renderAll();
  };

  $('#btnClear').onclick = function () {
    if (!confirm('清空所有课程？此操作不可恢复')) return;
    activeCourses().splice(0, activeCourses().length);
    save();
    renderAll();
    toast('已清空');
    autoPush();
  };
  $('#btnReset').onclick = function () {
    if (!confirm('恢复默认设置与示例课程？当前课程会被覆盖')) return;
    data = defaultData();
    ensureScheduleTimes();
    ensureCourses();
    layoutMode = 'sections';
    save();
    viewWeek = currentWeek();
    fillSettings();
    renderAll();
    toast('已恢复默认');
  };

  /* ---------- 头像选择 ---------- */
  function openAvatar(who) {
    avatarTarget = who;
    tempAvatar = data.users[who].avatar;
    var box = $('#emojiGrid');
    box.innerHTML = '';
    EMOJIS.forEach(function (em) {
      var b = document.createElement('button');
      b.textContent = em;
      if (em === tempAvatar) b.classList.add('on');
      b.onclick = function () {
        tempAvatar = em;
        $$('#emojiGrid button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        paintAvatar($('#avatarPreview'), em);
      };
      box.appendChild(b);
    });
    paintAvatar($('#avatarPreview'), tempAvatar);
    $('#avatarMask').classList.add('show');
    $('#avatarSheet').classList.add('show');
  }

  function closeAvatar() {
    $('#avatarMask').classList.remove('show');
    $('#avatarSheet').classList.remove('show');
  }
  $('#avatarCancel').onclick = closeAvatar;
  $('#avatarMask').onclick = closeAvatar;
  $('#avatarSave').onclick = function () {
    data.users[avatarTarget].avatar = tempAvatar;
    save();
    renderHeader();
    fillSettings();
    closeAvatar();
    toast('头像已更新');
    autoPush();
  };

  $$('[data-pick-avatar]').forEach(function (b) {
    b.onclick = function () { openAvatar(b.dataset.pickAvatar); };
  });

  $('#btnUploadAvatar').onclick = function () { $('#avatarFile').click(); };
  $('#avatarFile').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    compress(f, 240, function (dataUrl) {
      tempAvatar = dataUrl;
      paintAvatar($('#avatarPreview'), dataUrl);
      $$('#emojiGrid button').forEach(function (x) { x.classList.remove('on'); });
    });
    e.target.value = '';
  };

  function compress(file, max, cb) {
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(cv.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- 同步页 ---------- */
  var syncMode = 'join';

  function renderSyncConnection() {
    var cfg = Sync.getConfig();
    var connected = Sync.ready();
    $('#syncDisconnected').hidden = connected;
    $('#syncConnected').hidden = !connected;
    $('#syncRoomActions').hidden = !connected;
    $('#btnLeaveRoom').hidden = !connected;
    $('#syncConnectedRoom').textContent = connected ? cfg.room : '';
    $('#changePasswordRoom').readOnly = connected;
    if (connected || !$('#changePasswordRoom').value) $('#changePasswordRoom').value = cfg.room || '';
    $('#btnEnterRoom').disabled = false;
  }

  function setSyncMode(mode) {
    syncMode = mode === 'create' ? 'create' : 'join';
    $('#syncModeJoin').classList.toggle('on', syncMode === 'join');
    $('#syncModeCreate').classList.toggle('on', syncMode === 'create');
    $('#syncConfirmField').hidden = syncMode !== 'create';
    $('#btnEnterRoom').textContent = syncMode === 'create' ? '创建并上传当前课表' : '验证密码并加入';
    $('#syncPassword').setAttribute('autocomplete', syncMode === 'create' ? 'new-password' : 'current-password');
    $('#syncRoomNotice').textContent = syncMode === 'create'
      ? '新房间码不区分大小写；已使用或属于旧房间的房间码不能重复创建。'
      : '已有房间请输入密码加入；旧房间首次加入时会提示设置首个密码。';
    $('#syncPassword').value = '';
    $('#syncPasswordConfirm').value = '';
    setSyncStatus('', true);
  }

  function fillSync() {
    var cfg = Sync.getConfig();
    $('#syncRoom').value = cfg.room || '';
    $('#syncAuto').checked = cfg.auto !== false;
    $('#syncAutoPush').checked = cfg.autoPush !== false;
    $('#syncInfo').textContent = '上次同步：' + Sync.lastSyncText();
    renderSyncConnection();
  }

  function bindSyncCfg() {
    // Room input is a draft; change the saved connection only after password verification.
    $('#syncModeJoin').onclick = function () { setSyncMode('join'); };
    $('#syncModeCreate').onclick = function () { setSyncMode('create'); };
    $('#syncAuto').addEventListener('change', function () {
      Sync.setConfig({ auto: $('#syncAuto').checked });
      if ($('#syncAuto').checked) autoPull();
    });
    $('#syncAutoPush').addEventListener('change', function () { Sync.setConfig({ autoPush: $('#syncAutoPush').checked }); });
  }
  bindSyncCfg();

  function setSyncStatus(msg, ok) {
    var el = $('#syncStatus');
    el.textContent = msg;
    el.style.color = ok ? '#2E8B57' : '#C0392B';
  }

  function validateRoomForm() {
    var room = $('#syncRoom').value.trim();
    var password = $('#syncPassword').value;
    if (syncMode === 'create' && !/^[A-Za-z0-9_-]{4,24}$/.test(room)) throw new Error('新房间码需为 4–24 位字母、数字、横线或下划线');
    if (syncMode === 'join' && (!room || room.length > 64)) throw new Error('请填写正确的房间码');
    if (password.length < 6 || password.length > 72) throw new Error('密码需为 6–72 位');
    if (syncMode === 'create' && password !== $('#syncPasswordConfirm').value) throw new Error('两次输入的密码不一致');
    return { room: room, password: password };
  }

  function clearPasswordChangeFields() {
    ['#changePasswordOld', '#changePasswordNew', '#changePasswordConfirm'].forEach(function (selector) { $(selector).value = ''; });
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) clearPasswordChangeFields(); });
  $('#btnChangePassword').onclick = function () {
    var button = $('#btnChangePassword'), status = $('#changePasswordStatus');
    if (button.disabled) return;
    var room = (Sync.ready() ? Sync.getConfig().room : $('#changePasswordRoom').value).trim();
    var oldPassword = $('#changePasswordOld').value, newPassword = $('#changePasswordNew').value;
    function show(message, success) { status.textContent = message; status.style.color = success ? '#2E8B57' : '#C0392B'; }
    if (!room || room.length > 64) { show('请填写正确的房间码', false); return; }
    if (!oldPassword || oldPassword.length > 72) { show('请填写旧密码', false); return; }
    if (newPassword.length < 6 || newPassword.length > 72) { show('新密码需为 6–72 位', false); return; }
    if (newPassword !== $('#changePasswordConfirm').value) { show('两次输入的新密码不一致', false); return; }
    if (oldPassword === newPassword) { show('新密码不能与旧密码相同', false); return; }
    button.disabled = true; show('正在验证旧密码并修改…', true);
    Sync.changePassword(room, oldPassword, newPassword).then(function (result) {
      show('房间 ' + result.room + ' 的密码已修改。已连接设备继续同步，之后加入请用新密码。', true);
      toast('密码已修改');
    }).catch(function (error) { show(error.message, false); }).finally(function () {
      clearPasswordChangeFields(); button.disabled = false;
    });
  };

  function useConnectedRoom(result, previousRoom) {
    if (result.data) {
      var sameRoom = previousRoom && String(previousRoom).toLowerCase() === String(result.room).toLowerCase();
      adoptRemote(result.data, sameRoom);
    }
    $('#syncPassword').value = '';
    $('#syncPasswordConfirm').value = '';
    fillSync();
  }

  $('#btnEnterRoom').onclick = function () {
    var form;
    try { form = validateRoomForm(); }
    catch (error) { setSyncStatus(error.message, false); return; }
    var button = $('#btnEnterRoom');
    var previousRoom = Sync.getConfig().room;
    button.disabled = true;
    setSyncStatus(syncMode === 'create' ? '正在创建房间…' : '正在验证密码…', true);
    var action = syncMode === 'create' ? Sync.createRoom(form.room, form.password, data) : Sync.joinRoom(form.room, form.password);
    action.then(function (result) {
      useConnectedRoom(result, previousRoom);
      setSyncStatus(syncMode === 'create' ? '房间创建成功，当前课表已上传 ✅' : '密码正确，已加入并拉取课表 ✅', true);
      toast(syncMode === 'create' ? '房间创建成功' : '已加入安全房间');
    }).catch(function (error) {
      if (error.code !== 'LEGACY_ROOM_UNCLAIMED') throw error;
      if (!confirm('这是以前创建的无密码房间。\n\n确认后，当前输入的密码将成为这个房间的新密码，原课表会完整保留。是否继续？')) throw new Error('已取消认领旧房间');
      setSyncStatus('正在认领并迁移旧房间…', true);
      return Sync.claimLegacy(form.room, form.password).then(function (result) {
        useConnectedRoom(result, previousRoom);
        setSyncStatus('旧房间已设置密码，原课表已保留 ✅', true);
        toast('旧房间认领成功');
      });
    }).catch(function (error) {
      setSyncStatus(error.message, false);
      renderSyncConnection();
    }).then(function () { button.disabled = false; });
  };

  $('#btnLeaveRoom').onclick = function () {
    if (!confirm('退出只会注销本机访问凭证，不会删除云端房间和本地课表。确定退出吗？')) return;
    Sync.leaveRoom().then(function () {
      $('#syncRoom').value = '';
      setSyncMode('join');
      fillSync();
      setSyncStatus('已退出当前房间', true);
    });
  };

  $('#btnPush').onclick = function () {
    if (!Sync.ready()) { setSyncStatus('请先创建或加入房间', false); return; }
    setSyncStatus('正在上传…', true);
    Sync.push(data).then(function () {
      setSyncStatus('上传成功 ✅', true);
      $('#syncInfo').textContent = '上次同步：' + Sync.lastSyncText();
      toast('已上传到云端');
    }).catch(function (e) {
      setSyncStatus('上传失败：' + e.message, false);
      if (e.code === 'UNAUTHORIZED') renderSyncConnection();
    });
  };

  function adoptRemote(remote, preserveLocalDeletes) {
    var localDeletes = preserveLocalDeletes === false ? [] : (Array.isArray(data.deletedCourses) ? data.deletedCourses.slice() : []);
    var mergedLocalDelete = false;
    data = remote;
    if (!data.settings || !data.settings.sections) data.settings = defaultData().settings;
    if (!data.users) data.users = defaultData().users;
    ensureSemesterDates();
    data.productName = 'claswee';
    if (!data.settings.layoutMode) data.settings.layoutMode = layoutMode;
    if (!Array.isArray(data.deletedCourses)) data.deletedCourses = [];
    localDeletes.forEach(function (item) {
      var exists = data.deletedCourses.some(function (remoteItem) {
      return remoteItem.id === item.id;
      });
      if (!exists) {
        data.deletedCourses.push(item);
        mergedLocalDelete = true;
      }
    });
    ensureScheduleTimes();
    ensureCourses();
    layoutMode = data.settings.layoutMode;
    if (mergedLocalDelete) data.updatedAt = Math.max(Date.now(), (+data.updatedAt || 0) + 1);
    Sync.saveLocal(data, true);
    viewWeek = currentWeek();
    fillSettings();
    renderAll();
    if (mergedLocalDelete) autoPush();
  }

  $('#btnPull').onclick = function () {
    if (!Sync.ready()) { setSyncStatus('请先创建或加入房间', false); return; }
    setSyncStatus('正在拉取…', true);
    Sync.pull().then(function (remote) {
      var rt = remote.updatedAt || 0, lt = data.updatedAt || 0;
      if (rt < lt && !confirm('云端课表比本机旧，仍要覆盖本机吗？')) {
        setSyncStatus('已取消', true);
        return;
      }
      adoptRemote(remote);
      setSyncStatus('拉取成功 ✅', true);
      $('#syncInfo').textContent = '上次同步：' + Sync.lastSyncText();
      toast('已同步云端课表');
    }).catch(function (e) {
      setSyncStatus('拉取失败：' + e.message, false);
      if (e.code === 'UNAUTHORIZED') renderSyncConnection();
    });
  };

  var autoPushTimer = null;
  function autoPush() {
    var cfg = Sync.getConfig();
    if (!Sync.ready() || cfg.autoPush === false) return;
    clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(function () {
      Sync.push(data).then(function () {
        setSyncStatus('已自动上传 ✅', true);
        $('#syncInfo').textContent = '上次同步：' + Sync.lastSyncText();
      }).catch(function (e) {
        if (e.code === 'STALE_WRITE') {
          setSyncStatus('云端已有更新，正在获取最新课表…', true);
          autoPull();
          return;
        }
        setSyncStatus('自动上传失败：' + e.message, false);
        if (e.code === 'UNAUTHORIZED') renderSyncConnection();
      });
    }, 500);
  }

  var autoPullBusy = false;
  function autoPull() {
    var cfg = Sync.getConfig();
    if (cfg.auto === false || !Sync.ready() || autoPullBusy) return;
    autoPullBusy = true;
    Sync.pull().then(function (remote) {
      if ((remote.updatedAt || 0) > (data.updatedAt || 0)) {
        adoptRemote(remote);
        setSyncStatus('已自动获取最新课表 ✅', true);
        $('#syncInfo').textContent = '上次同步：' + Sync.lastSyncText();
        toast('课表已自动更新');
      }
    }).catch(function (e) {
      if (e.code === 'UNAUTHORIZED') renderSyncConnection();
      /* 其他网络短暂波动静默等待下次检查。 */
    }).then(function () {
      autoPullBusy = false;
    });
  }

  function csvCell(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }
  function weekText(course) {
    if (course.week === 'odd') return '单周';
    if (course.week === 'even') return '双周';
    if (course.week === 'custom') {
      var parity = course.customParity === 'odd' ? '单周' : (course.customParity === 'even' ? '双周' : '每周');
      return '第' + course.wf + '–' + course.wt + '周（' + parity + '）';
    }
    return '每周';
  }
  function exportTable() {
    var rows = [['课程名称', '谁的课', '星期', '开始节次', '结束节次', '周次', '上课地点', '老师']];
    activeCourses().forEach(function (course) {
      courseSlots(course).forEach(function (slot) {
        rows.push([
          course.name,
          data.users[course.owner] ? data.users[course.owner].name : course.owner,
          '周' + DAY_CN[(+slot.day || 1) - 1],
          '第' + slot.s1 + '节',
          '第' + slot.s2 + '节',
          weekText(course),
          course.loc || '',
          course.teacher || ''
        ]);
      });
    });
    var csv = '\uFEFF' + rows.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'claswee课表.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 300);
  }

  $('#btnExport').onclick = function () {
    exportTable();
    $('#fileStatus').textContent = '已导出表格，可用 Excel、WPS 或 Numbers 打开';
    $('#fileStatus').style.color = '#2E8B57';
  };
  $('#btnExportSync').onclick = function () {
    Sync.exportFile(data, 'claswee同步文件.json');
    $('#fileStatus').textContent = '已导出同步文件，发给对方导入即可';
    $('#fileStatus').style.color = '#2E8B57';
  };
  $('#btnImport').onclick = function () { $('#fileImport').click(); };
  $('#fileImport').onchange = function (e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    Sync.importFile(f).then(function (remote) {
      data = remote;
      if (!data.settings || !data.settings.sections) data.settings = defaultData().settings;
      if (!data.users) data.users = defaultData().users;
      ensureSemesterDates();
      data.productName = 'claswee';
      if (!data.settings.layoutMode) data.settings.layoutMode = layoutMode;
      ensureScheduleTimes();
      ensureCourses();
      layoutMode = data.settings.layoutMode;
      save();
      viewWeek = currentWeek();
      fillSettings();
      renderAll();
      $('#fileStatus').textContent = '导入成功 ✅ 共 ' + activeCourses().length + ' 门课';
      $('#fileStatus').style.color = '#2E8B57';
      toast('导入成功');
    }).catch(function (err) {
      $('#fileStatus').textContent = err.message;
      $('#fileStatus').style.color = '#C0392B';
    });
    e.target.value = '';
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js?v=71').catch(function () { });
    });
  }

  /* 启动、回到前台和停留在页面时自动获取最新课表。 */
  (function boot() {
    autoPull();
    window.addEventListener('focus', autoPull);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) autoPull();
    });
    setInterval(function () {
      if (!document.hidden) autoPull();
    }, 15000);
  })();

  /* ---------- 启动 ---------- */
  fillSettings();
  fillSync();
  renderAll();

  /* 跨午夜刷新当前节次 */
  setInterval(function () { layoutMode === 'timeline' ? renderTimeline() : renderGrid(); }, 60000);
})();
