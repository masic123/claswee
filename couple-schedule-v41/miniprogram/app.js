const Store = require('./utils/store');
const Sync = require('./utils/sync');
const Invite = require('./utils/invite');
App({
  globalData: { cloudEnv: 'masic-blog-d6g6d4r87bc035c0e', buildVersion: '1.1.6', syncMethods: Object.keys(Sync).filter(key => typeof Sync[key] === 'function') },
  onLaunch(options) {
    Invite.capture(options);
    if (wx.cloud) wx.cloud.init({ env: this.globalData.cloudEnv, traceUser: true });
    this.autoPull();
  },
  onShow(options) { Invite.capture(options); this.autoPull(); clearInterval(this.autoTimer); this.autoTimer = setInterval(() => this.autoPull(), 15000); },
  onHide() { clearInterval(this.autoTimer); },
  autoPull() {
    const cfg = Sync.config(); if (!cfg.room || this.pulling) return;
    this.pulling = true;
    Sync.pull().then(remote => { const current = Sync.config(); if (current.room !== cfg.room || current.token !== cfg.token) return; const local = Store.get(); if (remote && (+remote.updatedAt || 0) > (+local.updatedAt || 0)) Store.adoptRemote(remote, local); }).catch(() => {}).then(() => { this.pulling = false; });
  }
});
