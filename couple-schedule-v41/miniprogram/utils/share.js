const TITLE = '不用再问TA什么时候下课｜claswee 情侣课表';
const IMAGE = '/assets/share-schedule.jpg';

function enable() {
  if (typeof wx.showShareMenu !== 'function') return;
  wx.showShareMenu({
    menus: ['shareAppMessage', 'shareTimeline'],
    fail() {
      // Older clients may not support the timeline menu yet.
      wx.showShareMenu({ menus: ['shareAppMessage'], fail() {} });
    }
  });
}

// Share the app, never the user's room credentials or current course data.
function appMessage() {
  return { title: TITLE, path: '/pages/schedule/index', imageUrl: IMAGE };
}

function timeline() {
  // An explicit empty query prevents forwarding editing IDs or incoming parameters.
  return { title: TITLE, query: '', imageUrl: IMAGE };
}

function roomInvite(room) {
  return { title: '和你，一起看我们的课表', path: `/pages/sync/index?invite=1&room=${encodeURIComponent(room)}`, imageUrl: IMAGE };
}

module.exports = { enable, appMessage, timeline, roomInvite };
