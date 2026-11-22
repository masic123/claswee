import { state, setSkin } from '../../lib/state';
import { notify } from '../navigation';
const THEMES = {
  blush: { name: '心动粉蓝', navigation: '#fff6fa', textStyle: 'black' },
  mint: { name: '海盐薄荷', navigation: '#e4f3ea', textStyle: 'black' },
  sun: { name: '日光奶油', navigation: '#fceac3', textStyle: 'black' },
  night: { name: '午夜星图', navigation: '#1a2946', textStyle: 'white' },
};
const normalize = value => Object.hasOwn(THEMES, value) ? value : 'blush';
function get() { return state.skin; }
function set(value) { const skin = normalize(value); setSkin(skin).catch(error => notify(error.message)); return skin; }
function apply(page) { page.setData({ skin: state.skin }); return state.skin; }
export default { THEMES, normalize, get, set, apply, applyNavigation() {} };
