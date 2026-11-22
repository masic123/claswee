import { state } from '../../lib/state';
import { ui, switchTab } from '../navigation';
const tabs = [{ text: '设置', icon: 'settings', pagePath: 'settings' }, { text: '课表', icon: 'schedule', pagePath: 'schedule', primary: true }, { text: '同步', icon: 'sync', pagePath: 'sync' }];
export default {
  data: { skin: 'blush', selected: 1, tabs },
  onShow() { this.update(); },
  update() { this.setData({ selected: tabs.findIndex(item => item.pagePath === ui.tab), skin: state.skin }); },
  switchTab(event) { switchTab(tabs[+event.currentTarget.dataset.index].pagePath); },
};
