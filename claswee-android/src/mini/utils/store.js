import * as Model from '../../vendor/model';
import { state, editData } from '../../lib/state';
import { notify } from '../navigation';

function get() { return Model.clone(state.data); }
function save(data) {
  const next = Model.normalize(Model.clone(data));
  const incoming = new Set(next.courses.map(course => course.id));
  for (const course of state.data.courses) if (!incoming.has(course.id) && !next.deletedCourses.some(row => row.id === course.id)) next.deletedCourses.push({ id: course.id, at: Date.now() });
  next.deletedCourses = next.deletedCourses.slice(-100);
  editData(current => { Object.keys(current).forEach(key => delete current[key]); Object.assign(current, next); }).catch(error => notify(error.message));
  return get();
}
function reset() {
  const next = Model.defaults(); next.me = state.data.me;
  next.deletedCourses = state.data.courses.map(course => ({ id: course.id, at: Date.now() }));
  Model.markSectionTimesChanged(next, ['cat', 'dog']);
  return save(next);
}
export default { ...Model, get, save, reset };
