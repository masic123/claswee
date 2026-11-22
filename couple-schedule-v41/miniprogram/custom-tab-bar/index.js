Component({
  data: {
    selected: 1,
    skin: 'blush',
    tabs: [
      { pagePath: '/pages/settings/index', text: '设置', icon: 'settings' },
      { pagePath: '/pages/schedule/index', text: '课表', icon: 'schedule', primary: true },
      { pagePath: '/pages/sync/index', text: '同步', icon: 'sync' }
    ]
  },
  methods: {
    switchTab(event) {
      const index = +event.currentTarget.dataset.index;
      const tab = this.data.tabs[index];
      if (!tab || index === this.data.selected) return;
      this.setData({ selected: index });
      wx.switchTab({ url: tab.pagePath });
    }
  }
});
