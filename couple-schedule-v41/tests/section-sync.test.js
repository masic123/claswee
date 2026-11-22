const assert = require('node:assert/strict');
const test = require('node:test');

test('mini-program adopts section versions independently and stores a fresh timestamp', () => {
  const values = new Map();
  global.wx = {
    getStorageSync: key => values.get(key),
    setStorageSync: (key, value) => values.set(key, JSON.parse(JSON.stringify(value)))
  };
  delete require.cache[require.resolve('../miniprogram/utils/store')];
  const Store = require('../miniprogram/utils/store');
  const local = Store.defaults();
  local.updatedAt = 500;
  local.settings.catSections[0].s = '09:00';
  local.settings.dogSections[0].s = '08:30';
  local.settings.sectionTimesUpdatedAt = { cat: 200, dog: 100 };
  const remote = Store.defaults();
  remote.updatedAt = 900;
  remote.settings.catSections[0].s = '08:30';
  remote.settings.dogSections[0].s = '09:30';
  remote.settings.sectionTimesUpdatedAt = { cat: 100, dog: 300 };

  const adopted = Store.adoptRemote(remote, local);

  assert.equal(adopted.settings.catSections[0].s, '09:00');
  assert.equal(adopted.settings.dogSections[0].s, '09:30');
  assert.deepEqual(adopted.settings.sectionTimesUpdatedAt, { cat: 200, dog: 300 });
  assert.ok(adopted.updatedAt > 900);
  assert.equal(values.get(Store.KEY).settings.catSections[0].s, '09:00');
  const reset = Store.reset();
  assert.ok(reset.settings.sectionTimesUpdatedAt.cat > 0);
  assert.ok(reset.settings.sectionTimesUpdatedAt.dog > 0);

  const versionedLocal = Store.defaults();
  versionedLocal.updatedAt = 500;
  versionedLocal.settings.catSections[0].s = '09:00';
  versionedLocal.settings.sectionTimesUpdatedAt = { cat: 200 };
  const unversionedRemote = Store.defaults();
  unversionedRemote.updatedAt = 900;
  unversionedRemote.settings.catSections[0].s = '08:30';
  unversionedRemote.settings.dogSections[0].s = '09:30';
  const adoptedLegacyRoom = Store.adoptRemote(unversionedRemote, versionedLocal);
  assert.equal(adoptedLegacyRoom.settings.catSections[0].s, '09:00');
  assert.equal(adoptedLegacyRoom.settings.dogSections[0].s, '09:30');

  const unversionedLocal = Store.defaults();
  unversionedLocal.updatedAt = 500;
  unversionedLocal.settings.catSections[0].s = '09:00';
  const newerLegacyRemote = Store.defaults();
  newerLegacyRemote.updatedAt = 900;
  newerLegacyRemote.settings.catSections[0].s = '08:30';
  const adoptedUnversioned = Store.adoptRemote(newerLegacyRemote, unversionedLocal);
  assert.equal(adoptedUnversioned.settings.catSections[0].s, '08:30');
  delete global.wx;
});
